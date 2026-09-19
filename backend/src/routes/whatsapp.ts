import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { isWhatsAppConnected, logoutWhatsApp, initWhatsAppClient } from '../whatsapp/client';

const prisma = new PrismaClient();
export const whatsappRouter = Router();

/**
 * GET /api/whatsapp/status
 * Returns current WhatsApp connection status
 */
whatsappRouter.get('/status', async (_req: Request, res: Response) => {
  const session = await prisma.whatsAppSession.findUnique({ where: { id: 'default' } });
  const connected = isWhatsAppConnected();

  res.json({
    connected,
    status: session?.status || 'disconnected',
    phone: session?.phone || null,
  });
});

/**
 * POST /api/whatsapp/connect
 * Trigger a new WhatsApp connection (generates a new QR Code)
 */
whatsappRouter.post('/connect', async (req: Request, res: Response) => {
  const io = (req as any).io;
  await initWhatsAppClient(io);
  res.json({ message: 'Connecting... Scan the QR Code.' });
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
