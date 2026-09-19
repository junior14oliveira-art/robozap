'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  History,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Search,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Campaign {
  id: string;
  name: string;
  status: string;
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  running: {
    label: 'Enviando',
    className: 'bg-whatsapp/10 text-whatsapp border-whatsapp/20',
    icon: <div className="h-2 w-2 rounded-full bg-whatsapp animate-pulse" />,
  },
  paused: {
    label: 'Pausada',
    className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    icon: <div className="h-2 w-2 rounded-full bg-yellow-400" />,
  },
  completed: {
    label: 'Concluída',
    className: 'bg-whatsapp/10 text-whatsapp border-whatsapp/20',
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-whatsapp" />,
  },
  cancelled: {
    label: 'Cancelada',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
    icon: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  },
  failed: {
    label: 'Falhou',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
    icon: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  },
  pending: {
    label: 'Pendente',
    className: 'bg-secondary text-muted-foreground border-border',
    icon: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  },
};

export default function HistoryPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiFetch<Campaign[]>('/api/campaigns')
      .then(setCampaigns)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalSent = campaigns.reduce((a, c) => a + c.sentCount, 0);
  const successRate =
    campaigns.length > 0
      ? Math.round(
          (campaigns.filter((c) => c.status === 'completed').length / campaigns.length) * 100
        )
      : 0;

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Histórico</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Todas as suas campanhas de disparo
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total de Campanhas', value: campaigns.length, icon: History },
          { label: 'Mensagens Enviadas', value: totalSent.toLocaleString('pt-BR'), icon: CheckCircle2 },
          { label: 'Taxa de Sucesso', value: `${successRate}%`, icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar campanha..."
          className="w-full rounded-xl border border-border bg-secondary/50 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
        />
      </div>

      {/* Campaigns list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-20 text-center">
          <History className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {search ? 'Nenhuma campanha encontrada.' : 'Nenhuma campanha ainda.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((campaign) => {
            const cfg = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.pending;
            const successPct =
              campaign.totalContacts > 0
                ? Math.round((campaign.sentCount / campaign.totalContacts) * 100)
                : 0;

            return (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 hover:border-primary/30 hover:bg-card/80 transition-all"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-1.5">
                    <p className="font-semibold text-foreground truncate">{campaign.name}</p>
                    <span
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium shrink-0',
                        cfg.className
                      )}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{campaign.totalContacts} contatos</span>
                    <span className="text-whatsapp">{campaign.sentCount} enviadas</span>
                    {campaign.failedCount > 0 && (
                      <span className="text-destructive">{campaign.failedCount} falhas</span>
                    )}
                    <span>{formatDate(campaign.createdAt)}</span>
                  </div>
                  {/* Progress bar */}
                  {campaign.totalContacts > 0 && (
                    <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-whatsapp rounded-full transition-all"
                        style={{ width: `${successPct}%` }}
                      />
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
