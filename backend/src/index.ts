import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { setupSocketHandlers } from './socket';
import { authRouter } from './routes/auth';
import { userRouter } from './routes/user';
import { contactRouter } from './routes/contact';
import { whatsappRouter } from './routes/whatsapp';
import { campaignRouter } from './routes/campaign';
import { uploadRouter } from './routes/upload';
import { templateRouter } from './routes/template';
import { errorHandler } from './middleware/errorHandler';
import { restoreAllActiveSessions } from './whatsapp/client';
import { initWorker } from './queue/worker';
import { prisma } from './prisma';
import pino from 'pino';

export const logger = pino({
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

const PORT = parseInt(process.env.PORT || '3001', 10);
const rawFrontendUrls = process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:3030';
const allowedOrigins = rawFrontendUrls.split(',').map((u) => u.trim());

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return true;
  if (origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) return true;
  return true; // Permissivo para integrações web
}

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  // Socket.io
  const io = new SocketIOServer(server, {
    cors: {
      origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Middlewares
  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  };
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR || './uploads')));

  // Attach io to request for use in routes
  app.use((req, _res, next) => {
    (req as any).io = io;
    next();
  });

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', userRouter);
  app.use('/api/contacts', contactRouter);
  app.use('/api/whatsapp', whatsappRouter);
  app.use('/api/campaigns', campaignRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/api/templates', templateRouter);

  // Health & Root Status
  app.get('/', (_req, res) => {
    res.json({
      name: 'RoboZap WhatsApp Automation Multi-User SaaS API',
      status: 'online',
      version: '2.0.0',
      database: 'Supabase PostgreSQL',
      message: 'Backend do RoboZap Multi-Usuário está online!',
    });
  });

  app.get(['/health', '/api/health'], (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  // Setup Socket.io handlers
  setupSocketHandlers(io);

  // Start server
  server.listen(PORT, () => {
    logger.info(`🚀 RoboZap Multi-User SaaS Backend running on http://localhost:${PORT}`);
  });

  // Initialize BullMQ / Native queue worker
  initWorker(io);

  // Restore existing active WhatsApp sessions
  await restoreAllActiveSessions(io);

  // Pausa com segurança campanhas órfãs (que estavam como 'running' antes do reinício do container)
  // Assim o usuário vê 'Pausada' e o botão 'Continuar do Próximo Contato' aparece claramente
  try {
    const orphanedCampaigns = await prisma.campaign.findMany({
      where: { status: 'running' },
      select: { id: true, name: true },
    });
    for (const c of orphanedCampaigns) {
      await prisma.campaign.update({
        where: { id: c.id },
        data: { status: 'paused' },
      });
      logger.info({ campaignId: c.id, name: c.name }, '⏸️ Campanha órfã pausada com segurança na inicialização para permitir retomada');
    }
  } catch (err: any) {
    logger.warn({ err }, 'Aviso ao verificar campanhas órfãs na inicialização');
  }
}

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, '🛡️ Unhandled Rejection capturado para prevenir queda do processo');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, '🛡️ Uncaught Exception capturado para prevenir queda do processo');
});

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal error during bootstrap');
  process.exit(1);
});
