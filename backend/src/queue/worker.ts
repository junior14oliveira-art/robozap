import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { MessageJobData, cancelCampaignJobs } from './messageQueue';
import { getWASocket, isWhatsAppConnected } from '../whatsapp/client';
import { randomizeImageBuffer } from '../services/campaignService';
import { logger } from '../index';
import { prisma } from '../prisma';

let globalIo: SocketIOServer | null = null;

class OperationTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new OperationTimeoutError(`Timeout de ${ms}ms em ${label}`)),
      ms
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/**
 * Simula indicador de digitação com duração proporcional
 * para emular presença humana realista no WhatsApp.
 */
async function simulateTyping(userId: string, phone: string, messageLength: number): Promise<void> {
  const sock = getWASocket(userId);
  if (!sock) return;

  const jid = `${phone}@s.whatsapp.net`;
  const typingDuration = Math.min(
    Math.max(messageLength * 45, 1800), // ~45ms por caractere, mínimo 1.8s
    7500 // máximo 7.5s
  );

  try {
    await withTimeout(sock.sendPresenceUpdate('composing', jid), 10000, 'sendPresenceUpdate composing');
    await sleep(typingDuration);
    await withTimeout(sock.sendPresenceUpdate('paused', jid), 10000, 'sendPresenceUpdate paused');
  } catch (_err) {
    // Ignora caso falhe
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
 * Aguarda retomada da campanha se estiver pausada (com teto de 30 minutos).
 */
async function waitForResume(campaignId: string): Promise<boolean> {
  logger.info({ campaignId }, '⏸️ Campanha pausada, aguardando retomada...');
  let iterations = 0;
  const MAX_ITERATIONS = 600; // 30 minutos (600 x 3s)
  while (iterations < MAX_ITERATIONS) {
    await sleep(3000);
    iterations++;
    const { paused, cancelled } = await checkCampaignFlags(campaignId);
    if (cancelled) return false;
    if (!paused) return true;
  }
  logger.warn({ campaignId }, '⚠️ Tempo limite de espera de pausa atingido (30 minutos). Encerrando espera.');
  return false;
}

/**
 * Processador principal de mensagens com suporte a Fotos e Blindagem Anti-Ban.
 */
export async function executeMessageJob(jobData: MessageJobData): Promise<void> {
  const io = globalIo;
  const {
    userId,
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
    io.to(`campaign:${campaignId}`).emit(`campaign:${campaignId}:cooldown`, {
      message: '🧊 Resfriamento de lote anti-ban ativo (pausa preventiva)...',
      index,
    });
  }

  logger.info({ campaignId, userId, phone, index }, `📤 Processando contato ${index + 1}/${totalContacts}`);

  // ── Checagem de pausa / cancelamento ──────────────────────────────────────
  const { paused, cancelled } = await checkCampaignFlags(campaignId);
  if (cancelled) {
    logger.info({ campaignId }, '🚫 Campanha cancelada no banco, interrompendo fila e runner imediatamente.');
    await cancelCampaignJobs(campaignId);
    return;
  }
  if (paused) {
    const resumed = await waitForResume(campaignId);
    if (!resumed) {
      logger.info({ campaignId }, '🚫 Campanha cancelada durante a pausa, interrompendo runner.');
      await cancelCampaignJobs(campaignId);
      return;
    }
  }

  // ── Checagem de Blacklist / Opt-Out preventivo ───────────────────────────
  const normalizedPhone = normalizePhone(phone);
  const isOptedOut = await prisma.optOutContact.findUnique({
    where: {
      userId_phone: {
        userId,
        phone: normalizedPhone,
      },
    },
  });

  if (isOptedOut) {
    logger.info({ campaignId, userId, phone: normalizedPhone }, '🛑 Contato solicitou Opt-Out. Disparo cancelado.');
    await prisma.contact.update({
      where: { id: contactId },
      data: { status: 'skipped', errorMsg: 'Opt-out (solicitou SAIR)' },
    });
    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: { failedCount: { increment: 1 } },
    });
    const processed = updatedCampaign.sentCount + updatedCampaign.failedCount;
    const percent = Math.min(Math.round((processed / totalContacts) * 100), 100);
    io?.to(`campaign:${campaignId}`).emit(`campaign:${campaignId}:progress`, {
      sent: updatedCampaign.sentCount,
      failed: updatedCampaign.failedCount,
      total: totalContacts,
      percent,
      lastPhone: normalizedPhone,
      lastError: 'Opt-out (solicitou SAIR)',
    });
    if (processed >= totalContacts) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'completed', completedAt: new Date() },
      });
      io?.to(`campaign:${campaignId}`).emit(`campaign:${campaignId}:status`, { status: 'completed' });
    }
    return;
  }

  // ── Trava Inteligente Anti-Spam Diária (Mesmo Dia) ───────────────────────
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const savedContact = await prisma.savedContact.findUnique({
    where: {
      userId_phone: {
        userId,
        phone: normalizedPhone,
      },
    },
    select: { lastSentAt: true },
  });

  if (savedContact?.lastSentAt && savedContact.lastSentAt >= startOfDay) {
    logger.info(
      { campaignId, userId, phone: normalizedPhone, lastSentAt: savedContact.lastSentAt },
      '🛡️ Trava diária anti-spam: número já recebeu mensagem hoje. Ignorando envio para proteger o chip.'
    );
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        status: 'skipped',
        errorMsg: 'Já contatado hoje (trava de segurança diária anti-spam)',
      },
    });
    await prisma.messageLog.create({
      data: {
        campaignId,
        phone: normalizedPhone,
        message,
        mediaSent: false,
        status: 'failed',
        errorMsg: 'Já contatado hoje (trava de segurança diária anti-spam)',
        duration: 0,
      },
    });
    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: { failedCount: { increment: 1 } },
    });
    const processed = updatedCampaign.sentCount + updatedCampaign.failedCount;
    const percent = Math.min(Math.round((processed / totalContacts) * 100), 100);
    io?.to(`campaign:${campaignId}`).emit(`campaign:${campaignId}:progress`, {
      sent: updatedCampaign.sentCount,
      failed: updatedCampaign.failedCount,
      total: totalContacts,
      percent,
      lastPhone: normalizedPhone,
      lastError: 'Já contatado hoje (ignorado)',
    });
    if (processed >= totalContacts) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'completed', completedAt: new Date() },
      });
      io?.to(`campaign:${campaignId}`).emit(`campaign:${campaignId}:status`, { status: 'completed' });
    }
    return;
  }

  // ── Checagem de conexão com o WhatsApp do usuário ────────────────────────
  if (!isWhatsAppConnected(userId)) {
    if (io) {
      io.to(`user:${userId}`).emit('whatsapp:status', {
        status: 'disconnected',
        message: 'WhatsApp desconectado durante o disparo! Reconecte o QR Code.',
      });
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'paused' },
    });

    io?.to(`campaign:${campaignId}`).emit(`campaign:${campaignId}:status`, { status: 'paused', reason: 'whatsapp_disconnected' });

    let waited = 0;
    while (!isWhatsAppConnected(userId) && waited < 120000) {
      await sleep(3000);
      waited += 3000;
    }

    if (!isWhatsAppConnected(userId)) {
      throw new Error('WhatsApp não reconectou após 120 segundos');
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'running' },
    });
  }

  const sock = getWASocket(userId)!;

  // ── Verificação onWhatsApp prévia ─────────────────────────────────────────
  let targetJid = `${normalizedPhone}@s.whatsapp.net`;
  try {
    logger.info({ campaignId, userId, phone: normalizedPhone, index }, '➡️ onWhatsApp iniciado');
    const waCheck = await withTimeout(sock.onWhatsApp(normalizedPhone), 20000, 'onWhatsApp');
    logger.info({ campaignId, userId, phone: normalizedPhone, index }, '✅ onWhatsApp concluído');
    if (waCheck && waCheck.length > 0 && waCheck[0]?.exists) {
      targetJid = waCheck[0].jid;
    } else {
      logger.warn({ campaignId, userId, phone: normalizedPhone }, '⚠️ Número não possui conta no WhatsApp');
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

      io?.to(`campaign:${campaignId}`).emit(`campaign:${campaignId}:progress`, {
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
        io?.to(`campaign:${campaignId}`).emit(`campaign:${campaignId}:status`, { status: 'completed' });
      }

      return;
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Consulta onWhatsApp indisponível ou timeout, prosseguindo com envio direto');
  }

  // ── Simulação de Digitação Humanizada ──────────────────────────────────
  await simulateTyping(userId, targetJid.split('@')[0], message.length);

  // ── Envio da Mensagem (Texto ou Foto com Legenda) ───────────────────────
  let mediaSent = false;

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

  try {
    logger.info({ campaignId, userId, phone: normalizedPhone, index }, '➡️ sendMessage iniciado');
    if (resolvedMediaPath && fs.existsSync(resolvedMediaPath)) {
      // 📸 Envio com Foto
      let fileBuffer: any = fs.readFileSync(resolvedMediaPath);

      if (randomizeMedia !== false) {
        fileBuffer = randomizeImageBuffer(fileBuffer);
      }

      const mime = getImageMime(resolvedMediaPath);

      await withTimeout(
        sock.sendMessage(targetJid, {
          image: fileBuffer as any,
          caption: message,
          mimetype: mime,
        }),
        60000,
        'sendMessage image'
      );
      mediaSent = true;
      logger.info({ campaignId, phone: normalizedPhone }, '📸 Foto enviada com sucesso (Hash único anti-ban)');
    } else {
      // 💬 Envio apenas de Texto
      await withTimeout(
        sock.sendMessage(targetJid, { text: message }),
        60000,
        'sendMessage text'
      );
    }
    logger.info({ campaignId, userId, phone: normalizedPhone, index }, '✅ sendMessage concluído');
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logger.error({ campaignId, phone: normalizedPhone, err: err.message }, '❌ Falha ao enviar mensagem no WhatsApp');

    await prisma.contact.update({
      where: { id: contactId },
      data: { status: 'failed', errorMsg: err.message || 'Falha no envio' },
    });

    await prisma.messageLog.create({
      data: {
        campaignId,
        phone: normalizedPhone,
        message,
        mediaSent,
        status: 'failed',
        errorMsg: err.message || 'Falha no envio',
        duration,
      },
    });

    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: { failedCount: { increment: 1 } },
    });

    const processed = updatedCampaign.sentCount + updatedCampaign.failedCount;
    const percent = Math.round((processed / totalContacts) * 100);

    io?.to(`campaign:${campaignId}`).emit(`campaign:${campaignId}:progress`, {
      sent: updatedCampaign.sentCount,
      failed: updatedCampaign.failedCount,
      total: totalContacts,
      percent,
      lastPhone: normalizedPhone,
      lastError: err.message || 'Falha no envio',
    });

    if (processed >= totalContacts) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'completed', completedAt: new Date() },
      });
      io?.to(`campaign:${campaignId}`).emit(`campaign:${campaignId}:status`, { status: 'completed' });
    }

    return;
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

  // ── Atualiza histórico permanente no SavedContact do usuário ─────────────
  try {
    await prisma.savedContact.upsert({
      where: {
        userId_phone: {
          userId,
          phone: normalizedPhone,
        },
      },
      create: {
        userId,
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
      io.to(`campaign:${campaignId}`).emit(`campaign:${campaignId}:status`, { status: 'completed' });
      io.to(`campaign:${campaignId}`).emit(`campaign:${campaignId}:progress`, {
        sent: updatedCampaign.sentCount,
        failed: updatedCampaign.failedCount,
        total: totalContacts,
        percent: 100,
        status: 'completed',
      });
    }

    logger.info({ campaignId, userId }, '✅ Campanha de disparos concluída com sucesso!');
    return;
  }

  // ── Emite progresso em tempo real via Socket.io ─────────────────────────
  if (io) {
    io.to(`campaign:${campaignId}`).emit(`campaign:${campaignId}:progress`, {
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
  logger.info('🔧 Motor de Disparos Multi-Tenant Ativo com Blindagem Anti-Ban');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
