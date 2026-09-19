import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { setupSocketHandlers } from './socket';
import { whatsappRouter } from './routes/whatsapp';
import { campaignRouter } from './routes/campaign';
import { uploadRouter } from './routes/upload';
import { templateRouter } from './routes/template';
import { errorHandler } from './middleware/errorHandler';
import { initWhatsAppClient } from './whatsapp/client';
import { initWorker } from './queue/worker';
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
  if (origin.endsWith('.vercel.app')) return true;
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
  app.use(cors({
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR || './uploads')));

  // Attach io to request for use in routes
  app.use((req, _res, next) => {
    (req as any).io = io;
    next();
  });

  // Routes
  app.use('/api/whatsapp', whatsappRouter);
  app.use('/api/campaigns', campaignRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/api/templates', templateRouter);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  // Setup Socket.io handlers
  setupSocketHandlers(io);

  // Start server
  server.listen(PORT, () => {
    logger.info(`🚀 RoboZap Backend running on http://localhost:${PORT}`);
  });

  // Initialize WhatsApp client
  await initWhatsAppClient(io);

  // Initialize BullMQ worker
  initWorker(io);
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal error during bootstrap');
  process.exit(1);
});
