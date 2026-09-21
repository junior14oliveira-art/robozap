'use client';

import { useEffect, useState } from 'react';
import { getSocket } from '@/lib/socket';

export interface CampaignProgress {
  sent: number;
  failed: number;
  total: number;
  percent: number;
  lastPhone?: string;
  lastError?: string;
  status?: string;
}

export function useCampaignProgress(campaignId: string | null, initialStatus?: string) {
  const [progress, setProgress] = useState<CampaignProgress | null>(null);
  const [status, setStatus] = useState<string | null>(initialStatus || null);

  useEffect(() => {
    if (!campaignId) return;

    const socket = getSocket();
    socket.emit('campaign:subscribe', campaignId);

    socket.on(`campaign:${campaignId}:progress`, (data: CampaignProgress) => {
      setProgress(data);
      if (data.status) setStatus(data.status);
    });

    socket.on(`campaign:${campaignId}:status`, (data: { status: string }) => {
      setStatus(data.status);
    });

    return () => {
      socket.off(`campaign:${campaignId}:progress`);
      socket.off(`campaign:${campaignId}:status`);
      socket.emit('campaign:unsubscribe', campaignId);
    };
  }, [campaignId]);

  return { progress, status: status || initialStatus || 'pending' };
}
