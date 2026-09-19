'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';

export interface WhatsAppStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected';
  phone?: string;
  message?: string;
  shouldReconnect?: boolean;
}

export function useWhatsAppStatus() {
  const [waStatus, setWaStatus] = useState<WhatsAppStatus>({
    status: 'disconnected',
    message: 'Carregando status...',
  });
  const [qrCode, setQrCode] = useState<string | null>(null);

  useEffect(() => {
    // Fetch initial status from REST
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/whatsapp/status`)
      .then((r) => r.json())
      .then((data) => {
        setWaStatus({
          status: data.connected ? 'connected' : (data.status as WhatsAppStatus['status']),
          phone: data.phone,
          message: data.connected ? `Conectado como ${data.phone}` : 'Desconectado',
        });
      })
      .catch(() => {});

    // Listen for realtime updates
    const socket = getSocket();

    socket.on('whatsapp:status', (data: WhatsAppStatus) => {
      setWaStatus(data);
      if (data.status === 'connected') {
        setQrCode(null); // Hide QR after connection
      }
    });

    socket.on('whatsapp:qr', ({ qr }: { qr: string }) => {
      setQrCode(qr);
      setWaStatus({ status: 'qr_ready', message: 'Escaneie o QR Code' });
    });

    return () => {
      socket.off('whatsapp:status');
      socket.off('whatsapp:qr');
    };
  }, []);

  return { waStatus, qrCode };
}
