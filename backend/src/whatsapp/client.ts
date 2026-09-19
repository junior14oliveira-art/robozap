import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  WASocket,
  ConnectionState,
} from 'baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import QRCode from 'qrcode';
import { logger } from '../index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Singleton socket instance
let waSocket: WASocket | null = null;
let isConnecting = false;
let reconnectTimeout: NodeJS.Timeout | null = null;

const SESSION_DIR = path.resolve(
  process.env.SESSION_DIR || './sessions',
  'default'
);

export function getWASocket(): WASocket | null {
  return waSocket;
}

export function isWhatsAppConnected(): boolean {
  return waSocket !== null && (waSocket as any).user !== undefined;
}

/**
 * Initialize the WhatsApp Baileys client.
 * Handles QR Code generation, session persistence, and reconnection logic.
 */
export async function initWhatsAppClient(io: SocketIOServer): Promise<void> {
  if (isConnecting) {
    logger.warn('WhatsApp client already initializing, skipping...');
    return;
  }

  isConnecting = true;

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  // Ensure session directory exists
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  logger.info({ version }, '📱 Initializing Baileys WhatsApp client');

  const sock = makeWASocket({
    version,
    logger: logger.child({ module: 'baileys' }) as any,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger.child({ module: 'keys' }) as any),
    },
    generateHighQualityLinkPreview: false,
    // Emula Windows Desktop oficial para evitar rejeição e banimento
    browser: Browsers.windows('Desktop'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    getMessage: async () => undefined,
  });

  waSocket = sock;

  // ── Connection state updates ──────────────────────────────────────────────
  sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    // QR Code generated
    if (qr) {
      logger.info('📲 QR Code generated, scan it to connect WhatsApp');
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 300 });
        io.emit('whatsapp:qr', { qr: qrDataUrl });
        io.emit('whatsapp:status', { status: 'qr_ready', message: 'Escaneie o QR Code para conectar' });
      } catch (err) {
        logger.error({ err }, 'Failed to generate QR Code image');
      }

      // Update DB
      await prisma.whatsAppSession.upsert({
        where: { id: 'default' },
        create: { id: 'default', status: 'connecting' },
        update: { status: 'connecting' },
      });
    }

    if (connection === 'open') {
      isConnecting = false;
      const phone = sock.user?.id?.split(':')[0] || 'unknown';
      logger.info({ phone }, '✅ WhatsApp connected successfully!');

      io.emit('whatsapp:status', {
        status: 'connected',
        phone,
        message: `Conectado como ${phone}`,
      });

      await prisma.whatsAppSession.upsert({
        where: { id: 'default' },
        create: { id: 'default', status: 'connected', phone },
        update: { status: 'connected', phone },
      });
    }

    if (connection === 'close') {
      isConnecting = false;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      logger.warn({ statusCode, isLoggedOut }, '⚠️ WhatsApp connection closed');

      if (isLoggedOut) {
        logger.info('🗑️ Sessão encerrada pelo usuário/WhatsApp (Logout). Limpando sessão...');
        waSocket = null;
        clearSession();

        io.emit('whatsapp:status', {
          status: 'disconnected',
          message: 'Sessão encerrada. Escaneie o QR Code novamente.',
          shouldReconnect: false,
        });

        await prisma.whatsAppSession.upsert({
          where: { id: 'default' },
          create: { id: 'default', status: 'disconnected', phone: null },
          update: { status: 'disconnected', phone: null },
        });
      } else {
        // Reconexão automática necessária (ex: 515 restartRequired após escanear QR, 428, 408, 503)
        const delayMs = statusCode === DisconnectReason.restartRequired ? 1000 : 2500;
        logger.info({ statusCode, delayMs }, `🔄 Reconectando WhatsApp em ${delayMs}ms...`);

        // Não apaga o telefone do banco nem joga a UI para desconectado!
        io.emit('whatsapp:status', {
          status: 'connecting',
          message: statusCode === DisconnectReason.restartRequired
            ? 'Autenticando sessão com o WhatsApp...'
            : 'Reconectando ao WhatsApp...',
          shouldReconnect: true,
        });

        await prisma.whatsAppSession.upsert({
          where: { id: 'default' },
          create: { id: 'default', status: 'connecting' },
          update: { status: 'connecting' },
        });

        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          initWhatsAppClient(io);
        }, delayMs);
      }
    }
  });

  // ── Auto Opt-Out / Anti-Denúncia Listener ────────────────────────────────
  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    for (const msg of m.messages) {
      if (msg.key.fromMe) continue;
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const clean = text.trim().toUpperCase();

      if (clean === 'SAIR' || clean === 'PARAR' || clean === 'CANCELAR' || clean === 'DESCADASTRAR') {
        const remoteJid = msg.key.remoteJid;
        if (!remoteJid) continue;
        const phone = remoteJid.split('@')[0];

        logger.info({ phone, text }, '🛑 Opt-out detectado! Registrando blacklist anti-ban.');

        await prisma.optOutContact.upsert({
          where: { phone },
          create: { phone, reason: `Solicitado via WhatsApp: "${text.trim()}"` },
          update: { reason: `Atualizado via WhatsApp: "${text.trim()}"` },
        });

        // Responde cordialmente para evitar denúncias manuais
        try {
          await sock.sendMessage(remoteJid, {
            text: '✅ Seu número foi removido com sucesso. Você não receberá novas mensagens.',
          });
        } catch (_) {}
      }
    }
  });

  // ── Credential updates ────────────────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);
}

/**
 * Disconnect and clear WhatsApp session.
 */
export async function logoutWhatsApp(io: SocketIOServer): Promise<void> {
  if (waSocket) {
    await waSocket.logout();
    waSocket = null;
  }
  clearSession();
  io.emit('whatsapp:status', { status: 'disconnected', message: 'Desconectado com sucesso.' });
  logger.info('WhatsApp logged out and session cleared');
}

function clearSession(): void {
  if (fs.existsSync(SESSION_DIR)) {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    logger.info('Session directory cleared');
  }
}
