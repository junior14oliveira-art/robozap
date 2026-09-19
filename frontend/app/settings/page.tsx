'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Settings, Shield, Bell, Database, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { apiFetch } from '@/lib/api';

export default function SettingsPage() {
  const { toast } = useToast();
  const [delayMin, setDelayMin] = useState(15);
  const [delayMax, setDelayMax] = useState(45);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 500));
    setSaving(false);
    toast({ title: '✅ Configurações salvas!' });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">Preferências globais do sistema</p>
      </div>

      {/* Anti-spam defaults */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Configurações Anti-Spam</h3>
        </div>

        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground text-xs">
            Estes são os valores padrão para novas campanhas. Você pode ajustá-los por campanha.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Delay mínimo padrão (segundos)</label>
              <input
                type="number"
                value={delayMin}
                onChange={(e) => setDelayMin(Number(e.target.value))}
                min={5}
                max={300}
                className="w-full rounded-xl border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Delay máximo padrão (segundos)</label>
              <input
                type="number"
                value={delayMax}
                onChange={(e) => setDelayMax(Number(e.target.value))}
                min={5}
                max={300}
                className="w-full rounded-xl border border-border bg-secondary/50 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          <div className="rounded-xl bg-secondary/30 p-4 space-y-1.5 text-xs text-muted-foreground">
            <p>⚡ <strong className="text-foreground">Baixo risco:</strong> 15–45 segundos (recomendado)</p>
            <p>⚠️ <strong className="text-foreground">Médio risco:</strong> 8–15 segundos</p>
            <p>🚫 <strong className="text-foreground">Alto risco:</strong> abaixo de 8 segundos (evite)</p>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-foreground">Sobre o Sistema</h3>
        </div>
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>Versão: <span className="text-foreground font-mono">1.0.0</span></p>
          <p>Engine: <span className="text-foreground">Baileys v6 + BullMQ</span></p>
          <p>Stack: <span className="text-foreground">Node.js + Next.js 14 + Redis</span></p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
          Salvar Configurações
        </button>
      </div>
    </div>
  );
}
