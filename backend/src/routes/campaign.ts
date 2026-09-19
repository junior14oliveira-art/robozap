import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import {
  enqueueCampaign,
  pauseCampaignJobs,
  resumeCampaignJobs,
  cancelCampaignJobs,
} from '../queue/messageQueue';
import { processTemplate, randomizeImageBuffer } from '../services/campaignService';
import { normalizePhone } from '../services/spreadsheetService';
import { getWASocket, isWhatsAppConnected } from '../whatsapp/client';

const prisma = new PrismaClient();
export const campaignRouter = Router();

/**
 * GET /api/campaigns
 * List all campaigns with summary
 */
campaignRouter.get('/', async (_req: Request, res: Response) => {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { contacts: true } },
    },
  });
  res.json(campaigns);
});

/**
 * GET /api/campaigns/:id
 * Get campaign details with contacts
 */
campaignRouter.get('/:id', async (req: Request, res: Response) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: {
      contacts: { orderBy: { status: 'asc' }, take: 100 },
      logs: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });

  if (!campaign) {
    return res.status(404).json({ error: 'Campanha não encontrada.' });
  }

  return res.json(campaign);
});

/**
 * POST /api/campaigns/check-contacts
 * Analisa a lista antes do disparo:
 * 1. Remove contatos com telefones duplicados na lista
 * 2. Salva e sincroniza os contatos globalmente no sistema (SavedContact)
 * 3. Identifica contatos que já receberam mensagem em campanhas anteriores
 * 4. Identifica contatos na lista de Opt-Out (SAIR)
 */
campaignRouter.post('/check-contacts', async (req: Request, res: Response) => {
  const { contacts } = req.body;
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.json({
      totalReceived: 0,
      duplicatesInList: 0,
      uniqueCount: 0,
      alreadyContactedCount: 0,
      alreadyContactedPhones: [],
      optOutCount: 0,
      optOutPhones: [],
      newContactsCount: 0,
      uniqueContacts: [],
    });
  }

  const seen = new Set<string>();
  const uniqueContacts: any[] = [];
  let duplicatesCount = 0;

  for (const c of contacts) {
    const norm = normalizePhone(c.phone);
    if (!norm) continue;
    if (seen.has(norm)) {
      duplicatesCount++;
    } else {
      seen.add(norm);
      uniqueContacts.push({ ...c, phone: norm });
    }
  }

  const allPhones = Array.from(seen);

  // Salva no banco global SavedContact para memória permanente do SaaS
  await Promise.all(
    uniqueContacts.map((c) =>
      prisma.savedContact.upsert({
        where: { phone: c.phone },
        create: {
          phone: c.phone,
          name: c.name || null,
          company: c.company || null,
          variables: JSON.stringify(c),
        },
        update: {
          name: c.name || undefined,
          company: c.company || undefined,
          variables: JSON.stringify(c),
        },
      })
    )
  );

  // Consulta Opt-Out
  const optOuts = await prisma.optOutContact.findMany({
    where: { phone: { in: allPhones } },
    select: { phone: true },
  });
  const optOutPhones = optOuts.map((o) => o.phone);
  const optOutSet = new Set(optOutPhones);

  // Consulta quem já recebeu mensagem com sucesso anteriormente em qualquer campanha
  const sentLogs = await prisma.messageLog.findMany({
    where: { phone: { in: allPhones }, status: 'sent' },
    select: { phone: true },
  });
  const savedWithSent = await prisma.savedContact.findMany({
    where: { phone: { in: allPhones }, totalSent: { gt: 0 } },
    select: { phone: true },
  });
  const alreadyContactedPhones = Array.from(
    new Set([...sentLogs.map((l) => l.phone), ...savedWithSent.map((s) => s.phone)])
  );
  const alreadyContactedSet = new Set(alreadyContactedPhones);

  const newContactsCount = uniqueContacts.filter(
    (c) => !optOutSet.has(c.phone) && !alreadyContactedSet.has(c.phone)
  ).length;

  return res.json({
    totalReceived: contacts.length,
    duplicatesInList: duplicatesCount,
    uniqueCount: uniqueContacts.length,
    alreadyContactedCount: alreadyContactedPhones.length,
    alreadyContactedPhones,
    optOutCount: optOutPhones.length,
    optOutPhones,
    newContactsCount,
    uniqueContacts,
  });
});

/**
 * POST /api/campaigns
 * Create and start a new campaign
 * Body: { name, contacts: [{phone, name, ...vars}], messageTemplate, delayMin, delayMax, allowResend }
 */
campaignRouter.post('/', async (req: Request, res: Response) => {
  const io = (req as any).io;
  const {
    name,
    contacts,
    messageTemplate,
    mediaUrl,
    mediaType = 'image',
    delayMin = 15,
    delayMax = 45,
    batchSize = 20,
    batchPauseMin = 3,
    randomizeMedia = true,
    optOutFooter = true,
    allowResend = false, // Regra anti-duplicação: por padrão NÃO reenvia para quem já recebeu
  } = req.body;

  if (!name || !contacts || !messageTemplate) {
    return res.status(400).json({ error: 'name, contacts e messageTemplate são obrigatórios.' });
  }

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'A lista de contatos está vazia.' });
  }

  // 1. De-duplicação na lista enviada (evita mesmo telefone 2 vezes na campanha)
  const seenPhones = new Set<string>();
  const deduplicatedContacts: any[] = [];
  for (const c of contacts) {
    const norm = normalizePhone(c.phone);
    if (!norm) continue;
    if (!seenPhones.has(norm)) {
      seenPhones.add(norm);
      deduplicatedContacts.push({ ...c, phone: norm });
    }
  }

  const allPhones = Array.from(seenPhones);

  // 2. Salva e sincroniza contatos globalmente no SavedContact
  await Promise.all(
    deduplicatedContacts.map((c) =>
      prisma.savedContact.upsert({
        where: { phone: c.phone },
        create: {
          phone: c.phone,
          name: c.name || null,
          company: c.company || null,
          variables: JSON.stringify(c),
        },
        update: {
          name: c.name || undefined,
          company: c.company || undefined,
          variables: JSON.stringify(c),
        },
      })
    )
  );

  // 3. Consulta lista de Opt-Out para filtrar preventivamente
  const optOuts = await prisma.optOutContact.findMany({
    where: { phone: { in: allPhones } },
    select: { phone: true },
  });
  const optOutSet = new Set(optOuts.map((o) => o.phone));

  // 4. Se allowResend for falso, identifica quem já recebeu mensagem antes para NÃO mandar 2 vezes
  const alreadySentSet = new Set<string>();
  if (!allowResend) {
    const sentLogs = await prisma.messageLog.findMany({
      where: { phone: { in: allPhones }, status: 'sent' },
      select: { phone: true },
    });
    sentLogs.forEach((l) => alreadySentSet.add(l.phone));

    const savedWithSent = await prisma.savedContact.findMany({
      where: { phone: { in: allPhones }, totalSent: { gt: 0 } },
      select: { phone: true },
    });
    savedWithSent.forEach((s) => alreadySentSet.add(s.phone));
  }

  // Create campaign
  const campaign = await prisma.campaign.create({
    data: {
      name,
      messageTemplate,
      mediaUrl: mediaUrl || null,
      mediaType: mediaUrl ? mediaType : null,
      delayMin,
      delayMax,
      batchSize,
      batchPauseMin,
      randomizeMedia,
      optOutFooter,
      totalContacts: deduplicatedContacts.length,
      status: 'running',
      startedAt: new Date(),
    },
  });

  // Create contacts and compute their status
  const createdContacts = await Promise.all(
    deduplicatedContacts.map((c: Record<string, string>) => {
      const isBlacklisted = optOutSet.has(c.phone);
      const isAlreadyContacted = !allowResend && alreadySentSet.has(c.phone);

      let status = 'pending';
      let errorMsg: string | null = null;

      if (isBlacklisted) {
        status = 'opted_out';
        errorMsg = 'Opt-Out (solicitou SAIR)';
      } else if (isAlreadyContacted) {
        status = 'skipped';
        errorMsg = 'Já contatado anteriormente (reenvio desabilitado)';
      }

      return prisma.contact.create({
        data: {
          campaignId: campaign.id,
          phone: c.phone,
          name: c.name || null,
          variables: JSON.stringify(c),
          status,
          errorMsg,
        },
      });
    })
  );

  // Filtra apenas os contatos que realmente devem ser disparados
  const activeContacts = createdContacts.filter((c) => c.status === 'pending');
  const skippedCount = createdContacts.filter((c) => c.status === 'skipped').length;
  const optedOutCount = createdContacts.filter((c) => c.status === 'opted_out').length;

  // Build personalized messages for each contact (com Spintax, variáveis e Opt-Out footer)
  const jobContacts = activeContacts.map((contact) => {
    const rawContact = deduplicatedContacts.find((c: any) => c.phone === contact.phone) || {};
    return {
      id: contact.id,
      phone: contact.phone,
      message: processTemplate(messageTemplate, rawContact, { optOutFooter }),
      mediaUrl: mediaUrl || null,
      mediaType,
      randomizeMedia,
    };
  });

  // Enqueue messages
  if (jobContacts.length > 0) {
    await enqueueCampaign({
      campaignId: campaign.id,
      contacts: jobContacts,
      delayMin,
      delayMax,
      batchSize,
      batchPauseMin,
    });
  } else {
    // Se todos foram ignorados por já terem sido contatados
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'completed', completedAt: new Date() },
    });
  }

  // Emit real-time event
  io.emit('campaign:created', {
    campaignId: campaign.id,
    name,
    total: deduplicatedContacts.length,
    active: jobContacts.length,
    skipped: skippedCount,
    hasMedia: !!mediaUrl,
  });

  return res.status(201).json({
    campaign,
    totalReceived: contacts.length,
    totalDeduplicated: deduplicatedContacts.length,
    enqueuedCount: jobContacts.length,
    skippedCount,
    optedOutCount,
    message: `Campanha criada! ${jobContacts.length} contatos prontos para envio${
      skippedCount > 0 ? ` (${skippedCount} já haviam recebido mensagem e foram preservados)` : ''
    }.`,
  });
});

/**
 * POST /api/campaigns/:id/pause
 */
campaignRouter.post('/:id/pause', async (req: Request, res: Response) => {
  const io = (req as any).io;
  const { id } = req.params;

  await pauseCampaignJobs(id);
  await prisma.campaign.update({ where: { id }, data: { status: 'paused' } });
  io.emit(`campaign:${id}:status`, { status: 'paused' });

  res.json({ message: 'Campanha pausada.' });
});

/**
 * POST /api/campaigns/:id/resume
 */
campaignRouter.post('/:id/resume', async (req: Request, res: Response) => {
  const io = (req as any).io;
  const { id } = req.params;

  await resumeCampaignJobs(id);
  await prisma.campaign.update({ where: { id }, data: { status: 'running' } });
  io.emit(`campaign:${id}:status`, { status: 'running' });

  res.json({ message: 'Campanha retomada.' });
});

/**
 * POST /api/campaigns/:id/cancel
 */
campaignRouter.post('/:id/cancel', async (req: Request, res: Response) => {
  const io = (req as any).io;
  const { id } = req.params;

  await cancelCampaignJobs(id);
  await prisma.campaign.update({ where: { id }, data: { status: 'cancelled' } });
  io.emit(`campaign:${id}:status`, { status: 'cancelled' });

  res.json({ message: 'Campanha cancelada.' });
});

/**
 * DELETE /api/campaigns/:id
 */
campaignRouter.delete('/:id', async (req: Request, res: Response) => {
  await cancelCampaignJobs(req.params.id);
  await prisma.campaign.delete({ where: { id: req.params.id } });
  res.json({ message: 'Campanha excluída.' });
});

/**
 * POST /api/campaigns/test-send
 * Dispara uma mensagem de teste individual e imediata para o WhatsApp do usuário
 */
campaignRouter.post('/test-send', async (req: Request, res: Response) => {
  const { phone, message, mediaUrl, randomizeMedia = true } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Telefone e mensagem são obrigatórios para o teste.' });
  }

  if (!isWhatsAppConnected()) {
    return res.status(503).json({ error: 'WhatsApp não está conectado. Conecte seu aparelho via QR Code antes de testar.' });
  }

  const normalized = normalizePhone(phone);
  if (!normalized) {
    return res.status(400).json({ error: 'Número de telefone inválido para o teste.' });
  }

  const sock = getWASocket();
  if (!sock) {
    return res.status(503).json({ error: 'Sessão do WhatsApp indisponível no momento.' });
  }

  let targetJid = `${normalized}@s.whatsapp.net`;
  try {
    const waCheck = await sock.onWhatsApp(normalized);
    if (waCheck && waCheck.length > 0 && waCheck[0]?.exists) {
      targetJid = waCheck[0].jid;
    }
  } catch (_) {}

  try {
    // Simula indicador "digitando..." brevemente
    await sock.sendPresenceUpdate('composing', targetJid);
    await new Promise((r) => setTimeout(r, 1200));
    await sock.sendPresenceUpdate('paused', targetJid);

    // Resolve mídia se houver
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
      let fileBuffer: any = fs.readFileSync(resolvedMediaPath);
      if (randomizeMedia) {
        fileBuffer = randomizeImageBuffer(fileBuffer);
      }
      const ext = path.extname(resolvedMediaPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

      await sock.sendMessage(targetJid, {
        image: fileBuffer,
        caption: message,
        mimetype: mime,
      });
    } else {
      await sock.sendMessage(targetJid, { text: message });
    }

    return res.json({
      success: true,
      phone: normalized,
      message: 'Mensagem de teste enviada com sucesso no seu WhatsApp!',
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Erro no envio do teste: ${err.message}` });
  }
});

