'use client';

import { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldCheck,
  Shuffle,
  AlertTriangle,
  Loader2,
  Check,
  Copy,
  Plus,
  Key,
  HelpCircle,
  X,
  MessageSquare,
  Wand2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

interface GrokVariationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseMessage: string;
  onApplyVariations: (variations: string[]) => void;
  onApplySpintax: (spintax: string) => void;
}

export function GrokVariationsModal({
  isOpen,
  onClose,
  baseMessage,
  onApplyVariations,
  onApplySpintax,
}: GrokVariationsModalProps) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [hasServerKey, setHasServerKey] = useState(false);

  const [promptInput, setPromptInput] = useState('');
  const [tone, setTone] = useState<'consultivo' | 'direto' | 'amigavel' | 'curto'>('consultivo');
  const [count, setCount] = useState<number>(4);
  const [mode, setMode] = useState<'variations' | 'spintax' | 'humanize'>('variations');

  const [loading, setLoading] = useState(false);
  const [generatedVariations, setGeneratedVariations] = useState<string[]>([]);
  const [generatedSpintax, setGeneratedSpintax] = useState<string | null>(null);
  const [adviceList, setAdviceList] = useState<string[]>([]);
  const [selectedVariations, setSelectedVariations] = useState<number[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Carrega chave salva localmente e status do servidor
  useEffect(() => {
    if (!isOpen) return;
    const stored = localStorage.getItem('grok_api_key') || '';
    setApiKey(stored);
    setPromptInput(baseMessage || '');

    apiFetch<{ hasKey: boolean; model: string }>('/api/ai/status')
      .then((res) => {
        setHasServerKey(res.hasKey);
        if (!res.hasKey && !stored) {
          setShowKeyInput(true);
        }
      })
      .catch(() => {});
  }, [isOpen, baseMessage]);

  const saveApiKey = (val: string) => {
    setApiKey(val);
    if (val.trim()) {
      localStorage.setItem('grok_api_key', val.trim());
    } else {
      localStorage.removeItem('grok_api_key');
    }
  };

  const handleGenerate = async () => {
    const textToUse = promptInput.trim() || baseMessage.trim();
    if (!textToUse) {
      toast({
        title: 'Mensagem necessária',
        description: 'Digite ou cole uma mensagem base para o Grok reescrever.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setGeneratedVariations([]);
    setGeneratedSpintax(null);
    setAdviceList([]);

    try {
      if (mode === 'spintax') {
        const res = await apiFetch<{ spintax: string; combinationsEstimate: number; usedAI: boolean }>(
          '/api/ai/spintax',
          {
            method: 'POST',
            headers: apiKey ? { 'x-grok-api-key': apiKey } : undefined,
            body: JSON.stringify({ baseMessage: textToUse }),
          }
        );
        setGeneratedSpintax(res.spintax);
        toast({
          title: '🪄 Spintax Gerado!',
          description: `Estimativa de mais de ${res.combinationsEstimate} combinações únicas.`,
        });
      } else {
        const res = await apiFetch<{ variations: string[]; advice: string[]; usedAI: boolean }>(
          '/api/ai/variations',
          {
            method: 'POST',
            headers: apiKey ? { 'x-grok-api-key': apiKey } : undefined,
            body: JSON.stringify({
              baseMessage: textToUse,
              count,
              tone: mode === 'humanize' ? 'consultivo' : tone,
            }),
          }
        );
        setGeneratedVariations(res.variations);
        setAdviceList(res.advice || []);
        // Seleciona todas por padrão
        setSelectedVariations(res.variations.map((_, i) => i));

        toast({
          title: '✨ Variações criadas com sucesso!',
          description: `${res.variations.length} modelos humanizados prontos para uso.`,
        });
      }
    } catch (err: any) {
      toast({
        title: 'Falha ao processar com IA',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApplySelected = () => {
    if (mode === 'spintax' && generatedSpintax) {
      onApplySpintax(generatedSpintax);
      onClose();
      return;
    }

    const chosen = generatedVariations.filter((_, idx) => selectedVariations.includes(idx));
    if (chosen.length === 0) {
      toast({
        title: 'Nenhuma variação selecionada',
        description: 'Marque ao menos uma variação para aplicar.',
        variant: 'destructive',
      });
      return;
    }

    onApplyVariations(chosen);
    onClose();
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast({ title: 'Copiado para a área de transferência!' });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                Criador de Variações com IA Grok (Anti-Ban)
              </h2>
              <p className="text-xs text-muted-foreground">
                Gere múltiplos modelos de copy para nunca enviar a mesma mensagem para todos os contatos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Alerta de chave da API do Grok */}
          <div className="rounded-xl border border-border bg-secondary/30 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-primary" />
                Conexão com a API do Grok (xAI):
              </span>
              <button
                type="button"
                onClick={() => setShowKeyInput(!showKeyInput)}
                className="text-xs text-primary hover:underline font-medium"
              >
                {showKeyInput ? 'Ocultar chave' : apiKey || hasServerKey ? 'Alterar chave' : '+ Inserir chave do Grok'}
              </button>
            </div>

            {showKeyInput && (
              <div className="space-y-1.5 pt-1">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => saveApiKey(e.target.value)}
                  placeholder="xai-xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[11px] text-muted-foreground">
                  Obtenha sua chave no console oficial do xAI:{' '}
                  <a
                    href="https://console.x.ai/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    console.x.ai
                  </a>
                  . Se não tiver chave, o sistema usará o gerador heurístico inteligente de fallback.
                </p>
              </div>
            )}
          </div>

          {/* Abas de Modo */}
          <div className="flex gap-2 p-1 rounded-xl bg-secondary/50 border border-border">
            <button
              type="button"
              onClick={() => setMode('variations')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all',
                mode === 'variations'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Múltiplos Modelos de Copy
            </button>
            <button
              type="button"
              onClick={() => setMode('humanize')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all',
                mode === 'humanize'
                  ? 'bg-whatsapp text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Humanizar Pitch (Anti-Spam)
            </button>
            <button
              type="button"
              onClick={() => setMode('spintax')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all',
                mode === 'spintax'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Shuffle className="h-3.5 w-3.5" />
              Converter em Spintax
            </button>
          </div>

          {/* Mensagem Base */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Sua mensagem original ou ideia de oferta:</span>
              <span className="text-[11px] text-muted-foreground font-normal">
                Mantenha as tags como {'{{nome}}'}, {'{{empresa}}'}
              </span>
            </label>
            <textarea
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              rows={4}
              placeholder="Cole aqui o texto da mensagem que você costuma enviar..."
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-sans"
            />
          </div>

          {/* Opções de Tom e Quantidade */}
          {mode !== 'spintax' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Tom de Voz</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as any)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="consultivo">🤝 Consultivo & B2B (Melhor para não ser bloqueado)</option>
                  <option value="amigavel">😊 Amigável & Humano</option>
                  <option value="direto">🎯 Direto ao Ponto</option>
                  <option value="curto">⚡ Curto & Rápido</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Quantidade de Modelos</label>
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value={3}>3 Variações</option>
                  <option value={4}>4 Variações (Recomendado)</option>
                  <option value={5}>5 Variações</option>
                  <option value={6}>6 Variações</option>
                </select>
              </div>
            </div>
          )}

          {/* Botão Gerar */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || !promptInput.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 shadow-md shadow-primary/20"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Grok IA está escrevendo variações humanizadas...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                {mode === 'spintax'
                  ? 'Gerar Spintax com Grok'
                  : mode === 'humanize'
                  ? 'Humanizar e Blindar Contra Denúncias'
                  : `Gerar ${count} Modelos com Grok`}
              </>
            )}
          </button>

          {/* Dicas de Segurança retornadas pela IA */}
          {adviceList.length > 0 && (
            <div className="rounded-xl border border-whatsapp/30 bg-whatsapp/5 p-3.5 space-y-1.5 text-xs text-foreground">
              <span className="font-bold text-whatsapp flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                Dicas de Segurança Anti-Ban do Grok:
              </span>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px]">
                {adviceList.map((adv, idx) => (
                  <li key={idx}>{adv}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Resultado Spintax */}
          {generatedSpintax && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Resultado em Spintax:</span>
                <span className="text-[11px] text-whatsapp font-bold">Cada contato receberá uma combinação diferente</span>
              </label>
              <div className="rounded-xl border border-border bg-secondary/30 p-3.5 text-xs text-foreground font-mono whitespace-pre-wrap">
                {generatedSpintax}
              </div>
            </div>
          )}

          {/* Lista de Variações Geradas */}
          {generatedVariations.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  Selecione as variações que deseja rodiziar na campanha ({selectedVariations.length}/{generatedVariations.length}):
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedVariations(
                      selectedVariations.length === generatedVariations.length
                        ? []
                        : generatedVariations.map((_, i) => i)
                    )
                  }
                  className="text-xs text-primary hover:underline"
                >
                  {selectedVariations.length === generatedVariations.length ? 'Desmarcar todas' : 'Selecionar todas'}
                </button>
              </div>

              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {generatedVariations.map((varText, idx) => {
                  const isChecked = selectedVariations.includes(idx);
                  return (
                    <div
                      key={idx}
                      onClick={() =>
                        setSelectedVariations((prev) =>
                          prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
                        )
                      }
                      className={cn(
                        'p-3.5 rounded-xl border text-xs cursor-pointer transition-all space-y-2',
                        isChecked
                          ? 'border-primary/50 bg-primary/5 shadow-sm'
                          : 'border-border bg-card hover:bg-secondary/30 opacity-70'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="h-3.5 w-3.5 accent-primary cursor-pointer"
                          />
                          Modelo {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(varText, idx);
                          }}
                          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                          title="Copiar texto"
                        >
                          {copiedIndex === idx ? (
                            <>
                              <Check className="h-3 w-3 text-whatsapp" />
                              Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              Copiar
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-foreground whitespace-pre-wrap leading-relaxed">{varText}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-card/50">
          <p className="text-[11px] text-muted-foreground">
            O RoboZap alternará entre os modelos para que contatos vizinhos nunca recebam o mesmo texto.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={
                loading ||
                (mode === 'spintax' ? !generatedSpintax : selectedVariations.length === 0)
              }
              onClick={handleApplySelected}
              className="flex items-center gap-1.5 rounded-xl bg-whatsapp px-5 py-2 text-xs font-bold text-white hover:bg-whatsapp/90 transition-all shadow-md shadow-whatsapp/20 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Aplicar à Campanha ({mode === 'spintax' ? 'Spintax' : `${selectedVariations.length} Modelos`})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
