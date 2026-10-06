'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Send,
  Users,
  Clock,
  HelpCircle,
  AlertTriangle,
  Loader2,
  ChevronRight,
  FileText,
  Sparkles,
  PlusCircle,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  ImageIcon,
  Shuffle,
  PauseCircle,
  UserX,
  FlaskConical,
  Phone,
  Plus,
  Trash2,
  Wand2,
  BookOpen,
} from 'lucide-react';
import { SpreadsheetUpload, type SpreadsheetData } from '@/components/SpreadsheetUpload';
import { MediaUpload, type UploadedMedia } from '@/components/MediaUpload';
import { GrokVariationsModal } from '@/components/GrokVariationsModal';
import { AntiBanGuideModal } from '@/components/AntiBanGuideModal';
import { SpamShieldAlert, type SpamAnalysis } from '@/components/SpamShieldAlert';
import { apiFetch, BACKEND_URL } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const schema = z.object({
  name: z.string().min(1, 'Nome da campanha é obrigatório').max(100),
  messageTemplate: z.string().min(1, 'Mensagem ou legenda é obrigatória').max(4000),
  delayMin: z.coerce.number().min(5).max(300),
  delayMax: z.coerce.number().min(5).max(300),
  batchSize: z.coerce.number().min(5).max(100),
  batchPauseMin: z.coerce.number().min(1).max(30),
  randomizeMedia: z.boolean().default(true),
  optOutFooter: z.boolean().default(false),
}).refine((d) => d.delayMax >= d.delayMin, {
  message: 'Delay máximo deve ser maior que o mínimo',
  path: ['delayMax'],
});

type FormValues = z.infer<typeof schema>;

const STEPS = ['Lista de Contatos', 'Mensagem & Mídia', 'Revisão e Disparo'];

function cleanKey(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '')
    .trim();
}

function isInvalidName(name?: string | null): boolean {
  if (!name) return true;
  const clean = name.trim().toLowerCase();
  return (
    clean === '' ||
    clean === 'nome' ||
    clean === 'responsavel' ||
    clean === 'responsável' ||
    clean === 'contato' ||
    clean === 'destinatario' ||
    clean === 'destinatário' ||
    clean === 'cliente' ||
    clean === 'teste' ||
    clean === '-' ||
    clean === '—'
  );
}

function parseSpintax(text: string): string {
  if (!text) return '';
  // Exige pelo menos um pipe '|' para ser considerado Spintax
  const spintaxRegex = /\{([^{}|]+(?:\|[^{}|]+)+)\}/g;
  let result = text;
  let iterations = 0;
  while (spintaxRegex.test(result) && iterations < 5) {
    result = result.replace(spintaxRegex, (_match, choices: string) => {
      const parts = choices.split('|');
      return parts[Math.floor(Math.random() * parts.length)].trim();
    });
    iterations++;
  }
  return result;
}

function detectSpamLocal(rawMessage: string): SpamAnalysis {
  if (!rawMessage || typeof rawMessage !== 'string' || rawMessage.trim().length === 0) {
    return { isBlocked: false, score: 0, level: 'safe', violations: [], suggestions: [] };
  }
  const text = rawMessage.trim();
  const textWithoutVars = text.replace(/\{\{\s*[^}]+?\s*\}\}/g, '');
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9% ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const violations: any[] = [];
  const suggestions: string[] = [];
  let score = 0;

  const criticalPhrases = [
    'promocao imperdivel',
    'super promocao',
    'promocao b2b',
    'oferta imperdivel',
    'super oferta',
    'compre ja',
    'compre agora',
    '50% off',
    '70% off',
    'liquidacao',
    'queima de estoque',
    'ganhe dinheiro',
    'renda extra',
    'fique rico',
    'lucro garantido',
    'oportunidade unica',
    'ultimas unidades',
    'so hoje',
    'clique no link',
    'clique aqui',
    'acesse o link',
  ];

  for (const phrase of criticalPhrases) {
    if (normalized.includes(phrase)) {
      score += 35;
      violations.push({
        id: `crit_${phrase}`,
        rule: 'Gatilho Comercial Agressivo',
        description: `O termo "${phrase.toUpperCase()}" causa denúncias e banimento imediato no WhatsApp.`,
        snippet: phrase,
        severity: 'critical',
      });
      suggestions.push(`Substitua "${phrase}" por uma pergunta ou conversa consultiva.`);
    }
  }

  const warningWords = ['promocao', 'promocional', 'desconto exclusivo', 'preco imbativel', 'gratis', 'urgente', 'aproveite ja'];
  for (const word of warningWords) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(normalized)) {
      if (!violations.some((v) => v.description.toLowerCase().includes(word))) {
        score += 15;
        violations.push({
          id: `warn_${word}`,
          rule: 'Termo Suspeito de Spam',
          description: `O termo "${word}" eleva o risco de o destinatário clicar em Denunciar.`,
          snippet: word,
          severity: 'warning',
        });
      }
    }
  }

  // ALL CAPS
  const lettersOnly = textWithoutVars.replace(/[^a-zA-ZáéíóúÁÉÍÓÚãõÃÕâêîôûÂÊÎÔÛçÇ]/g, '');
  if (lettersOnly.length >= 15) {
    const uppercaseLetters = lettersOnly.replace(/[^A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ]/g, '');
    const uppercaseRatio = uppercaseLetters.length / lettersOnly.length;
    if (uppercaseRatio > 0.35) {
      score += 40;
      violations.push({
        id: 'caps',
        rule: 'Caixa Alta Excessiva (Gritaria)',
        description: `${Math.round(uppercaseRatio * 100)}% das letras estão em MAIÚSCULAS. A Meta classifica textos gritantes como spam robótico.`,
        severity: 'critical',
      });
      suggestions.push('Escreva em minúsculas normais.');
    }
  }

  // Emojis de alarme
  const alarmMatches = text.match(/(🚨|💣|🔥{2,}|💰{2,}|📢{2,}|⚠️{2,})/g);
  if (alarmMatches && alarmMatches.length > 0) {
    score += alarmMatches.length >= 2 ? 35 : 20;
    violations.push({
      id: 'alarm_emojis',
      rule: 'Emojis de Alarme / Urgência',
      description: `Emojis de alerta detectados (${alarmMatches.slice(0, 3).join(' ')}).`,
      severity: alarmMatches.length >= 2 ? 'critical' : 'warning',
    });
    suggestions.push('Remova emojis de sirene (🚨) ou alarme.');
  }

  // Encurtadores de link
  if (/\b(bit\.ly|tinyurl\.com|t\.me|linktr\.ee|cutt\.ly|encurtador)\b/i.test(text)) {
    score += 35;
    violations.push({
      id: 'shortener',
      rule: 'Link Encurtador no 1º Contato',
      description: 'Links encurtados em mensagens frias são o principal motivo de bloqueio pela Meta.',
      severity: 'critical',
    });
    suggestions.push('Remova links na primeira mensagem.');
  }

  const cappedScore = Math.min(Math.max(score, 0), 100);
  const hasCritical = violations.some((v) => v.severity === 'critical');
  const isBlocked = cappedScore >= 50 || (hasCritical && cappedScore >= 40);

  return {
    isBlocked,
    score: cappedScore,
    level: isBlocked ? 'blocked' : cappedScore > 20 ? 'warning' : 'safe',
    violations,
    suggestions: Array.from(new Set(suggestions)),
  };
}

export default function NewCampaignPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { waStatus } = useWhatsAppStatus();
  const [step, setStep] = useState(0);
  const [spreadsheetData, setSpreadsheetData] = useState<SpreadsheetData | null>(null);
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMedia | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Controle anti-duplicação e histórico de envios
  const [allowResend, setAllowResend] = useState(false);
  const [contactAnalysis, setContactAnalysis] = useState<{
    totalReceived: number;
    duplicatesInList: number;
    uniqueCount: number;
    alreadyContactedCount: number;
    alreadyContactedPhones: string[];
    sentTodayCount: number;
    sentTodayPhones: string[];
    optOutCount: number;
    optOutPhones: string[];
    newContactsCount: number;
  } | null>(null);

  const analyzeContacts = async (contacts: any[]) => {
    if (!contacts || contacts.length === 0) return;
    try {
      const res = await apiFetch<any>('/api/campaigns/check-contacts', {
        method: 'POST',
        body: JSON.stringify({ contacts }),
      });
      setContactAnalysis(res);
    } catch (_) {}
  };

  // Controle de variações de mensagem (Multi-copy Grok & Spintax)
  const [variations, setVariations] = useState<string[]>(['']);
  const [activeVariationIndex, setActiveVariationIndex] = useState(0);
  const [showGrokModal, setShowGrokModal] = useState(false);
  const [showAntiBanGuide, setShowAntiBanGuide] = useState(false);
  const [delayPreset, setDelayPreset] = useState<'ultra' | 'moderado' | 'custom'>('ultra');

  const applyPreset = (preset: 'ultra' | 'moderado' | 'custom') => {
    setDelayPreset(preset);
    if (preset === 'ultra') {
      setValue('delayMin', 25);
      setValue('delayMax', 65);
      setValue('batchSize', 15);
      setValue('batchPauseMin', 5);
    } else if (preset === 'moderado') {
      setValue('delayMin', 15);
      setValue('delayMax', 45);
      setValue('batchSize', 20);
      setValue('batchPauseMin', 3);
    }
  };

  const handleCurrentTextChange = (text: string) => {
    setVariations((prev) => {
      const next = [...prev];
      next[activeVariationIndex] = text;
      return next;
    });
    setValue('messageTemplate', text, { shouldValidate: true });
  };

  const switchVariationTab = (idx: number) => {
    setActiveVariationIndex(idx);
    setValue('messageTemplate', variations[idx] || '', { shouldValidate: true });
  };

  const addVariation = () => {
    if (variations.length >= 8) {
      toast({ title: 'Limite atingido', description: 'Você pode criar até 8 variações de mensagem.' });
      return;
    }
    const next = [...variations, ''];
    setVariations(next);
    setActiveVariationIndex(next.length - 1);
    setValue('messageTemplate', '', { shouldValidate: true });
  };

  const removeVariation = (indexToRemove: number) => {
    if (variations.length <= 1) return;
    const next = variations.filter((_, i) => i !== indexToRemove);
    setVariations(next);
    const newIdx = Math.min(activeVariationIndex, next.length - 1);
    setActiveVariationIndex(newIdx);
    setValue('messageTemplate', next[newIdx] || '', { shouldValidate: true });
  };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      messageTemplate: '',
      delayMin: 25,
      delayMax: 65,
      batchSize: 15,
      batchPauseMin: 5,
      randomizeMedia: true,
      optOutFooter: false,
    },
  });

  const template = watch('messageTemplate');
  const delayMin = watch('delayMin');
  const delayMax = watch('delayMax');
  const batchSize = watch('batchSize');
  const batchPauseMin = watch('batchPauseMin');
  const randomizeMedia = watch('randomizeMedia');
  const optOutFooter = watch('optOutFooter');

  // Análise anti-spam em tempo real (Meta Shield)
  const currentActiveText = variations[activeVariationIndex] || template || '';
  const currentSpamAnalysis = detectSpamLocal(currentActiveText);

  // Verifica se alguma das variações preenchidas possui bloqueio crítico anti-spam
  const anyVariationBlocked = variations.some((v) => {
    if (!v || v.trim().length === 0) return false;
    return detectSpamLocal(v).isBlocked;
  });

  const estimateTime = () => {
    if (!spreadsheetData || spreadsheetData.contacts.length === 0) return null;
    const avg = (Number(delayMin) + Number(delayMax)) / 2;
    const remaining = spreadsheetData.contacts.length;
    const numBatches = Math.floor(remaining / Number(batchSize || 20));
    const pauseSeconds = numBatches * (Number(batchPauseMin || 3) * 60);
    const totalSec = Math.round(remaining * avg + pauseSeconds);

    const m = Math.floor(totalSec / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `~${h}h ${m % 60}min`;
    if (m > 0) return `~${m}min`;
    return `~${totalSec}s`;
  };

  const previewMessage = (contact?: Record<string, string | undefined>, customTemplate?: string) => {
    const rawTemplate = customTemplate !== undefined ? customTemplate : (variations[activeVariationIndex] || template);
    if (!contact || !rawTemplate) return rawTemplate || '';

    let message = parseSpintax(rawTemplate);

    const normalizedMap = new Map<string, string>();
    for (const [key, val] of Object.entries(contact)) {
      if (val !== undefined && val !== null) {
        normalizedMap.set(cleanKey(key), String(val));
      }
    }

    const rawContactName =
      contact.name ||
      contact['Responsável'] ||
      contact['Responsavel'] ||
      contact['Nome'] ||
      contact['Contato'] ||
      '';
    const contactName = isInvalidName(rawContactName) ? '' : rawContactName.trim();
    const contactCompany =
      contact.company ||
      contact['Nome da Empresa'] ||
      contact['Empresa'] ||
      contact['Cliente'] ||
      '';
    const contactPhone =
      contact.formattedPhone ||
      contact.phone ||
      contact['Telefone'] ||
      contact['Telefone / WhatsApp público'] ||
      '';

    message = message.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey: string) => {
      const trimmedKey = rawKey.trim();
      const cKey = cleanKey(trimmedKey);

      // Regra de ouro: se não tiver nome salvo, não manda nada no lugar do nome
      if (cKey === 'nome' || cKey === 'responsavel' || cKey === 'contato') {
        return contactName;
      }
      if (cKey === 'empresa' || cKey === 'nomedaempresa' || cKey === 'razaosocial') {
        return contactCompany;
      }
      if (cKey === 'telefone' || cKey === 'whatsapp' || cKey === 'celular' || cKey === 'fone') {
        return contactPhone;
      }

      if (contact[trimmedKey] !== undefined && contact[trimmedKey] !== null) {
        const val = String(contact[trimmedKey]).trim();
        return isInvalidName(val) ? '' : val;
      }

      if (normalizedMap.has(cKey)) {
        const val = normalizedMap.get(cKey)!.trim();
        return isInvalidName(val) ? '' : val;
      }

      return '';
    });

    message = message
      .replace(/\s+,/g, ',')
      .replace(/\s+!/g, '!')
      .replace(/\s+\?/g, '?')
      .replace(/\s+\./g, '.')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    if (optOutFooter) {
      message += '\n\n_Se deseja não receber mais digite sair._';
    }

    return message.trim();
  };

  const insertVariable = (varName: string) => {
    const textarea = textareaRef.current;
    const tag = `{{${varName}}}`;
    const currentVal = variations[activeVariationIndex] || '';
    if (!textarea) {
      handleCurrentTextChange(currentVal ? `${currentVal} ${tag}` : tag);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = currentVal.substring(0, start);
    const after = currentVal.substring(end);
    const newText = before + tag + after;

    handleCurrentTextChange(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 50);
  };

  const insertSpintaxExample = () => {
    const example = '{Olá|Oi|Bom dia} {{Responsável}}, {tudo bem?|como vai?}';
    const currentVal = variations[activeVariationIndex] || '';
    handleCurrentTextChange(currentVal ? `${currentVal}\n${example}` : example);
    toast({
      title: '🔀 Spintax inserido!',
      description: 'O sistema alternará automaticamente entre "Olá", "Oi" e "Bom dia" para cada contato.',
    });
  };

  const [testPhone, setTestPhone] = useState('11952171047');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);

  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      toast({ title: 'Atenção', description: 'Digite o número do seu WhatsApp com DDD para receber o teste.', variant: 'destructive' });
      return;
    }
    if (!template.trim()) {
      toast({ title: 'Atenção', description: 'Escreva a mensagem ou legenda antes de enviar o teste.', variant: 'destructive' });
      return;
    }

    const spamCheck = detectSpamLocal(variations[activeVariationIndex] || template);
    if (spamCheck.isBlocked) {
      toast({
        title: '🚫 Teste Bloqueado por Risco de Spam',
        description: 'Esta mensagem contém termos com alto risco de banimento no WhatsApp. Clique em "Limpar com Grok" antes de disparar o teste.',
        variant: 'destructive',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const sampleContact = spreadsheetData?.preview[0] || {
        'Responsável': 'Você (Teste)',
        'Nome': 'Você (Teste)',
        'Nome da Empresa': 'Sua Empresa Teste',
        'Empresa': 'Sua Empresa Teste',
        'Telefone': testPhone,
        'Oferta inicial': 'Lote Especial de Servidores',
      };

      const finalMessage = previewMessage(sampleContact as any);

      const res = await apiFetch<{ success: boolean; message: string }>('/api/campaigns/test-send', {
        method: 'POST',
        body: JSON.stringify({
          phone: testPhone,
          message: finalMessage,
          mediaUrl: uploadedMedia ? uploadedMedia.filePath : null,
          randomizeMedia: true,
        }),
      });

      setTestResult({ success: true, message: res.message });
      toast({
        title: '🧪 Teste Enviado com Sucesso!',
        description: `Confira o WhatsApp do número ${testPhone}.`,
      });
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
      toast({
        title: 'Falha no envio de teste',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  async function onSubmit(values: FormValues) {
    if (!spreadsheetData || spreadsheetData.contacts.length === 0) {
      toast({ title: 'Erro', description: 'Nenhum contato válido na planilha.', variant: 'destructive' });
      return;
    }

    if (!spreadsheetData.hasPhoneColumn) {
      toast({
        title: 'Erro',
        description: 'A planilha não possui coluna de telefone selecionada.',
        variant: 'destructive',
      });
      return;
    }

    if (!isConnected) {
      toast({
        title: 'WhatsApp Desconectado',
        description: 'Conecte seu WhatsApp via QR Code antes de iniciar os disparos.',
        variant: 'destructive',
      });
      return;
    }

    const validVariations = variations.map((v) => v.trim()).filter((v) => v.length > 0);
    const primaryTemplate = validVariations[0] || values.messageTemplate;

    if (!primaryTemplate) {
      toast({ title: 'Atenção', description: 'Escreva pelo menos um modelo de mensagem.', variant: 'destructive' });
      return;
    }

    const blockedIdx = validVariations.findIndex((v) => detectSpamLocal(v).isBlocked);
    if (blockedIdx !== -1) {
      toast({
        title: '🚫 Campanha Bloqueada por Proteção Anti-Spam',
        description: `O Modelo ${blockedIdx + 1} contém termos com alto risco de banimento da Meta no WhatsApp. Clique em "Limpar com Grok" para liberar o envio com segurança.`,
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ campaign: { id: string } }>('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name,
          contacts: spreadsheetData.contacts,
          allowResend,
          messageTemplate: primaryTemplate,
          messageVariations: validVariations.length > 1 ? validVariations : undefined,
          mediaUrl: uploadedMedia ? uploadedMedia.filePath : null,
          mediaType: 'image',
          delayMin: values.delayMin,
          delayMax: values.delayMax,
          batchSize: values.batchSize,
          batchPauseMin: values.batchPauseMin,
          randomizeMedia: values.randomizeMedia,
          optOutFooter: values.optOutFooter,
        }),
      });

      toast({
        title: '🚀 Campanha criada com sucesso!',
        description: `${spreadsheetData.contacts.length} mensagens com blindagem anti-ban prontas para envio.`,
      });

      router.push(`/campaigns/${res.campaign.id}`);
    } catch (err: any) {
      toast({ title: 'Erro ao criar campanha', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  const isConnected = waStatus.status === 'connected';
  const effectiveToSend =
    allowResend || !contactAnalysis?.alreadyContactedCount
      ? spreadsheetData?.contacts.length || 0
      : contactAnalysis.newContactsCount;

  return (
    <div className="mx-auto max-w-3xl space-y-8 animate-slide-up pb-16">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nova Campanha com Fotos & Anti-Ban</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dispare mensagens e fotos com Spintax, hash único e resfriamento inteligente de lotes
        </p>
      </div>

      {/* WhatsApp status warning */}
      {!isConnected && (
        <div className="flex items-center gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-4">
          <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-semibold text-yellow-400">WhatsApp não conectado:</span>{' '}
            <span className="text-muted-foreground">
              Você pode preparar e revisar a campanha com fotos agora. Para os disparos iniciarem, conecte seu aparelho via QR Code.{' '}
              <Link href="/connect" className="text-primary underline underline-offset-2 font-medium">
                Conectar WhatsApp →
              </Link>
            </span>
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={i} className="flex flex-1 items-center">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all',
                  i < step
                    ? 'bg-primary text-primary-foreground'
                    : i === step
                    ? 'bg-primary text-primary-foreground ring-4 ring-primary/20 shadow-md'
                    : 'bg-secondary text-muted-foreground'
                )}
              >
                {i < step ? '✓' : i + 1}
              </div>
              <span
                className={cn(
                  'text-xs font-medium hidden sm:block',
                  i === step ? 'text-foreground font-semibold' : 'text-muted-foreground'
                )}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'mx-3 h-0.5 flex-1 transition-all',
                  i < step ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Campaign name */}
        <div className="space-y-1.5 rounded-2xl border border-border bg-card p-5">
          <label className="text-sm font-semibold text-foreground">
            Nome da Campanha <span className="text-destructive">*</span>
          </label>
          <input
            {...register('name')}
            placeholder="Ex: Oferta de Servidores & Switches com Foto — Setembro"
            className={cn(
              'w-full rounded-xl border bg-secondary/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all',
              errors.name ? 'border-destructive' : 'border-border'
            )}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        {/* STEP 0 — Upload & Column Mapping */}
        {step === 0 && (
          <div className="space-y-5">
            <SpreadsheetUpload
              onParsed={(data) => {
                setSpreadsheetData(data);
                analyzeContacts(data.contacts);
              }}
              onClear={() => {
                setSpreadsheetData(null);
                setContactAnalysis(null);
              }}
            />

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!spreadsheetData || !spreadsheetData.hasPhoneColumn || spreadsheetData.contacts.length === 0}
                onClick={() => {
                  if (!watch('name') && spreadsheetData?.filename) {
                    setValue('name', `Campanha ${spreadsheetData.filename.replace(/\.[^/.]+$/, '')}`);
                  }
                  setStep(1);
                }}
                className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Avançar para Mensagem & Foto
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 1 — Message template, Photo attachment & Anti-Ban Controls */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Foto / Mídia Upload */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-whatsapp" />
                  <h3 className="text-sm font-semibold text-foreground">Anexo de Foto (Opcional)</h3>
                </div>
                {uploadedMedia && (
                  <span className="text-[11px] font-semibold rounded-full bg-whatsapp/15 text-whatsapp px-2 py-0.5 border border-whatsapp/30">
                    Foto pronta para envio
                  </span>
                )}
              </div>
              <MediaUpload media={uploadedMedia} onMediaSelected={setUploadedMedia} />
            </div>

            {/* Mensagem / Legenda com Variações Grok IA & Spintax */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3.5">
                <div>
                  <label className="text-sm font-semibold text-foreground">
                    {uploadedMedia ? 'Legenda da Foto' : 'Texto da Mensagem'} <span className="text-destructive">*</span>
                  </label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Crie múltiplos modelos com Grok IA para não disparar a mesma mensagem para todos
                  </p>
                </div>
                <div className="flex items-center flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowGrokModal(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-primary px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-95 hover:scale-[1.02] transition-all"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-yellow-300 animate-pulse" />
                    <span>Gerar com IA Grok</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAntiBanGuide(true)}
                    className="flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-all"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Guia Anti-Ban</span>
                  </button>
                  <button
                    type="button"
                    onClick={insertSpintaxExample}
                    className="flex items-center gap-1 text-xs text-primary hover:underline font-medium px-1 py-1"
                    title="Inserir exemplo de variação de texto para evitar mensagens idênticas"
                  >
                    <Shuffle className="h-3 w-3" />
                    + Spintax
                  </button>
                </div>
              </div>

              {/* Variation Tabs */}
              <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
                <div className="flex items-center gap-1.5 flex-nowrap">
                  {variations.map((_, i) => (
                    <div key={i} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => switchVariationTab(i)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap',
                          activeVariationIndex === i
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-secondary/70 text-muted-foreground hover:bg-secondary hover:text-foreground'
                        )}
                      >
                        <span>Modelo {i + 1}</span>
                        {variations[i]?.trim().length > 0 && (
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              activeVariationIndex === i ? 'bg-primary-foreground' : 'bg-whatsapp'
                            )}
                          />
                        )}
                      </button>
                      {variations.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeVariation(i);
                          }}
                          className="ml-0.5 p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                          title={`Excluir Modelo ${i + 1}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}

                  {variations.length < 6 && (
                    <button
                      type="button"
                      onClick={addVariation}
                      className="flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-all whitespace-nowrap"
                      title="Adicionar mais um modelo de mensagem para rodízio"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>+ Modelo</span>
                    </button>
                  )}
                </div>

                <span className="text-xs text-muted-foreground font-mono shrink-0">
                  {(variations[activeVariationIndex] || '').length}/4000
                </span>
              </div>

              {/* Dynamic Variable Insertion Pills */}
              {spreadsheetData?.columns && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Inserir variável da planilha:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {spreadsheetData.columns.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => insertVariable(col)}
                        className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 hover:border-primary/50 transition-colors"
                        title={`Clique para inserir {{${col}}} no texto`}
                      >
                        <PlusCircle className="h-3 w-3" />
                        {col}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Textarea */}
              <textarea
                value={variations[activeVariationIndex] || ''}
                onChange={(e) => handleCurrentTextChange(e.target.value)}
                ref={textareaRef}
                rows={7}
                placeholder={`{Olá|Oi|Bom dia} {{Responsável}}! {Tudo bem?|Como vai?}\n\nVi que você atua na {{Nome da Empresa}}.\n\nTemos ofertas imperdíveis de servidores e switches pronta entrega!\n\nSegue a foto do lote anexo.`}
                className={cn(
                  'w-full rounded-xl border bg-secondary/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-y font-sans',
                  errors.messageTemplate && (!variations[0] || variations[0].trim().length === 0)
                    ? 'border-destructive'
                    : 'border-border'
                )}
              />
              {errors.messageTemplate && (!variations[0] || variations[0].trim().length === 0) && (
                <p className="text-xs text-destructive">{errors.messageTemplate.message}</p>
              )}

              {/* 🛡️ Alerta de Proteção Anti-Spam (Meta Shield) */}
              <SpamShieldAlert
                analysis={currentSpamAnalysis}
                messageText={currentActiveText}
                onApplyCleanedMessage={(cleaned) => handleCurrentTextChange(cleaned)}
              />

              {/* Info Rodízio Ativo */}
              {variations.length > 1 && (
                <div className="flex items-center gap-2 rounded-xl bg-purple-500/10 border border-purple-500/25 p-3 text-xs text-foreground">
                  <Shuffle className="h-4 w-4 text-purple-400 shrink-0" />
                  <span>
                    <strong>Rodízio Inteligente Ativo:</strong> Você configurou <strong>{variations.length} modelos</strong>. O sistema distribuirá alternadamente (Round-Robin) entre seus contatos, impedindo que a Meta detecte o mesmo hash textual repetitivo!
                  </span>
                </div>
              )}
            </div>

            {/* 🛡️ CENTRAL DE BLINDAGEM ANTI-BAN */}
            <div className="rounded-2xl border border-whatsapp/30 bg-card p-6 space-y-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-whatsapp" />
                  <h3 className="font-bold text-foreground">Central de Blindagem Anti-Ban (Regras Anti-Spam)</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAntiBanGuide(true)}
                  className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Guia Completo
                </button>
              </div>

              {/* Delay Presets Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  Perfil de Segurança e Velocidade:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => applyPreset('ultra')}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all',
                      delayPreset === 'ultra'
                        ? 'border-emerald-500 bg-emerald-500/15 shadow-sm ring-1 ring-emerald-500/30'
                        : 'border-border bg-secondary/30 hover:bg-secondary/50'
                    )}
                  >
                    <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <span>🟢 Ultra Seguro (Recomendado)</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">25s – 65s · Lote 15 · Pausa 5m</p>
                    <p className="text-[10px] text-emerald-400/80 font-medium mt-1">
                      Ideal para evitar bans e chips novos
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyPreset('moderado')}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all',
                      delayPreset === 'moderado'
                        ? 'border-yellow-500 bg-yellow-500/15 shadow-sm ring-1 ring-yellow-500/30'
                        : 'border-border bg-secondary/30 hover:bg-secondary/50'
                    )}
                  >
                    <p className="text-xs font-bold text-yellow-400 flex items-center gap-1.5">
                      <span>🟡 Moderado</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">15s – 45s · Lote 20 · Pausa 3m</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Chips aquecidos &gt; 30 dias de uso
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDelayPreset('custom')}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all',
                      delayPreset === 'custom'
                        ? 'border-primary bg-primary/15 shadow-sm ring-1 ring-primary/30'
                        : 'border-border bg-secondary/30 hover:bg-secondary/50'
                    )}
                  >
                    <p className="text-xs font-bold text-foreground">⚙️ Personalizado</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Ajuste manual de parâmetros</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Definir tempos nos campos abaixo</p>
                  </button>
                </div>
              </div>

              {/* Delay entre disparos */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Clock className="h-4 w-4 text-primary" />
                  <span>1. Intervalo Aleatório Humanizado entre Mensagens</span>
                  <div className="group relative ml-1">
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-72 rounded-xl bg-popover border border-border p-3 text-xs text-foreground shadow-xl z-50">
                      Gera um atraso aleatório a cada envio e simula o indicador &quot;digitando...&quot;, emulando o ritmo de um ser humano real no WhatsApp.
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Mínimo (segundos)</label>
                    <input
                      {...register('delayMin')}
                      type="number"
                      min={5}
                      max={300}
                      className="w-full rounded-xl border border-border bg-secondary/50 px-3.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Máximo (segundos)</label>
                    <input
                      {...register('delayMax')}
                      type="number"
                      min={5}
                      max={300}
                      className="w-full rounded-xl border border-border bg-secondary/50 px-3.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
              </div>

              {/* Resfriamento por lotes (Batch Cooling) */}
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <PauseCircle className="h-4 w-4 text-primary" />
                  <span>2. Resfriamento Automático por Lotes (Batch Cooling)</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Faz uma pausa estratégica periódica para simular pausas normais de trabalho e evitar picos de tráfego que acionam os alertas de bot da Meta.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Tamanho do lote (contatos)</label>
                    <input
                      {...register('batchSize')}
                      type="number"
                      min={5}
                      max={100}
                      className="w-full rounded-xl border border-border bg-secondary/50 px-3.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">Pausa entre lotes (minutos)</label>
                    <input
                      {...register('batchPauseMin')}
                      type="number"
                      min={1}
                      max={30}
                      className="w-full rounded-xl border border-border bg-secondary/50 px-3.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>
              </div>

              {/* Toggles Anti-Ban */}
              <div className="space-y-3 pt-3 border-t border-border">
                {/* Hash Único por Foto */}
                <label className="flex items-center justify-between p-3 rounded-xl bg-secondary/40 hover:bg-secondary/60 transition-colors cursor-pointer">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-whatsapp" />
                      Hash Criptográfico SHA-256 Único por Foto
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Modifica a assinatura digital de cada foto enviada para impedir que a Meta detecte o envio em massa da mesma imagem.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    {...register('randomizeMedia')}
                    className="h-4 w-4 accent-whatsapp cursor-pointer"
                  />
                </label>

                {/* Opt-Out Footer */}
                <label className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <UserX className="h-4 w-4 text-whatsapp" />
                      Rodapé de Cancelamento (&quot;Se deseja não receber mais digite sair.&quot;)
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Desmarcado por padrão. Se ativado, inclui o aviso no final da mensagem para quem responder SAIR ser removido automaticamente.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    {...register('optOutFooter')}
                    className="h-4 w-4 accent-whatsapp cursor-pointer"
                  />
                </label>
              </div>

              {estimateTime() && (
                <div className="rounded-xl bg-whatsapp/10 border border-whatsapp/20 p-3 text-xs text-foreground flex items-center justify-between">
                  <span>⏱️ Duração total estimada com pausas de proteção:</span>
                  <strong className="text-whatsapp font-bold">{estimateTime()}</strong>
                </div>
              )}
            </div>

            {/* Realtime Live Preview Card (Com Foto se houver) */}
            {template && spreadsheetData?.preview[0] && (
              <div className="rounded-2xl border border-whatsapp/30 bg-whatsapp/5 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-whatsapp flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    Prévia do WhatsApp (Contato #1: {spreadsheetData.preview[0].name || spreadsheetData.preview[0].formattedPhone || spreadsheetData.preview[0].phone})
                  </p>
                  <span className="text-xs text-muted-foreground font-mono">
                    {spreadsheetData.preview[0].formattedPhone || spreadsheetData.preview[0].phone}
                  </span>
                </div>

                {/* Balão de mensagem simulando WhatsApp */}
                <div className="max-w-md rounded-2xl bg-[#0b141a] border border-[#222e35] p-3 text-white shadow-xl space-y-2">
                  {uploadedMedia && (
                    <div className="relative overflow-hidden rounded-xl bg-black/60 max-h-56">
                      <img
                        src={uploadedMedia.url.startsWith('http') ? uploadedMedia.url : `${BACKEND_URL}${uploadedMedia.url}`}
                        alt="Anexo da mensagem"
                        className="w-full object-cover rounded-lg"
                      />
                    </div>
                  )}
                  <p className="whitespace-pre-wrap text-sm text-[#e9edef] leading-relaxed font-sans px-1">
                    {previewMessage(spreadsheetData.preview[0] as Record<string, string | undefined>)}
                  </p>
                  <div className="flex justify-end text-[10px] text-[#8696a0]">
                    <span>10:30 ✓✓</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                Voltar à Lista
              </button>
              <button
                type="button"
                disabled={!template || template.trim() === '' || anyVariationBlocked}
                onClick={() => {
                  if (anyVariationBlocked) {
                    toast({
                      title: '🚫 Mensagem Bloqueada por Proteção Anti-Spam',
                      description: 'Elimine os termos agressivos ou use o botão "Limpar & Desbloquear com Grok" para poder avançar com segurança.',
                      variant: 'destructive',
                    });
                    return;
                  }
                  setStep(2);
                }}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50',
                  anyVariationBlocked
                    ? 'bg-destructive/80 text-destructive-foreground hover:bg-destructive cursor-not-allowed'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {anyVariationBlocked ? '🚫 Bloqueado por Risco de Spam' : 'Revisar Disparo'}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 — Final Review & Launch */}
        {step === 2 && spreadsheetData && (
          <div className="space-y-6">
            {/* 🛡️ CARD ANTI-DUPLICAÇÃO / REENVIO INTELIGENTE */}
            {contactAnalysis && contactAnalysis.alreadyContactedCount > 0 && (
              <div
                className={cn(
                  'rounded-2xl border p-5 space-y-3 transition-all',
                  allowResend
                    ? 'border-yellow-500/40 bg-yellow-500/10'
                    : 'border-emerald-500/40 bg-emerald-500/10'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-xl shrink-0',
                        allowResend
                          ? 'bg-yellow-500/20 text-yellow-500'
                          : 'bg-emerald-500/20 text-emerald-400'
                      )}
                    >
                      {allowResend ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-foreground">
                        {allowResend
                          ? `⚠️ Reenvio Habilitado: ${contactAnalysis.alreadyContactedCount} contato(s) receberão mensagem novamente`
                          : `🛡️ Proteção Anti-Envio Duplicado Ativa (${contactAnalysis.alreadyContactedCount} contatos já receberam antes)`}
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {allowResend ? (
                          <span>
                            Você optou por <strong>reenviar</strong> para todos. Todos os {spreadsheetData.contacts.length} contatos da lista receberão a mensagem.
                          </span>
                        ) : (
                          <span>
                            Identificamos que <strong>{contactAnalysis.alreadyContactedCount}</strong> dos {spreadsheetData.contacts.length} contatos desta lista já receberam mensagens em campanhas passadas. Por segurança, o sistema <strong>não enviará mensagem repetida</strong> para eles, disparando apenas para os <strong>{contactAnalysis.newContactsCount} contatos novos</strong>.
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border/60">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allowResend}
                      onChange={(e) => setAllowResend(e.target.checked)}
                      className="h-4 w-4 rounded accent-primary cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-foreground">
                      Permitir reenviar mensagem para contatos que já receberam antes
                    </span>
                  </label>
                  <p className="text-[11px] text-muted-foreground pl-7">
                    Deixe desmarcado para disparar somente para quem nunca recebeu mensagens do sistema.
                  </p>
                </div>
              </div>
            )}

            {/* 🛡️ CARD TRAVA INTELIGENTE DIÁRIA ANTI-SPAM (MESMO DIA) */}
            {contactAnalysis && contactAnalysis.sentTodayCount > 0 && (
              <div className="rounded-2xl border border-sky-500/40 bg-sky-500/10 p-5 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-foreground">
                      🛡️ Trava Anti-Spam Diária Ativa ({contactAnalysis.sentTodayCount} contato(s) já receberam mensagem hoje)
                    </h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Para blindar seu WhatsApp contra bloqueios e não importunar clientes, o sistema <strong>bloqueia múltiplos envios para a mesma pessoa no mesmo dia</strong>. Esses {contactAnalysis.sentTodayCount} contatos serão ignorados com segurança nesta campanha.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ROTAÇÃO MULTI-MODELOS GROK */}
            {(() => {
              const validVars = variations.map((v) => v.trim()).filter((v) => v.length > 0);
              if (validVars.length <= 1) return null;
              return (
                <div className="rounded-2xl border border-purple-500/30 bg-purple-500/10 p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/20 text-purple-400 shrink-0">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-foreground">
                          🔄 Rodízio Multi-Mensagens Ativo ({validVars.length} Modelos Grok IA)
                        </h4>
                        <span className="text-[10px] font-semibold text-purple-400 px-2 py-0.5 rounded-full bg-purple-500/20">
                          Anti-Hash Ativo
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Seus contatos receberão mensagens diferentes alternadas em fila (Contato #1 recebe Modelo 1, Contato #2 recebe Modelo 2...). Isso quebra o padrão de disparos em lote e protege seu chip contra o algoritmo anti-spam da Meta.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Stats Overview */}
            <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border">
                {[
                  {
                    icon: Users,
                    label:
                      !allowResend && contactAnalysis && contactAnalysis.alreadyContactedCount > 0
                        ? `${contactAnalysis.alreadyContactedCount} já contatados`
                        : 'Contatos a Disparar',
                    value:
                      !allowResend && contactAnalysis && contactAnalysis.alreadyContactedCount > 0
                        ? `${effectiveToSend} novos`
                        : spreadsheetData.contacts.length,
                  },
                  {
                    icon: Shuffle,
                    label: 'Modelos de Mensagem',
                    value: `${variations.filter((v) => v.trim().length > 0).length || 1} modelo(s)`,
                  },
                  {
                    icon: Clock,
                    label: 'Tempo Estimado',
                    value: estimateTime() || '—',
                  },
                  {
                    icon: ImageIcon,
                    label: 'Foto Anexa',
                    value: uploadedMedia ? 'Sim (1 Foto)' : 'Apenas Texto',
                  },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="p-4 text-center">
                    <Icon className="mx-auto mb-1.5 h-5 w-5 text-primary" />
                    <p className="text-lg sm:text-xl font-bold text-foreground">{value}</p>
                    <p className="text-[11px] sm:text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              {/* Resumo de Blindagem Anti-Ban */}
              <div className="p-5 bg-whatsapp/5 space-y-2">
                <p className="text-xs font-semibold text-whatsapp flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  Blindagem Anti-Ban Ativada para esta Campanha:
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <p>✓ Delay: {delayMin}s a {delayMax}s (Humanizado)</p>
                  <p>✓ Lote: {batchSize} contatos (Pausa de {batchPauseMin} min)</p>
                  <p>✓ Hash Único de Foto: {randomizeMedia ? 'Ativado' : 'Desativado'}</p>
                  <p>✓ Rodapé Anti-Denúncia: {optOutFooter ? 'Ativado (SAIR)' : 'Desativado'}</p>
                  <p className="col-span-2 text-whatsapp font-medium flex items-center gap-1">
                    ✓ Escudo de Conteúdo Anti-Spam: Aprovado (Zero gatilhos de bloqueio)
                  </p>
                </div>
                {anyVariationBlocked && (
                  <div className="rounded-xl border border-destructive/40 bg-destructive/15 p-3 text-xs text-destructive font-semibold flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>
                      ⚠️ ATENÇÃO: Pelo menos um modelo contém termos bloqueados por SPAM. Corrija antes de disparar.
                    </span>
                  </div>
                )}
              </div>

              {/* Message Sample Preview */}
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Prévia das mensagens que serão enviadas:
                  </p>
                  {variations.filter((v) => v.trim().length > 0).length > 1 && (
                    <span className="text-xs text-purple-400 font-medium">
                      Alternadas automaticamente contato a contato
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {variations
                    .map((v, idx) => ({ text: v.trim(), idx }))
                    .filter((item) => item.text.length > 0)
                    .map(({ text, idx }) => (
                      <div key={idx} className="rounded-xl bg-secondary/50 p-4 space-y-2 border border-border/50">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-primary flex items-center gap-1.5">
                            <span>Modelo {idx + 1}</span>
                            {idx === 0 && (
                              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.2 rounded font-normal">
                                Principal
                              </span>
                            )}
                          </span>
                          <span className="text-muted-foreground font-mono text-[11px]">
                            Recebido pelo Contato #{idx + 1}
                          </span>
                        </div>
                        {uploadedMedia && idx === 0 && (
                          <div className="flex items-center gap-2 text-xs text-whatsapp font-medium">
                            <ImageIcon className="h-4 w-4" />
                            <span>Foto inclusa: {uploadedMedia.filename}</span>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
                          {previewMessage(spreadsheetData.preview[0] as Record<string, string | undefined>, text)}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* 🧪 CARD DE TESTE MANUAL ANTES DO DISPARO (Heurística #5 - Prevenção de Erros) */}
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary">
                    <FlaskConical className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Disparar Teste Manual no Meu WhatsApp</h4>
                    <p className="text-xs text-muted-foreground">Envie uma mensagem real para o seu próprio celular para conferir foto, legenda e visual antes de iniciar o disparo em massa.</p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-primary px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 hidden sm:inline-block">
                  Recomendado
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="Seu número com DDD (ex: 11952171047)"
                    className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={testing || !testPhone.trim()}
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50"
                >
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {testing ? 'Enviando Teste...' : 'Enviar Teste no Meu WhatsApp'}
                </button>
              </div>

              {/* Atalhos para os números de teste autorizados */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">Usar número de teste:</span>
                <button
                  type="button"
                  onClick={() => setTestPhone('11952171047')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg border transition-all text-xs font-mono',
                    testPhone === '11952171047'
                      ? 'bg-primary text-primary-foreground border-primary font-bold'
                      : 'bg-secondary hover:bg-secondary/80 border-border text-foreground'
                  )}
                >
                  (11) 95217-1047
                </button>
                <button
                  type="button"
                  onClick={() => setTestPhone('11982815534')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg border transition-all text-xs font-mono',
                    testPhone === '11982815534'
                      ? 'bg-primary text-primary-foreground border-primary font-bold'
                      : 'bg-secondary hover:bg-secondary/80 border-border text-foreground'
                  )}
                >
                  (11) 98281-5534
                </button>
              </div>

              {testResult?.success && (
                <div className="flex items-center gap-2 rounded-xl bg-whatsapp/15 border border-whatsapp/30 p-3.5 text-xs text-whatsapp font-medium animate-slide-up">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{testResult.message} Olhe seu WhatsApp para conferir a foto e o texto!</span>
                </div>
              )}

              {testResult?.error && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/15 border border-destructive/30 p-3.5 text-xs text-destructive font-medium animate-slide-up">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{testResult.error}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                Voltar e Editar
              </button>
              {!isConnected ? (
                <Link
                  href="/connect"
                  className="flex items-center gap-2 rounded-xl bg-yellow-500 hover:bg-yellow-600 px-7 py-3 text-sm font-bold text-black transition-all shadow-lg shadow-yellow-500/25 hover:scale-[1.02]"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Conectar WhatsApp para Disparar
                </Link>
              ) : (
                <button
                  type="submit"
                  disabled={submitting || !spreadsheetData.hasPhoneColumn || effectiveToSend === 0}
                  className="flex items-center gap-2 rounded-xl bg-whatsapp px-7 py-3 text-sm font-bold text-white hover:bg-whatsapp-dark transition-all shadow-lg shadow-whatsapp/25 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {submitting
                    ? 'Iniciando Fila...'
                    : effectiveToSend === 0
                    ? 'Todos os contatos já foram abordados (marque Reenviar para disparar)'
                    : allowResend || !contactAnalysis?.alreadyContactedCount
                    ? `Disparar ${spreadsheetData.contacts.length} Mensagens ${uploadedMedia ? 'com Foto' : ''}`
                    : `Disparar ${effectiveToSend} Novas Mensagens (${contactAnalysis.alreadyContactedCount} preservados) ${uploadedMedia ? 'com Foto' : ''}`}
                </button>
              )}
            </div>
          </div>
        )}
      </form>

      {/* Modal de Variações com IA Grok */}
      <GrokVariationsModal
        isOpen={showGrokModal}
        onClose={() => setShowGrokModal(false)}
        baseMessage={variations[activeVariationIndex] || ''}
        onApplyVariations={(newVars) => {
          setVariations(newVars);
          setActiveVariationIndex(0);
          setValue('messageTemplate', newVars[0] || '', { shouldValidate: true });
          setShowGrokModal(false);
          toast({
            title: '✨ Variações Grok aplicadas com sucesso!',
            description: `${newVars.length} modelos de mensagem configurados para rodízio automático.`,
          });
        }}
        onApplySpintax={(spintax) => {
          handleCurrentTextChange(spintax);
          setShowGrokModal(false);
          toast({
            title: '🔀 Spintax aplicado com sucesso!',
            description: 'Variações dinâmicas de vocabulário inseridas no modelo atual.',
          });
        }}
      />

      {/* Modal do Guia Anti-Ban & Recuperação de Chip */}
      <AntiBanGuideModal
        isOpen={showAntiBanGuide}
        onClose={() => setShowAntiBanGuide(false)}
      />
    </div>
  );
}
