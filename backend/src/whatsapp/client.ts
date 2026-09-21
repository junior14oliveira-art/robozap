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
import {
  restoreSessionFromDb,
  syncSessionFilesToDb,
  clearAllAuthKeysFromDb,
} from './sessionStore';

const prisma = new PrismaClient();

interface UserSessionState {
  socket: WASocket | null;
  isConnecting: boolean;
  currentQrCode: string | null;
  reconnectTimeout: NodeJS.Timeout | null;
}

// Multi-tenant socket map por userId
const userSessions = new Map<string, UserSessionState>();

function getSession(userId: string): UserSessionState {
  let state = userSessions.get(userId);
  if (!state) {
    state = {
      socket: null,
      isConnecting: false,
      currentQrCode: null,
      reconnectTimeout: null,
    };
    userSessions.set(userId, state);
  }
  return state;
}

const BASE_SESSION_DIR = path.resolve(process.env.SESSION_DIR || './sessions');

export function getUserSessionDir(userId: string): string {
  // Limpa caracteres especiais do userId para o sistema de arquivos
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(BASE_SESSION_DIR, safeId);
}

export function getWASocket(userId: string = 'default'): WASocket | null {
  return userSessions.get(userId)?.socket || null;
}

export function isWhatsAppConnected(userId: string = 'default'): boolean {
  const sock = userSessions.get(userId)?.socket;
  return sock !== null && sock !== undefined && (sock as any).user !== undefined;
}

export function getCurrentQrCode(userId: string = 'default'): string | null {
  return userSessions.get(userId)?.currentQrCode || null;
}

/**
 * Emite eventos tanto para a sala do usuário quanto para o broadcast com sufixo do userId
 */
function emitToUser(io: SocketIOServer, userId: string, event: string, payload: any) {
  io.to(`user:${userId}`).emit(event, { ...payload, userId });
  io.emit(`${event}:${userId}`, { ...payload, userId });
  // Broadcast geral com userId anexado
  io.emit(event, { ...payload, userId });
}

/**
 * Inicializa a instância Baileys de um usuário específico
 */
export async function initWhatsAppClient(
  io: SocketIOServer,
  userId: string = 'default',
  force = false
): Promise<void> {
  const session = getSession(userId);

  if (isWhatsAppConnected(userId)) {
    const phone = session.socket?.user?.id?.split(':')[0] || 'unknown';
    emitToUser(io, userId, 'whatsapp:status', {
      status: 'connected',
      phone,
      message: `Conectado como ${phone}`,
    });
    return;
  }

  if (session.isConnecting && !force) {
    logger.warn({ userId }, 'WhatsApp client already initializing for user...');
    if (session.currentQrCode) {
      emitToUser(io, userId, 'whatsapp:qr', { qr: session.currentQrCode });
      emitToUser(io, userId, 'whatsapp:status', {
        status: 'qr_ready',
        message: 'Escaneie o QR Code para conectar',
      });
    }
    return;
  }

  if (force && session.socket) {
    try {
      session.socket.end(undefined);
    } catch (_) {}
    session.socket = null;
    session.currentQrCode = null;
  }

  session.isConnecting = true;

  if (session.reconnectTimeout) {
    clearTimeout(session.reconnectTimeout);
    session.reconnectTimeout = null;
  }

  const userDir = getUserSessionDir(userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  // Restaura credenciais do Supabase caso o disco tenha sido limpo (ex: reinício/sleep do Render)
  if (!fs.existsSync(path.join(userDir, 'creds.json'))) {
    await restoreSessionFromDb(userId, userDir);
  }

  const { state, saveCreds: baseSaveCreds } = await useMultiFileAuthState(userDir);
  const saveCreds = async () => {
    await baseSaveCreds();
    syncSessionFilesToDb(userId, userDir).catch(() => {});
  };
  const { version } = await fetchLatestBaileysVersion();

  logger.info({ userId, version }, '📱 Initializing Baileys WhatsApp client for user');

  const sock = makeWASocket({
    version,
    logger: logger.child({ module: `baileys-${userId}` }) as any,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger.child({ module: `keys-${userId}` }) as any),
    },
    generateHighQualityLinkPreview: false,
    browser: Browsers.windows('Desktop'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    getMessage: async () => undefined,
  });

  session.socket = sock;

  // ── Connection state updates ──────────────────────────────────────────────
  sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    // QR Code generated
    if (qr) {
      logger.info({ userId }, '📲 QR Code generated, scan it to connect WhatsApp');
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 300 });
        session.currentQrCode = qrDataUrl;
        emitToUser(io, userId, 'whatsapp:qr', { qr: qrDataUrl });
        emitToUser(io, userId, 'whatsapp:status', {
          status: 'qr_ready',
          message: 'Escaneie o QR Code para conectar',
        });
      } catch (err) {
        logger.error({ err, userId }, 'Failed to generate QR Code image');
      }

      try {
        await prisma.whatsAppSession.upsert({
          where: { userId },
          create: { userId, status: 'qr_ready' },
          update: { status: 'qr_ready' },
        });
      } catch (_e) {}
    }

    if (connection === 'open') {
      session.isConnecting = false;
      session.currentQrCode = null;
      const phone = sock.user?.id?.split(':')[0] || 'unknown';
      logger.info({ userId, phone }, '✅ WhatsApp connected successfully for user!');

      // Sincroniza credenciais válidas e chaves com o Supabase
      syncSessionFilesToDb(userId, userDir).catch(() => {});

      emitToUser(io, userId, 'whatsapp:status', {
        status: 'connected',
        phone,
        message: `Conectado como ${phone}`,
      });

      try {
        await prisma.whatsAppSession.upsert({
          where: { userId },
          create: { userId, status: 'connected', phone },
          update: { status: 'connected', phone },
        });
      } catch (_e) {}
    }

    if (connection === 'close') {
      session.isConnecting = false;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      logger.warn({ userId, statusCode, isLoggedOut }, '⚠️ WhatsApp connection closed for user');

      if (isLoggedOut) {
        logger.info({ userId }, '🗑️ Sessão encerrada pelo usuário/WhatsApp (Logout). Limpando sessão...');
        session.socket = null;
        session.currentQrCode = null;
        clearUserSession(userId);

        emitToUser(io, userId, 'whatsapp:status', {
          status: 'disconnected',
          message: 'Sessão encerrada. Escaneie o QR Code novamente.',
          shouldReconnect: false,
        });

        try {
          await prisma.whatsAppSession.upsert({
            where: { userId },
            create: { userId, status: 'disconnected', phone: null },
            update: { status: 'disconnected', phone: null },
          });
        } catch (_e) {}
      } else {
        const delayMs = statusCode === DisconnectReason.restartRequired ? 1000 : 2500;
        logger.info({ userId, statusCode, delayMs }, `🔄 Reconectando WhatsApp do usuário em ${delayMs}ms...`);

        emitToUser(io, userId, 'whatsapp:status', {
          status: 'connecting',
          message:
            statusCode === DisconnectReason.restartRequired
              ? 'Autenticando sessão com o WhatsApp...'
              : 'Reconectando ao WhatsApp...',
          shouldReconnect: true,
        });

        try {
          await prisma.whatsAppSession.upsert({
            where: { userId },
            create: { userId, status: 'connecting' },
            update: { status: 'connecting' },
          });
        } catch (_e) {}

        if (session.reconnectTimeout) clearTimeout(session.reconnectTimeout);
        session.reconnectTimeout = setTimeout(() => {
          initWhatsAppClient(io, userId);
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

        logger.info({ userId, phone, text }, '🛑 Opt-out detectado! Registrando blacklist anti-ban.');

        try {
          await prisma.optOutContact.upsert({
            where: {
              userId_phone: {
                userId,
                phone,
              },
            },
            create: { userId, phone, reason: `Solicitado via WhatsApp: "${text.trim()}"` },
            update: { reason: `Atualizado via WhatsApp: "${text.trim()}"` },
          });
        } catch (_e) {}

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
 * Desconecta e remove a sessão do WhatsApp do usuário
 */
export async function logoutWhatsApp(io: SocketIOServer, userId: string = 'default'): Promise<void> {
  const session = getSession(userId);
  session.currentQrCode = null;
  session.isConnecting = false;

  if (session.reconnectTimeout) {
    clearTimeout(session.reconnectTimeout);
    session.reconnectTimeout = null;
  }

  if (session.socket) {
    try {
      await session.socket.logout();
    } catch (_) {}
    session.socket = null;
  }

  clearUserSession(userId);

  try {
    await prisma.whatsAppSession.upsert({
      where: { userId },
      create: { userId, status: 'disconnected', phone: null },
      update: { status: 'disconnected', phone: null },
    });
  } catch (_e) {}

  emitToUser(io, userId, 'whatsapp:status', {
    status: 'disconnected',
    message: 'Desconectado com sucesso.',
  });

  logger.info({ userId }, 'WhatsApp logged out and session cleared');
}

function clearUserSession(userId: string): void {
  const dir = getUserSessionDir(userId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    logger.info({ userId, dir }, 'User session directory cleared');
  }
  clearAllAuthKeysFromDb(userId).catch(() => {});
}

/**
 * Restaura automaticamente todas as sessões que estavam ativas no banco ou com credenciais salvas
 */
export async function restoreAllActiveSessions(io: SocketIOServer): Promise<void> {
  try {
    const sessionsWithCreds = await prisma.whatsAppAuthKey.findMany({
      where: { key: 'creds.json' },
      select: { userId: true },
    });
    const userIds = new Set(sessionsWithCreds.map((s) => s.userId));

    const activeDbSessions = await prisma.whatsAppSession.findMany({
      where: { status: 'connected' },
      select: { userId: true },
    });
    activeDbSessions.forEach((s) => userIds.add(s.userId));

    for (const userId of userIds) {
      const dir = getUserSessionDir(userId);
      const restored = await restoreSessionFromDb(userId, dir);
      const hasLocalCreds = fs.existsSync(path.join(dir, 'creds.json'));

      if (restored || hasLocalCreds) {
        logger.info({ userId }, '🔄 Restaurando sessão persistida do WhatsApp...');
        initWhatsAppClient(io, userId).catch((err) => {
          logger.warn({ userId, err: err.message }, 'Falha ao restaurar sessão');
        });
      } else {
        await prisma.whatsAppSession.upsert({
          where: { userId },
          create: { userId, status: 'disconnected', phone: null },
          update: { status: 'disconnected', phone: null },
        }).catch(() => {});
      }
    }
  } catch (err: any) {
    logger.error({ err: err.message }, 'Erro ao restaurar sessões ativas do WhatsApp');
  }
}
