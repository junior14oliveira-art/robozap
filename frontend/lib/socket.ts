import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from './api';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || process.env.NEXT_PUBLIC_API_URL || BACKEND_URL;

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (typeof window === 'undefined') {
    return {
      on: () => {},
      off: () => {},
      emit: () => {},
      disconnect: () => {},
    } as any;
  }

  if (!socket) {
    socket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 3000,
      reconnectionDelayMax: 15000,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[Socket.io] Connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Socket.io] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket.io] Connection error:', err.message);
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
