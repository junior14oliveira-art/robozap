import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../index';

export function setupSocketHandlers(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, '🔌 Client connected via Socket.io');

    // Client can subscribe to a specific campaign's events
    socket.on('campaign:subscribe', (campaignId: string) => {
      socket.join(`campaign:${campaignId}`);
      logger.debug({ socketId: socket.id, campaignId }, 'Client subscribed to campaign');
    });

    socket.on('campaign:unsubscribe', (campaignId: string) => {
      socket.leave(`campaign:${campaignId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, '🔌 Client disconnected');
    });
  });
}
