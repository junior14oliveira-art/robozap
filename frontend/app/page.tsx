'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Send,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Loader2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { CampaignProgress } from '@/components/CampaignProgress';
import { cn } from '@/lib/utils';

interface Campaign {
  id: string;
  name: string;
  status: string;
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  delayMin: number;
  delayMax: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  running: { label: 'Enviando', className: 'bg-whatsapp/15 text-whatsapp border-whatsapp/30' },
  paused: { label: 'Pausada', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  completed: { label: 'Concluída', className: 'bg-whatsapp/15 text-whatsapp border-whatsapp/30' },
  cancelled: { label: 'Cancelada', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  pending: { label: 'Pendente', className: 'bg-secondary text-muted-foreground border-border' },
  failed: { label: 'Falhou', className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Campaign[]>('/api/campaigns')
      .then(setCampaigns)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalSent = campaigns.reduce((acc, c) => acc + c.sentCount, 0);
  const totalFailed = campaigns.reduce((acc, c) => acc + c.failedCount, 0);
  const totalContacts = campaigns.reduce((acc, c) => acc + c.totalContacts, 0);
  const activeCampaigns = campaigns.filter((c) => c.status === 'running' || c.status === 'paused');

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral das suas campanhas</p>
        </div>
        <Link
          href="/campaigns/new"
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
        >
          <Send className="h-4 w-4" />
          Nova Campanha
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: 'Total Enviadas',
            value: totalSent.toLocaleString('pt-BR'),
            icon: CheckCircle2,
            color: 'text-whatsapp',
            bg: 'bg-whatsapp/10',
          },
          {
            label: 'Campanhas',
            value: campaigns.length,
            icon: TrendingUp,
            color: 'text-primary',
            bg: 'bg-primary/10',
          },
          {
            label: 'Contatos Total',
            value: totalContacts.toLocaleString('pt-BR'),
            icon: Users,
            color: 'text-blue-400',
            bg: 'bg-blue-400/10',
          },
          {
            label: 'Falhas',
            value: totalFailed.toLocaleString('pt-BR'),
            icon: XCircle,
            color: 'text-destructive',
            bg: 'bg-destructive/10',
          },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-5">
            <div className={cn('mb-3 inline-flex rounded-xl p-2.5', bg)}>
              <Icon className={cn('h-5 w-5', color)} />
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Active campaigns */}
      {activeCampaigns.length > 0 && (
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Zap className="h-4 w-4 text-whatsapp" />
            Campanhas Ativas
          </h2>
          <div className="space-y-4">
            {activeCampaigns.map((campaign) => (
              <CampaignProgress
                key={campaign.id}
                campaignId={campaign.id}
                campaignName={campaign.name}
                initialStatus={campaign.status}
                initialTotal={campaign.totalContacts}
                delayMin={campaign.delayMin}
                delayMax={campaign.delayMax}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent campaigns table */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Campanhas Recentes
          </h2>
          <Link
            href="/history"
            className="text-xs text-primary hover:underline underline-offset-2"
          >
            Ver histórico completo →
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
            <Send className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Nenhuma campanha ainda</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Crie sua primeira campanha para começar
            </p>
            <Link
              href="/campaigns/new"
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Criar campanha
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Nome</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Enviadas</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Falhas</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Criada</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {campaigns.slice(0, 10).map((campaign) => {
                  const badge = STATUS_BADGE[campaign.status] || STATUS_BADGE.pending;
                  return (
                    <tr
                      key={campaign.id}
                      className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                    >
                      <td className="px-5 py-3.5 font-medium text-foreground max-w-[200px] truncate">
                        {campaign.name}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-whatsapp font-medium">
                        {campaign.sentCount} / {campaign.totalContacts}
                      </td>
                      <td className="px-5 py-3.5 text-destructive">
                        {campaign.failedCount}
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground hidden md:table-cell text-xs">
                        {formatDate(campaign.createdAt)}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="flex items-center justify-end text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
