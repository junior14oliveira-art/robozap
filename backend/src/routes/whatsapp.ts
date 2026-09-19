import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  isWhatsAppConnected,
  logoutWhatsApp,
  initWhatsAppClient,
  getCurrentQrCode,
  getWASocket,
} from '../whatsapp/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
export const whatsappRouter = Router();

// Todas as rotas de WhatsApp exigem autenticação do usuário
whatsappRouter.use(requireAuth);

/**
 * GET /api/whatsapp/status
 * Retorna o status da conexão do WhatsApp do usuário logado
 */
whatsappRouter.get('/status', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const session = await prisma.whatsAppSession.findUnique({ where: { userId } });
  const connected = isWhatsAppConnected(userId);
  const sock = getWASocket(userId);
  const qr = connected ? null : getCurrentQrCode(userId);

  let status = 'disconnected';
  if (connected) {
    status = 'connected';
  } else if (qr) {
    status = 'qr_ready';
  } else if (session?.status) {
    status = session.status;
  }

  const phone = connected
    ? ((sock as any)?.user?.id?.split(':')[0] || session?.phone || null)
    : null;

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
