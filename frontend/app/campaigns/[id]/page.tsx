'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { CampaignProgress } from '@/components/CampaignProgress';
import { formatDate, formatPhone } from '@/lib/utils';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  totalContacts: number;
  sentCount: number;
  failedCount: number;
  messageTemplate: string;
  delayMin: number;
  delayMax: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  contacts: Array<{
    id: string;
    phone: string;
    name?: string;
    status: string;
    errorMsg?: string;
    sentAt?: string;
  }>;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  sent: <CheckCircle2 className="h-3.5 w-3.5 text-whatsapp" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  skipped: <Clock className="h-3.5 w-3.5 text-muted-foreground/40" />,
};

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<CampaignDetail>(`/api/campaigns/${id}`)
      .then(setCampaign)
      .catch(() => router.push('/'))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!campaign) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-slide-up">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <span className="text-muted-foreground/40">·</span>
        <h1 className="font-semibold text-foreground truncate">{campaign.name}</h1>
      </div>

      {/* Progress widget */}
      <CampaignProgress
        campaignId={campaign.id}
        campaignName={campaign.name}
        initialStatus={campaign.status}
        initialTotal={campaign.totalContacts}
        initialSent={campaign.sentCount}
        initialFailed={campaign.failedCount}
        delayMin={campaign.delayMin}
        delayMax={campaign.delayMax}
      />

      {/* Campaign info */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Detalhes da Campanha</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {[
            ['Criada em', formatDate(campaign.createdAt)],
            ['Iniciada em', campaign.startedAt ? formatDate(campaign.startedAt) : '—'],
            ['Concluída em', campaign.completedAt ? formatDate(campaign.completedAt) : '—'],
            ['Delay', `${campaign.delayMin}s – ${campaign.delayMax}s`],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-muted-foreground">{label}</p>
              <p className="font-medium text-foreground">{value}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="text-muted-foreground text-sm">Template da mensagem</p>
          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-secondary p-3 text-sm font-sans text-foreground">
            {campaign.messageTemplate}
          </pre>
        </div>
      </div>

      {/* Contacts list */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Contatos ({campaign.contacts.length})
        </h3>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Contato</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Enviado em</th>
              </tr>
            </thead>
            <tbody>
              {campaign.contacts.map((contact) => (
                <tr
                  key={contact.id}
                  className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{contact.name || '—'}</p>
                    <p className="text-xs text-muted-foreground">{formatPhone(contact.phone)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {STATUS_ICON[contact.status] || STATUS_ICON.pending}
                      <span
                        className={cn(
                          'text-xs',
                          contact.status === 'sent' && 'text-whatsapp',
                          contact.status === 'failed' && 'text-destructive',
                          contact.status === 'pending' && 'text-muted-foreground'
                        )}
                      >
                        {contact.status === 'sent'
                          ? 'Enviado'
                          : contact.status === 'failed'
                          ? contact.errorMsg || 'Falhou'
                          : 'Pendente'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                    {contact.sentAt ? formatDate(contact.sentAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
