'use client';

import { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export interface SpamViolation {
  id: string;
  rule: string;
  description: string;
  snippet?: string;
  severity: 'critical' | 'warning';
}

export interface SpamAnalysis {
  isBlocked: boolean;
  score: number;
  level: 'safe' | 'warning' | 'blocked';
  violations: SpamViolation[];
  suggestions: string[];
  cleanPreview?: string;
}

interface SpamShieldAlertProps {
  analysis: SpamAnalysis | null;
  messageText: string;
  onApplyCleanedMessage: (cleanedText: string) => void;
  className?: string;
}

export function SpamShieldAlert({
  analysis,
  messageText,
  onApplyCleanedMessage,
  className,
}: SpamShieldAlertProps) {
  const { toast } = useToast();
  const [cleaning, setCleaning] = useState(false);

  if (!messageText || messageText.trim().length === 0 || !analysis) {
    return null;
  }

  const { isBlocked, score, level, violations, suggestions } = analysis;

  const handleAutoClean = async () => {
    setCleaning(true);
    try {
      const storedKey = typeof window !== 'undefined' ? localStorage.getItem('grok_api_key') || '' : '';
      const res = await apiFetch<{
        cleanMessage: string;
        improvements: string[];
        riskBefore: number;
        riskAfter: number;
        isBlocked: boolean;
        usedAI: boolean;
      }>('/api/ai/humanize-spam', {
        method: 'POST',
        headers: storedKey ? { 'x-grok-api-key': storedKey } : {},
        body: JSON.stringify({
          message: messageText,
          apiKey: storedKey || undefined,
        }),
      });

      if (res.cleanMessage) {
        onApplyCleanedMessage(res.cleanMessage);
        toast({
          title: res.usedAI ? '✨ Mensagem Humanizada com IA Grok!' : '🛡️ Mensagem Higienizada com Sucesso!',
          description: `Risco de banimento reduzido de ${res.riskBefore}% para ${res.riskAfter}%. O envio agora está liberado!`,
        });
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao humanizar mensagem',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-2xl border p-4 transition-all duration-200 text-sm space-y-3',
        level === 'blocked'
          ? 'border-destructive/60 bg-destructive/10 text-destructive-foreground ring-1 ring-destructive/40 shadow-sm'
          : level === 'warning'
          ? 'border-yellow-500/50 bg-yellow-500/10 text-foreground'
          : 'border-whatsapp/40 bg-whatsapp/5 text-foreground',
        className
      )}
    >
      {/* Header bar com Score */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {level === 'blocked' ? (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive text-destructive-foreground animate-pulse">
              <ShieldAlert className="h-4 w-4" />
            </div>
          ) : level === 'warning' ? (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-yellow-500/20 text-yellow-500">
              <AlertTriangle className="h-4 w-4" />
            </div>
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-whatsapp/20 text-whatsapp">
              <ShieldCheck className="h-4 w-4" />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-xs sm:text-sm">
                {level === 'blocked'
                  ? '🚫 MENSAGEM BLOQUEADA: Alto Risco de Banimento'
                  : level === 'warning'
                  ? '🟡 Atenção: Risco Moderado de Denúncia'
                  : '🟢 Escudo Anti-Spam Ativo: Mensagem Segura'}
              </h4>
              <span
                className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                  level === 'blocked'
                    ? 'bg-destructive/20 text-destructive border-destructive/40'
                    : level === 'warning'
                    ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/40'
                    : 'bg-whatsapp/20 text-whatsapp border-whatsapp/40'
                )}
              >
                Score de Risco: {score}/100
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {level === 'blocked'
                ? 'Esta mensagem não pode ser disparada porque contém gatilhos de spam que acionam banimento imediato da Meta.'
                : level === 'warning'
                ? 'A mensagem possui alguns termos comerciais que podem gerar denúncias. Considere humanizá-la.'
                : 'Texto natural, sem gatilhos comerciais agressivos. Excelente entregabilidade.'}
            </p>
          </div>
        </div>

        {/* Botão de Auto-Humanização quando bloqueado ou com aviso */}
        {level !== 'safe' && (
          <button
            type="button"
            onClick={handleAutoClean}
            disabled={cleaning}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md hover:opacity-95 hover:scale-[1.02] transition-all disabled:opacity-50"
            title="Reescrever automaticamente com IA para eliminar termos proibidos"
          >
            {cleaning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5 text-yellow-300" />
            )}
            <span>{cleaning ? 'Humanizando...' : '✨ Limpar & Desbloquear com Grok'}</span>
          </button>
        )}
      </div>

      {/* Lista de Violações se houver */}
      {violations && violations.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border/50 text-xs">
          <p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">
            Gatilhos de spam detectados:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {violations.map((v, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-2 rounded-lg p-2 border text-[11px] leading-tight',
                  v.severity === 'critical'
                    ? 'bg-destructive/15 border-destructive/30 text-destructive'
                    : 'bg-yellow-500/10 border-yellow-500/25 text-yellow-400'
                )}
              >
                {v.severity === 'critical' ? (
                  <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                )}
                <div>
                  <strong className="font-semibold block">{v.rule}</strong>
                  <span className="text-muted-foreground">{v.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sugestões de correção rápida */}
      {suggestions && suggestions.length > 0 && level === 'blocked' && (
        <div className="text-[11px] text-muted-foreground pt-1">
          <strong className="text-foreground">Como desbloquear:</strong>{' '}
          {suggestions.slice(0, 2).join(' ')}
        </div>
      )}
    </div>
  );
}
