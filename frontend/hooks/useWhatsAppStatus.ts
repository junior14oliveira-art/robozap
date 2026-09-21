'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import { getAuthToken } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export interface WhatsAppStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  phone?: string;
  message?: string;
  shouldReconnect?: boolean;
  userId?: string;
}

export function useWhatsAppStatus() {
  const { user } = useAuth();
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>({
    status: 'connecting',
    message: 'Verificando conexão...',
  });
  const [qrCode, setQrCode] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setWaStatus({ status: 'disconnected', message: 'Faça login para conectar o WhatsApp' });
      return;
    }

    try {
      const res = await fetch('/api/whatsapp/status', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) return;
      const data = await res.json();

      if (data.connected) {
        setWaStatus({
          status: 'connected',
          phone: data.phone,
          message: `Conectado como ${data.phone}`,
        });
        setQrCode(null);
      } else if (data.qr) {
        setQrCode(data.qr);
        setWaStatus({
          status: 'qr_ready',
          message: 'Escaneie o QR Code para conectar',
        });
      } else {
        const isConn = data.status === 'connecting';
        setWaStatus({
          status: isConn ? 'connecting' : 'disconnected',
          phone: isConn ? data.phone : undefined,
          message: isConn ? 'Reconectando ao WhatsApp...' : 'Desconectado',
        });
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchStatus();

    const socket = getSocket();

    if (user?.id) {
      socket.emit('user:subscribe', user.id);
    }

    const onStatus = (data: WhatsAppStatus & { userId?: string }) => {
      if (data.userId && user?.id && data.userId !== user.id) return;
      setWaStatus(data);
      if (data.status === 'connected') {
        setQrCode(null);
      }
    };

    const onQr = (data: { qr: string; userId?: string }) => {
      if (data.userId && user?.id && data.userId !== user.id) return;
      setQrCode(data.qr);
      setWaStatus({ status: 'qr_ready', message: 'Escaneie o QR Code para conectar' });
    };

    const onConnect = () => {
      if (user?.id) {
        socket.emit('user:subscribe', user.id);
      }
      fetchStatus();
    };

    socket.on('connect', onConnect);
    socket.on('whatsapp:status', onStatus);
    socket.on('whatsapp:qr', onQr);

    // Polling inteligente: 12 segundos se não estiver conectado, 30 segundos quando conectado
    const pollTime = waStatus.status === 'connected' ? 30000 : 12000;
    const interval = setInterval(fetchStatus, pollTime);

    return () => {
      clearInterval(interval);
      if (user?.id) {
        socket.emit('user:unsubscribe', user.id);
      }
      socket.off('connect', onConnect);
      socket.off('whatsapp:status', onStatus);
      socket.off('whatsapp:qr', onQr);
    };
  }, [fetchStatus, waStatus.status, user?.id]);

  return { waStatus, qrCode, refreshStatus: fetchStatus };
}
