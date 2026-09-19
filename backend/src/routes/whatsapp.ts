import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  isWhatsAppConnected,
  logoutWhatsApp,
  initWhatsAppClient,
  getCurrentQrCode,
  getWASocket,
} from '../whatsapp/client';

const prisma = new PrismaClient();
export const whatsappRouter = Router();

/**
 * GET /api/whatsapp/status
 * Returns current WhatsApp connection status and current QR code if available
 */
whatsappRouter.get('/status', async (_req: Request, res: Response) => {
  const session = await prisma.whatsAppSession.findUnique({ where: { id: 'default' } });
  const connected = isWhatsAppConnected();
  const sock = getWASocket();
  const qr = connected ? null : getCurrentQrCode();

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
 * Trigger a new WhatsApp connection (generates a new QR Code)
 */
whatsappRouter.post('/connect', async (req: Request, res: Response) => {
  const io = (req as any).io;
  await initWhatsAppClient(io, true);
  res.json({ message: 'Conectando ao WhatsApp... Aguarde o QR Code.' });
});

/**
 * POST /api/whatsapp/logout
 * Disconnect and clear WhatsApp session
 */
whatsappRouter.post('/logout', async (req: Request, res: Response) => {
  const io = (req as any).io;
  await logoutWhatsApp(io);
  res.json({ message: 'Logged out successfully.' });
});
