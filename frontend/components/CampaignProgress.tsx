'use client';

import { useCampaignProgress } from '@/hooks/useCampaignProgress';
import { CheckCircle2, XCircle, Clock, Pause, Play, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';

interface CampaignProgressProps {
  campaignId: string;
  campaignName: string;
  initialStatus?: string;
  initialTotal?: number;
  initialSent?: number;
  initialFailed?: number;
  delayMin?: number;
  delayMax?: number;
}

function estimateRemaining(remaining: number, delayMin: number, delayMax: number): string {
  const avg = (delayMin + delayMax) / 2;
  const totalSec = Math.floor(remaining * avg);
  if (totalSec < 60) return `~${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `~${m}min ${s}s`;
  const h = Math.floor(m / 60);
  return `~${h}h ${m % 60}min`;
}

export function CampaignProgress({
  campaignId,
  campaignName,
  initialStatus = 'pending',
  initialTotal = 0,
  initialSent = 0,
  initialFailed = 0,
  delayMin = 15,
  delayMax = 45,
}: CampaignProgressProps) {
  const { progress, status } = useCampaignProgress(campaignId, initialStatus);
  const [loading, setLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const currentStatus = status || initialStatus;
  const total = progress?.total ?? initialTotal;
  const sent = progress?.sent ?? initialSent;
  const failed = progress?.failed ?? initialFailed;
  const percent = progress?.percent ?? (total > 0 ? Math.round(((sent + failed) / total) * 100) : 0);
  const remaining = Math.max(total - sent - failed, 0);

  async function handleAction(action: 'pause' | 'resume' | 'cancel') {
    setLoading(action);
    try {
      await apiFetch(`/api/campaigns/${campaignId}/${action}`, { method: 'POST' });
      toast({
        title:
          action === 'pause'
            ? '⏸️ Campanha pausada'
            : action === 'resume'
            ? '▶️ Campanha retomada'
            : '🚫 Campanha cancelada',
        description:
          action === 'resume'
            ? 'Continuando o disparo a partir do próximo contato pendente.'
            : undefined,
        variant: action === 'cancel' ? 'destructive' : 'default',
      });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  }

  const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    running: {
      label: 'Enviando',
      color: 'text-whatsapp',
      icon: <Loader2 className="h-4 w-4 animate-spin text-whatsapp" />,
    },
    paused: {
      label: 'Pausada',
      color: 'text-yellow-400',
      icon: <Pause className="h-4 w-4 text-yellow-400" />,
    },
    completed: {
      label: 'Concluída',
      color: 'text-whatsapp',
      icon: <CheckCircle2 className="h-4 w-4 text-whatsapp" />,
    },
    cancelled: {
      label: 'Cancelada',
      color: 'text-destructive',
      icon: <XCircle className="h-4 w-4 text-destructive" />,
    },
    failed: {
      label: 'Falhou',
      color: 'text-destructive',
      icon: <XCircle className="h-4 w-4 text-destructive" />,
    },
  };

  const cfg = statusConfig[currentStatus] || statusConfig.running;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-5 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-foreground">{campaignName}</h3>
          <div className="mt-1 flex items-center gap-2">
            {cfg.icon}
            <span className={cn('text-sm font-medium', cfg.color)}>{cfg.label}</span>
          </div>
        </div>

        {/* Action buttons — Controle e Liberdade para o Usuário */}
        {currentStatus !== 'completed' && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {currentStatus === 'running' && (
              <>
                <button
                  onClick={() => handleAction('pause')}
                  disabled={!!loading}
                  className="flex items-center gap-1.5 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-xs font-semibold text-yellow-400 hover:bg-yellow-500/20 transition-colors disabled:opacity-50"
                  title="Pausar disparos"
                >
                  {loading === 'pause' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Pause className="h-3.5 w-3.5" />
                  )}
                  Pausar
                </button>
                <button
                  onClick={() => handleAction('cancel')}
                  disabled={!!loading}
                  className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                  title="Cancelar campanha"
                >
                  {loading === 'cancel' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  Cancelar
                </button>
              </>
            )}

            {(currentStatus === 'paused' || currentStatus === 'cancelled' || currentStatus === 'pending') && (
              <>
                {remaining > 0 && (
                  <button
                    onClick={() => handleAction('resume')}
                    disabled={!!loading}
                    className="flex items-center gap-1.5 rounded-lg border border-whatsapp bg-whatsapp px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-whatsapp/90 transition-colors disabled:opacity-50"
                    title={`Continuar envio do próximo contato (${sent + failed + 1} de ${total})`}
                  >
                    {loading === 'resume' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5 fill-current" />
                    )}
                    Continuar do Próximo Contato ({sent + failed + 1}/{total})
                  </button>
                )}
                {currentStatus !== 'cancelled' && (
                  <button
                    onClick={() => handleAction('cancel')}
                    disabled={!!loading}
                    className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                  >
                    {loading === 'cancel' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                    Cancelar
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{percent}% concluído</span>
          <span>{sent + failed} / {total}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              currentStatus === 'completed'
                ? 'bg-whatsapp'
                : currentStatus === 'cancelled'
                ? 'bg-destructive'
                : 'bg-primary'
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-secondary/50 p-3 text-center">
          <CheckCircle2 className="mx-auto mb-1 h-4 w-4 text-whatsapp" />
          <p className="text-xl font-bold text-whatsapp">{sent}</p>
          <p className="text-xs text-muted-foreground">Enviadas</p>
        </div>
        <div className="rounded-xl bg-secondary/50 p-3 text-center">
          <XCircle className="mx-auto mb-1 h-4 w-4 text-destructive" />
          <p className="text-xl font-bold text-destructive">{failed}</p>
          <p className="text-xs text-muted-foreground">Falhas</p>
        </div>
        <div className="rounded-xl bg-secondary/50 p-3 text-center">
          <Clock className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
          <p className="text-xl font-bold text-foreground">
            {currentStatus === 'completed' || currentStatus === 'cancelled'
              ? '—'
              : estimateRemaining(remaining, delayMin, delayMax)}
          </p>
          <p className="text-xs text-muted-foreground">Tempo restante</p>
        </div>
      </div>

      {/* Last phone sent */}
      {progress?.lastPhone && currentStatus === 'running' && (
        <div className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          <div className="flex gap-1">
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-whatsapp" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-whatsapp" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-whatsapp" />
          </div>
          <span>Enviando para: {progress.lastPhone}</span>
        </div>
      )}

      {/* Last error */}
      {progress?.lastError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Último erro: {progress.lastError}
        </div>
      )}
    </div>
  );
}
