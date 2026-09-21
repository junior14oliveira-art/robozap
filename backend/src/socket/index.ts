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

    // Client can subscribe to user events
    socket.on('user:subscribe', (userId: string) => {
      socket.join(`user:${userId}`);
      logger.debug({ socketId: socket.id, userId }, 'Client subscribed to user');
    });

    socket.on('user:unsubscribe', (userId: string) => {
      socket.leave(`user:${userId}`);
    });

    socket.on('campaign:unsubscribe', (campaignId: string) => {
      socket.leave(`campaign:${campaignId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, '🔌 Client disconnected');
    });
  });
}
