'use client';

import { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Copy,
  Check,
  X,
  Clock,
  BookOpen,
  MessageCircle,
  HelpCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface AntiBanGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AntiBanGuideModal({ isOpen, onClose }: AntiBanGuideModalProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const appealText = `Olá equipe do suporte do WhatsApp,

Meu número comercial foi desconectado recentemente e acredito que tenha ocorrido um engano por parte dos filtros automatizados.
Utilizo esta conta para atendimento e comunicação profissional com clientes e parceiros da nossa empresa. Não tivemos a intenção de infringir nenhuma política e sempre prezamos pelo respeito aos usuários e por uma comunicação ética.

Poderiam gentilmente revisar e reativar a minha conta? Ela é fundamental para as nossas atividades operacionais diárias.

Agradeço imensamente pela atenção e compreensão.
Atenciosamente,`;

  const copyAppeal = () => {
    navigator.clipboard.writeText(appealText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: 'Texto de recurso copiado!',
      description: 'Cole no suporte do WhatsApp (pelo próprio app ou em support@whatsapp.com).',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-whatsapp/15 text-whatsapp border border-whatsapp/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Manual de Segurança Anti-Ban & Aquecimento de Chip
              </h2>
              <p className="text-xs text-muted-foreground">
                Tudo o que você precisa saber para proteger seus números e prospectar com segurança
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-foreground">
          {/* Card: Por que os números são banidos? */}
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <h3 className="font-bold text-sm text-destructive flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Por que a Meta (WhatsApp) bane um número?
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              O banimento <strong>não acontece por sorte ou azar</strong>, mas sim por 3 gatilhos claros monitorados por inteligência artificial da Meta:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="rounded-lg bg-card border border-border p-3 space-y-1">
                <span className="font-bold text-foreground">1. Denúncias de Spam</span>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  É a causa de <strong>90% dos banimentos</strong>. Quando um desconhecido recebe uma mensagem de venda agressiva (&quot;PROMOÇÃO IMPERDÍVEL 🚨&quot;), o botão <em>Denunciar como Spam</em> fica em destaque. Com apenas 3 a 5 denúncias, a conta cai.
                </p>
              </div>
              <div className="rounded-lg bg-card border border-border p-3 space-y-1">
                <span className="font-bold text-foreground">2. Mensagens Idênticas</span>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Enviar exatamente o mesmo texto e a mesma imagem para 50+ pessoas gera uma assinatura digital idêntica (hash). O robô da Meta detecta envio massivo em segundos.
                </p>
              </div>
              <div className="rounded-lg bg-card border border-border p-3 space-y-1">
                <span className="font-bold text-foreground">3. Chip &quot;Frio&quot; Sem Histórico</span>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  Chips novos ou recém-ativados têm score de reputação zero. Se começarem enviando 50 mensagens frias no primeiro dia, o bloqueio é imediato.
                </p>
              </div>
            </div>
          </div>

          {/* Card: Como recuperar o número banido (Texto de Recurso) */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-primary flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Como pedir desbanimento ao suporte do WhatsApp
              </h3>
              <button
                type="button"
                onClick={copyAppeal}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all text-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiado!' : 'Copiar Texto Pronto'}
              </button>
            </div>
            <p className="text-muted-foreground text-[11px]">
              Quando o app do WhatsApp mostrar a tela de &quot;Esta conta não tem permissão para usar o WhatsApp&quot;, clique em <strong>&quot;Solicitar análise&quot;</strong> e cole o texto abaixo. A taxa de reversão no primeiro banimento é superior a 80%:
            </p>
            <div className="rounded-lg border border-border bg-card p-3 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap select-all">
              {appealText}
            </div>
          </div>

          {/* Card: Protocolo de Aquecimento de Chip (14 Dias) */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              Protocolo de Aquecimento de Chip Novo (14 Dias)
            </h3>
            <p className="text-muted-foreground text-[11px]">
              Antes de disparar campanhas frias com um chip novo, execute esta rotina para criar reputação com o algoritmo da Meta:
            </p>
            <div className="space-y-2 text-[11px]">
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/30">
                <CheckCircle2 className="h-4 w-4 text-whatsapp shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">Dia 1 ao 3 (Configuração & Conversas Naturais):</strong>
                  <p className="text-muted-foreground">
                    Coloque foto de perfil real e recado. Adicione 5 a 10 contatos de amigos ou familiares e converse normalmente (troque áudios, figurinhas e mensagens nos dois sentidos). Entre em 2 ou 3 grupos da família ou trabalho.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/30">
                <CheckCircle2 className="h-4 w-4 text-whatsapp shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">Dia 4 ao 7 (Primeiros disparos graduais):</strong>
                  <p className="text-muted-foreground">
                    Dispare no máximo 15 a 20 mensagens por dia, utilizando o <strong>Modo Ultra-Seguro (30s a 90s)</strong> e mensagens personalizadas geradas com o Grok.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/30">
                <CheckCircle2 className="h-4 w-4 text-whatsapp shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">Dia 8 ao 14 (Aceleração controlada):</strong>
                  <p className="text-muted-foreground">
                    Aumente para 30 a 50 mensagens por dia. Mantenha os lotes de no máximo 15 a 20 contatos com pausas de 5 minutos entre eles.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card: 5 Regras de Ouro da Prospecção B2B */}
          <div className="rounded-xl border border-whatsapp/30 bg-whatsapp/5 p-4 space-y-2.5">
            <h3 className="font-bold text-sm text-whatsapp flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              As 5 Regras de Ouro para NUNCA Mais Perder um Chip
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-muted-foreground">
              <li>
                <strong className="text-foreground">Use variações de copy do Grok:</strong> Alterne entre 3 e 5 modelos diferentes para que contatos consecutivos nunca recebam a mesma mensagem.
              </li>
              <li>
                <strong className="text-foreground">Abordagem consultiva em vez de panfleto:</strong> Pergunte se a pessoa é a responsável por TI ou compras antes de despejar especificações técnicas e preços.
              </li>
              <li>
                <strong className="text-foreground">Nunca envie foto pesada ou link logo na primeira mensagem fria:</strong> O WhatsApp monitora links e anexos enviados para quem não te tem salvo. Se puder, pergunte primeiro se pode enviar a foto/tabela.
              </li>
              <li>
                <strong className="text-foreground">Respeite o Horário Comercial:</strong> Dispare apenas entre 08:30 e 18:30 em dias úteis. Mensagens à noite ou nos fins de semana geram o triplo de denúncias de spam.
              </li>
              <li>
                <strong className="text-foreground">Remova quem pedir para sair:</strong> O RoboZap já adiciona automaticamente à lista de Opt-Out quem responder &quot;sair&quot;. Nunca mais envie para quem pediu para parar.
              </li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 border-t border-border bg-card/60">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all"
          >
            Entendido, fechar manual
          </button>
        </div>
      </div>
    </div>
  );
}
