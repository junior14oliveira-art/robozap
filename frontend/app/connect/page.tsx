'use client';

export const dynamic = 'force-dynamic';

import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { useToast } from '@/components/ui/use-toast';
import {
  Smartphone,
  QrCode,
  CheckCircle2,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export default function ConnectPage() {
  const { waStatus, qrCode } = useWhatsAppStatus();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleConnect() {
    setLoading('connect');
    try {
      await apiFetch('/api/whatsapp/connect', { method: 'POST' });
      toast({ title: '📱 Gerando QR Code...', description: 'Aguarde alguns segundos.' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  }

  async function handleLogout() {
    setLoading('logout');
    try {
      await apiFetch('/api/whatsapp/logout', { method: 'POST' });
      toast({ title: '✅ Desconectado', description: 'Sessão encerrada com sucesso.' });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  }

  const isConnected = waStatus.status === 'connected';
  const isConnecting = waStatus.status === 'connecting' || waStatus.status === 'qr_ready';

  return (
    <div className="mx-auto max-w-2xl space-y-8 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Conectar Aparelho</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecte seu WhatsApp via QR Code para começar a enviar mensagens
        </p>
      </div>

      {/* Connection card */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Status header */}
        <div
          className={cn(
            'flex items-center gap-3 px-6 py-4 border-b border-border',
            isConnected && 'bg-whatsapp/5',
            isConnecting && 'bg-yellow-500/5'
          )}
        >
          <div
            className={cn(
              'h-3 w-3 rounded-full',
              isConnected
                ? 'bg-whatsapp animate-pulse-green'
                : isConnecting
                ? 'bg-yellow-400 animate-pulse'
                : 'bg-muted-foreground/40'
            )}
          />
          <span className="font-medium text-foreground">
            {isConnected
              ? `Conectado${waStatus.phone ? ` — ${waStatus.phone}` : ''}`
              : isConnecting
              ? 'Aguardando conexão...'
              : 'Desconectado'}
          </span>
        </div>

        <div className="p-8">
          {/* CONNECTED STATE */}
          {isConnected ? (
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-whatsapp/10">
                <CheckCircle2 className="h-10 w-10 text-whatsapp" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">WhatsApp Conectado!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Seu aparelho está conectado e pronto para enviar mensagens.
                </p>
                {waStatus.phone && (
                  <p className="mt-2 text-sm font-medium text-whatsapp">{waStatus.phone}</p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleLogout}
                  disabled={!!loading}
                  className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                >
                  {loading === 'logout' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  Desconectar
                </button>
              </div>
            </div>
          ) : isConnecting && qrCode ? (
            /* QR CODE STATE */
            <div className="flex flex-col items-center gap-6 text-center">
              <div>
                <p className="text-base font-semibold text-foreground">Escaneie o QR Code</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Abra o WhatsApp no seu celular → Aparelhos conectados → Conectar aparelho
                </p>
              </div>

              <div className="relative rounded-2xl border-4 border-whatsapp/30 bg-white p-4 shadow-xl shadow-whatsapp/10">
                <img
                  src={qrCode}
                  alt="QR Code WhatsApp"
                  width={260}
                  height={260}
                  className="rounded-lg"
                />
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-whatsapp px-3 py-1 text-xs font-bold text-white shadow">
                  QR Code
                </div>
              </div>

              <p className="text-xs text-muted-foreground max-w-xs">
                O QR Code expira em 60 segundos. Se expirar, clique em{' '}
                <strong>Gerar novo QR Code</strong>.
              </p>

              <button
                onClick={handleConnect}
                disabled={!!loading}
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('h-4 w-4', loading === 'connect' && 'animate-spin')} />
                Gerar novo QR Code
              </button>
            </div>
          ) : isConnecting ? (
            /* AUTHENTICATING / RECONNECTING STATE */
            <div className="flex flex-col items-center gap-6 text-center py-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-whatsapp/10">
                <Loader2 className="h-10 w-10 text-whatsapp animate-spin" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {waStatus.message || 'Conectando ao WhatsApp...'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Autenticando sessão e sincronizando chaves. Aguarde um instante...
                </p>
                {waStatus.phone && (
                  <p className="mt-2 text-sm font-medium text-whatsapp">
                    Número vinculado: {waStatus.phone}
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* DISCONNECTED STATE */
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary">
                <QrCode className="h-10 w-10 text-muted-foreground" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">Nenhum aparelho conectado</p>
                <p className="mt-1 text-sm text-muted-foreground max-w-sm">
                  Conecte seu WhatsApp para começar a automatizar seus disparos. O processo leva menos de 1 minuto.
                </p>
              </div>

              <button
                onClick={handleConnect}
                disabled={!!loading}
                className="flex items-center gap-2 rounded-xl bg-whatsapp px-6 py-3 text-sm font-semibold text-white hover:bg-whatsapp-dark transition-colors shadow-lg shadow-whatsapp/25 disabled:opacity-50"
              >
                {loading === 'connect' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Smartphone className="h-4 w-4" />
                )}
                {loading === 'connect' ? 'Gerando QR Code...' : 'Conectar WhatsApp'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Security tips */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Dicas de Segurança</h3>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {[
            'Nunca compartilhe seu QR Code com terceiros.',
            'Utilize um número de WhatsApp Business dedicado para disparos.',
            'Configure delays entre 15-45 segundos para evitar banimentos.',
            'Evite disparar mais de 200 mensagens por dia em números novos.',
            'Prefira horários comerciais: 8h às 20h.',
          ].map((tip, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 text-primary">•</span>
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
