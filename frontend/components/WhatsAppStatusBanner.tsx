'use client';

import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { AlertTriangle, WifiOff, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function WhatsAppStatusBanner() {
  const { waStatus } = useWhatsAppStatus();
  const [dismissed, setDismissed] = useState(false);

  // Only show banner when disconnected (not on first load)
  if (waStatus.status === 'connected' || dismissed) return null;
  if (waStatus.status === 'disconnected' && waStatus.message === 'Carregando status...') return null;

  const isError = waStatus.status === 'disconnected';
  const isWarning = waStatus.status === 'connecting' || waStatus.status === 'qr_ready';

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-6 py-2.5 text-sm font-medium animate-slide-up',
        isError && 'bg-destructive/20 text-destructive border-b border-destructive/30',
        isWarning && 'bg-yellow-500/10 text-yellow-400 border-b border-yellow-500/20'
      )}
    >
      {isError ? (
        <WifiOff className="h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      )}

      <span className="flex-1">
        {waStatus.message}
        {isError && (
          <>
            {' '}
            <Link
              href="/connect"
              className="underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Reconectar QR Code →
            </Link>
          </>
        )}
      </span>

      <button
        onClick={() => setDismissed(true)}
        className="rounded p-0.5 hover:bg-white/10 transition-colors"
        aria-label="Fechar alerta"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
