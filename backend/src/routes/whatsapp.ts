import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import {
  isWhatsAppConnected,
  logoutWhatsApp,
  initWhatsAppClient,
  getCurrentQrCode,
  getWASocket,
  getUserSessionDir,
} from '../whatsapp/client';
import { hasSavedCredentials, restoreSessionFromDb } from '../whatsapp/sessionStore';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../prisma';

export const whatsappRouter = Router();

// Todas as rotas de WhatsApp exigem autenticação do usuário
whatsappRouter.use(requireAuth);

/**
 * GET /api/whatsapp/status
 * Retorna o status real da conexão do WhatsApp do usuário logado
 */
whatsappRouter.get('/status', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const io = (req as any).io;
  const connected = isWhatsAppConnected(userId);
  const sock = getWASocket(userId);
  const qr = connected ? null : getCurrentQrCode(userId);

  let status = 'disconnected';

  if (connected) {
    status = 'connected';
  } else if (qr) {
    status = 'qr_ready';
  } else {
    // Socket não está conectado em memória
    const userDir = getUserSessionDir(userId);
    const hasDbCreds = await hasSavedCredentials(userId);
    const hasDiskCreds = fs.existsSync(path.join(userDir, 'creds.json'));

    if (hasDbCreds || hasDiskCreds) {
      status = 'connecting';
      // Auto-reconecta em background se o servidor acabou de reiniciar
      initWhatsAppClient(io, userId).catch(() => {});
    } else {
      status = 'disconnected';
      // Corrige status antigo no banco de dados para evitar inconsistências
      await prisma.whatsAppSession.upsert({
        where: { userId },
        create: { userId, status: 'disconnected', phone: null },
        update: { status: 'disconnected', phone: null },
      }).catch(() => {});
    }
  }

  const session = await prisma.whatsAppSession.findUnique({ where: { userId } });
  const phone = connected
    ? ((sock as any)?.user?.id?.split(':')[0] || session?.phone || null)
    : (status === 'connecting' ? session?.phone || null : null);

  res.json({
    connected,
    status,
    phone,
    qr,
  });
});

/**
 * POST /api/whatsapp/connect
 * Inicia conexão do WhatsApp para o usuário logado (gera novo QR code)
 */
whatsappRouter.post('/connect', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const io = (req as any).io;
  await initWhatsAppClient(io, userId, true);
  res.json({ message: 'Conectando ao WhatsApp... Aguarde o QR Code.' });
});

/**
 * POST /api/whatsapp/logout
 * Desconecta e limpa sessão do WhatsApp do usuário logado
 */
whatsappRouter.post('/logout', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const io = (req as any).io;
  await logoutWhatsApp(io, userId);
  res.json({ message: 'WhatsApp desconectado com sucesso.' });
});
