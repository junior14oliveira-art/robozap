import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { MessageJobData } from './messageQueue';
import { getWASocket, isWhatsAppConnected } from '../whatsapp/client';
import { randomizeImageBuffer } from '../services/campaignService';
import { logger } from '../index';

const prisma = new PrismaClient();
let globalIo: SocketIOServer | null = null;

/**
 * Simula indicador de digitação (ou gravação) com duração proporcional
 * para emular presença humana realista no WhatsApp.
 */
async function simulateTyping(phone: string, messageLength: number): Promise<void> {
  const sock = getWASocket();
  if (!sock) return;

  const jid = `${phone}@s.whatsapp.net`;
  const typingDuration = Math.min(
    Math.max(messageLength * 45, 1800), // ~45ms por caractere, mínimo 1.8s
    7500 // máximo 7.5s
  );

  try {
    await sock.sendPresenceUpdate('composing', jid);
    await sleep(typingDuration);
    await sock.sendPresenceUpdate('paused', jid);
  } catch (_err) {
    // Não-crítico: ignora caso falhe
  }
}

/**
 * Normaliza número para formato internacional seguro.
 */
function normalizePhone(raw: string): string {
  let phone = raw.toString().replace(/\D/g, '');

  if (phone.startsWith('0')) {
    phone = phone.substring(1);
  }

  if (phone.length <= 11) {
    phone = `55${phone}`;
  }

  return phone;
}

/**
 * Determina o mimetype do arquivo de imagem
 */
function getImageMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Verifica flags de pausa ou cancelamento diretamente no banco.
 */
async function checkCampaignFlags(campaignId: string): Promise<{
  paused: boolean;
  cancelled: boolean;
}> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  return {
    paused: campaign?.status === 'paused',
    cancelled: campaign?.status === 'cancelled',
  };
}

/**
 * Aguarda retomada da campanha se estiver pausada.
 */
async function waitForResume(campaignId: string): Promise<boolean> {
  logger.info({ campaignId }, '⏸️ Campanha pausada, aguardando retomada...');
  while (true) {
    await sleep(3000);
    const { paused, cancelled } = await checkCampaignFlags(campaignId);
    if (cancelled) return false;
    if (!paused) return true;
  }
}

/**
 * Processador principal de mensagens com suporte a Fotos e Blindagem Anti-Ban.
 */
export async function executeMessageJob(jobData: MessageJobData): Promise<void> {
  const io = globalIo;
  const {
    campaignId,
    contactId,
    phone,
    message,
    mediaUrl,
    randomizeMedia,
    index,
    totalContacts,
    isBatchCooldown,
  } = jobData;

  const startTime = Date.now();

  // Emite notificação caso esteja aplicando resfriamento de lote (Batch Cooling)
  if (isBatchCooldown && io) {
    io.emit(`campaign:${campaignId}:cooldown`, {
      message: '🧊 Resfriamento de lote anti-ban ativo (pausa preventiva)...',
      index,
    });
  }

  logger.info({ campaignId, phone, index }, `📤 Processando contato ${index + 1}/${totalContacts}`);

  // ── Checagem de pausa / cancelamento ──────────────────────────────────────
  const { paused, cancelled } = await checkCampaignFlags(campaignId);
  if (cancelled) {
    logger.info({ campaignId }, 'Campanha cancelada, ignorando disparo.');
    return;
  }
  if (paused) {
    const resumed = await waitForResume(campaignId);
    if (!resumed) {
      logger.info({ campaignId }, 'Campanha cancelada durante a pausa.');
      return;
    }
  }

  // ── Checagem de Blacklist / Opt-Out preventivo ───────────────────────────
  const normalizedPhone = normalizePhone(phone);
  const isOptedOut = await prisma.optOutContact.findUnique({
    where: { phone: normalizedPhone },
  });

  if (isOptedOut) {
    logger.info({ campaignId, phone: normalizedPhone }, '🛑 Contato solicitou Opt-Out. Disparo cancelado preventivamente.');
    await prisma.contact.update({
      where: { id: contactId },
      data: { status: 'skipped', errorMsg: 'Opt-out (solicitou SAIR)' },
    });
    return;
  }

  // ── Checagem de conexão com o WhatsApp ───────────────────────────────────
  if (!isWhatsAppConnected()) {
    io?.emit('whatsapp:status', {
      status: 'disconnected',
      message: 'WhatsApp desconectado durante o disparo! Reconecte o QR Code.',
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'paused' },
    });

    io?.emit(`campaign:${campaignId}:status`, { status: 'paused', reason: 'whatsapp_disconnected' });

    let waited = 0;
    while (!isWhatsAppConnected() && waited < 120000) {
      await sleep(3000);
      waited += 3000;
    }

    if (!isWhatsAppConnected()) {
      throw new Error('WhatsApp não reconectou após 120 segundos');
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'running' },
    });
  }

  const sock = getWASocket()!;

  // ── Verificação onWhatsApp prévia (evita erro e banimento com telefones fixos) ─
  let targetJid = `${normalizedPhone}@s.whatsapp.net`;
  try {
    const waCheck = await sock.onWhatsApp(normalizedPhone);
    if (waCheck && waCheck.length > 0 && waCheck[0]?.exists) {
      targetJid = waCheck[0].jid;
    } else {
      logger.warn({ campaignId, phone: normalizedPhone }, '⚠️ Número não possui conta no WhatsApp');
      await prisma.contact.update({
        where: { id: contactId },
        data: { status: 'failed', errorMsg: 'Número sem WhatsApp ativo' },
      });
      await prisma.messageLog.create({
        data: {
          campaignId,
          phone: normalizedPhone,
          message,
          mediaSent: false,
          status: 'failed',
          errorMsg: 'Número sem WhatsApp ativo',
          duration: Date.now() - startTime,
        },
      });

      const updatedCampaign = await prisma.campaign.update({
        where: { id: campaignId },
        data: { failedCount: { increment: 1 } },
      });

      const processed = updatedCampaign.sentCount + updatedCampaign.failedCount;
      const percent = Math.round((processed / totalContacts) * 100);

      io?.emit(`campaign:${campaignId}:progress`, {
        sent: updatedCampaign.sentCount,
        failed: updatedCampaign.failedCount,
        total: totalContacts,
        percent,
        lastPhone: normalizedPhone,
        lastError: 'Número sem WhatsApp',
      });

      if (processed >= totalContacts) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'completed', completedAt: new Date() },
        });
        io?.emit(`campaign:${campaignId}:status`, { status: 'completed' });
      }

      return;
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Consulta onWhatsApp indisponível, prosseguindo com envio direto');
  }

  // ── Simulação de Digitação Humanizada ──────────────────────────────────
  await simulateTyping(targetJid.split('@')[0], message.length);

  // ── Envio da Mensagem (Texto ou Foto com Legenda) ───────────────────────
  let mediaSent = false;

  // Resolve caminho da foto se houver
  let resolvedMediaPath: string | null = null;
  if (mediaUrl) {
    if (path.isAbsolute(mediaUrl) && fs.existsSync(mediaUrl)) {
      resolvedMediaPath = mediaUrl;
    } else {
      const relPath = path.resolve('.', mediaUrl.replace(/^\//, ''));
      if (fs.existsSync(relPath)) {
        resolvedMediaPath = relPath;
      }
    }
  }

  if (resolvedMediaPath && fs.existsSync(resolvedMediaPath)) {
    // 📸 Envio com Foto
    let fileBuffer: any = fs.readFileSync(resolvedMediaPath);

    // 🛡️ Blindagem Anti-Ban: Gera Hash SHA-256 único por foto enviada
    if (randomizeMedia !== false) {
      fileBuffer = randomizeImageBuffer(fileBuffer);
    }

    const mime = getImageMime(resolvedMediaPath);

    await sock.sendMessage(targetJid, {
      image: fileBuffer as any,
      caption: message, // Legenda com variáveis e spintax
      mimetype: mime,
    });
    mediaSent = true;
    logger.info({ campaignId, phone: normalizedPhone }, '📸 Foto enviada com sucesso (Hash único anti-ban)');
  } else {
    // 💬 Envio apenas de Texto
    await sock.sendMessage(targetJid, { text: message });
  }

  const duration = Date.now() - startTime;

  // ── Atualiza status do contato ──────────────────────────────────────────
  await prisma.contact.update({
    where: { id: contactId },
    data: { status: 'sent', sentAt: new Date() },
  });

  // ── Salva log detalhado ────────────────────────────────────────────────
  await prisma.messageLog.create({
    data: {
      campaignId,
      phone: normalizedPhone,
      message,
      mediaSent,
      status: 'sent',
      duration,
    },
  });

  // ── Atualiza histórico permanente no SavedContact ─────────────────────────
  try {
    await prisma.savedContact.upsert({
      where: { phone: normalizedPhone },
      create: {
        phone: normalizedPhone,
        totalSent: 1,
        lastSentAt: new Date(),
      },
      update: {
        totalSent: { increment: 1 },
        lastSentAt: new Date(),
      },
    });
  } catch (_e) {}

  // ── Atualiza contadores da campanha ────────────────────────────────────
  const updatedCampaign = await prisma.campaign.update({
    where: { id: campaignId },
    data: { sentCount: { increment: 1 } },
  });

  const processed = updatedCampaign.sentCount + updatedCampaign.failedCount;
  const percent = Math.round((processed / totalContacts) * 100);

  if (processed >= totalContacts) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'completed', completedAt: new Date() },
    });

    if (io) {
      io.emit(`campaign:${campaignId}:status`, { status: 'completed' });
      io.emit(`campaign:${campaignId}:progress`, {
        sent: updatedCampaign.sentCount,
        failed: updatedCampaign.failedCount,
        total: totalContacts,
        percent: 100,
        status: 'completed',
      });
    }

    logger.info({ campaignId }, '✅ Campanha de disparos concluída com sucesso!');
    return;
  }

  // ── Emite progresso em tempo real via Socket.io ─────────────────────────
  if (io) {
    io.emit(`campaign:${campaignId}:progress`, {
      sent: updatedCampaign.sentCount,
      failed: updatedCampaign.failedCount,
      total: totalContacts,
      percent,
      lastPhone: normalizedPhone,
      mediaSent,
    });
  }
}

/**
 * Inicialização do worker com referência do Socket.io.
 */
export function initWorker(io: SocketIOServer): void {
  globalIo = io;
  logger.info('🔧 Motor de Disparos Ativo com Blindagem Anti-Ban (Typing, Spintax, Hash SHA-256 e Opt-Out)');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
