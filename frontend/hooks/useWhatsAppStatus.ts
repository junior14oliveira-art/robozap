'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import { API_URL } from '@/lib/api';

export interface WhatsAppStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  phone?: string;
  message?: string;
  shouldReconnect?: boolean;
}

export function useWhatsAppStatus() {
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>({
    status: 'connecting',
    message: 'Verificando conexão...',
  });
  const [qrCode, setQrCode] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/status`, {
        cache: 'no-store',
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
          status: (data.status as WhatsAppStatus['status']) || 'disconnected',
          phone: data.phone,
          message: isConn ? 'Aguardando conexão...' : 'Desconectado',
        });
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    // 1. Busca inicial imediata
    fetchStatus();

    // 2. Sincronização periódica a cada 3.5 segundos (garantia de 100% sincronia)
    const interval = setInterval(fetchStatus, 3500);

    // 3. Atualizações em tempo real via Socket.io
    const socket = getSocket();

    const onStatus = (data: WhatsAppStatus) => {
      setWaStatus(data);
      if (data.status === 'connected') {
        setQrCode(null);
      }
    };

    const onQr = ({ qr }: { qr: string }) => {
      setQrCode(qr);
      setWaStatus({ status: 'qr_ready', message: 'Escaneie o QR Code para conectar' });
    };

    socket.on('whatsapp:status', onStatus);
    socket.on('whatsapp:qr', onQr);

    return () => {
      clearInterval(interval);
      socket.off('whatsapp:status', onStatus);
      socket.off('whatsapp:qr', onQr);
    };
  }, [fetchStatus]);

  return { waStatus, qrCode, refreshStatus: fetchStatus };
}
