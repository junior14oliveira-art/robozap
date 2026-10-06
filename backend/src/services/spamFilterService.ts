/**
 * Serviço de Detecção e Bloqueio de Mensagens com Risco de Spam (Anti-Ban Shield)
 * 
 * Regras baseadas nas diretrizes de spam e detecção de anomalias da Meta (WhatsApp):
 * 1. Gatilhos de Venda Fria Agressiva (Palavras e termos com altíssimo índice de clique em 'Denunciar').
 * 2. Caixa Alta Excessiva (ALL CAPS / Gritaria comercial).
 * 3. Emojis de Alarme e Urgência Falsa (Sirenes, bombas, megafones, pilhas de dinheiro).
 * 4. Links e Encurtadores no primeiro contato frio.
 * 5. Pontuação Excessiva (!!!, ???, ?!).
 * 6. Falta de Personalização em campanhas massivas.
 */

export interface SpamViolation {
  id: string;
  rule: string;
  description: string;
  snippet?: string;
  severity: 'critical' | 'warning';
}

export interface SpamFilterResult {
  isBlocked: boolean;
  score: number; // 0 (100% seguro) a 100 (banimento quase garantido)
  level: 'safe' | 'warning' | 'blocked';
  violations: SpamViolation[];
  suggestions: string[];
  cleanPreview?: string;
}

// 1. Termos com severidade crítica: se encontrados, o risco sobe dramaticamente
const CRITICAL_SPAM_PHRASES = [
  'promocao imperdivel',
  'super promocao',
  'promocao b2b',
  'oferta imperdivel',
  'super oferta',
  'compre ja',
  'compre agora',
  'compre com desconto',
  '50% off',
  '70% off',
  'liquidacao',
  'queima de estoque',
  'ganhe dinheiro',
  'renda extra',
  'dinheiro facil',
  'trabalhe de casa',
  'fique rico',
  'lucro garantido',
  'investimento garantido',
  'nao perca essa oportunidade',
  'oportunidade unica',
  'ultimas unidades',
  'so hoje',
  'apenas hoje',
  'clique no link',
  'clique aqui',
  'acesse o link',
  'arrasta pra cima',
];

// 2. Termos suspeitos / de alerta (peso moderado)
const WARNING_SPAM_WORDS = [
  'promocao',
  'promocional',
  'desconto exclusivo',
  'desconto especial',
  'preco imbativel',
  'menor preco',
  'gratis',
  'de graca',
  'urgente',
  'urgencia',
  'nao perca',
  'aproveite ja',
  'oportunidade',
];

// 3. Emojis de alarme e urgência falsa
const ALARM_EMOJI_REGEX = /(🚨|💣|🔥{2,}|💰{2,}|📢{2,}|⚠️{2,}|❗{2,}|‼️)/g;

// 4. Encurtadores de URL suspeitos em mensagens frias
const SHORTENER_REGEX = /\b(bit\.ly|tinyurl\.com|t\.me|linktr\.ee|cutt\.ly|is\.gd|is\.gd|rb\.gy|encurtador\.com\.br)\b/i;

function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9% ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove variáveis de personalização (como {{nome}}, {{empresa}}) antes de analisar letras maiúsculas
 */
function stripVariables(text: string): string {
  return text.replace(/\{\{\s*[^}]+?\s*\}\}/g, '');
}

/**
 * Avalia uma mensagem e determina se ela deve ser BLOQUEADA para proteger o chip contra bans.
 */
export function validateMessageAntiSpam(rawMessage: string): SpamFilterResult {
  if (!rawMessage || typeof rawMessage !== 'string' || rawMessage.trim().length === 0) {
    return {
      isBlocked: false,
      score: 0,
      level: 'safe',
      violations: [],
      suggestions: [],
    };
  }

  const text = rawMessage.trim();
  const textWithoutVars = stripVariables(text);
  const normalized = normalizeForSearch(text);
  const violations: SpamViolation[] = [];
  const suggestions: string[] = [];
  let score = 0;

  // 1. Verificação de Frases Críticas de Spam
  for (const phrase of CRITICAL_SPAM_PHRASES) {
    if (normalized.includes(phrase)) {
      score += 35;
      violations.push({
        id: `critical_${phrase.replace(/\s+/g, '_')}`,
        rule: 'Gatilho Comercial Agressivo',
        description: `O termo "${phrase.toUpperCase()}" tem alto índice de denúncia por spam no WhatsApp.`,
        snippet: phrase,
        severity: 'critical',
      });
      suggestions.push(`Substitua "${phrase}" por uma abordagem consultiva e suave.`);
    }
  }

  // 2. Verificação de Palavras de Alerta
  for (const word of WARNING_SPAM_WORDS) {
    // Busca como palavra isolada
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(normalized)) {
      // Evita duplicar se já foi pego na crítica
      const alreadyReported = violations.some((v) => v.snippet && v.snippet.includes(word));
      if (!alreadyReported) {
        score += 15;
        violations.push({
          id: `warn_${word.replace(/\s+/g, '_')}`,
          rule: 'Palavra Promocional Típica de Spam',
          description: `O uso de termos como "${word}" aumenta o risco de bloqueio.`,
          snippet: word,
          severity: 'warning',
        });
      }
    }
  }

  // 3. Verificação de Letras Maiúsculas Excessivas (ALL CAPS)
  const lettersOnly = textWithoutVars.replace(/[^a-zA-ZáéíóúÁÉÍÓÚãõÃÕâêîôûÂÊÎÔÛçÇ]/g, '');
  if (lettersOnly.length >= 15) {
    const uppercaseLetters = lettersOnly.replace(/[^A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ]/g, '');
    const uppercaseRatio = uppercaseLetters.length / lettersOnly.length;

    if (uppercaseRatio > 0.35) {
      score += 40;
      violations.push({
        id: 'excessive_caps_lock',
        rule: 'Caixa Alta Excessiva (Gritaria)',
        description: `${Math.round(uppercaseRatio * 100)}% das letras estão em MAIÚSCULAS. A Meta classifica textos gritantes como spam imediato.`,
        severity: 'critical',
      });
      suggestions.push('Escreva em letras minúsculas normais como uma conversa pessoal entre humanos.');
    } else if (uppercaseRatio > 0.2) {
      score += 20;
      violations.push({
        id: 'moderate_caps_lock',
        rule: 'Muitas Palavras em Maiúsculas',
        description: 'Uso elevado de letras maiúsculas. Deixe apenas as iniciais de nomes e frases.',
        severity: 'warning',
      });
      suggestions.push('Reduza palavras em maiúsculas.');
    }
  }

  // Palavras longas inteiramente em maiúsculas (ex: PROMOÇÃO, IMPERDÍVEL, OFERTA)
  const words = textWithoutVars.split(/\s+/);
  const shoutingWords = words.filter((w) => w.length >= 5 && /^[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ]+$/.test(w));
  if (shoutingWords.length >= 2) {
    score += 25;
    violations.push({
      id: 'shouting_words',
      rule: 'Palavras Gritando em Maiúsculas',
      description: `Palavras em caixa alta detectadas: ${shoutingWords.slice(0, 3).join(', ')}.`,
      snippet: shoutingWords.slice(0, 3).join(', '),
      severity: 'critical',
    });
    suggestions.push(`Passe as palavras "${shoutingWords.slice(0, 3).join(', ')}" para minúsculas.`);
  }

  // 4. Verificação de Emojis de Alarme
  const alarmMatches = text.match(ALARM_EMOJI_REGEX);
  if (alarmMatches && alarmMatches.length > 0) {
    const totalAlarm = alarmMatches.length;
    score += totalAlarm >= 2 ? 35 : 20;
    violations.push({
      id: 'alarm_emojis',
      rule: 'Emojis de Alarme / Urgência Forçada',
      description: `Emojis de alerta detectados (${alarmMatches.slice(0, 3).join(' ')}). São amplamente associados a disparos em massa automatizados.`,
      snippet: alarmMatches.slice(0, 4).join(' '),
      severity: totalAlarm >= 2 ? 'critical' : 'warning',
    });
    suggestions.push('Remova emojis de sirene (🚨) e alarme. Use emojis naturais como 👋 ou nenhum.');
  }

  // 5. Verificação de Encurtadores de Links
  if (SHORTENER_REGEX.test(text)) {
    score += 35;
    violations.push({
      id: 'link_shortener',
      rule: 'Link Encurtador Proibido no 1º Contato',
      description: 'Links encurtados (bit.ly, t.me, etc.) são o principal motivo de banimento em primeiro contato.',
      severity: 'critical',
    });
    suggestions.push('Não envie links na primeira mensagem. Espere o cliente responder para enviar links.');
  }

  // 6. Verificação de Pontuações Excessivas de Urgência
  if (/!{2,}|\?{3,}|\?!|!\?/.test(text)) {
    score += 15;
    violations.push({
      id: 'excessive_punctuation',
      rule: 'Pontuação Excessiva (!!! / ???)',
      description: 'Múltiplos pontos de exclamação transmitem desespero comercial e ativam filtros da Meta.',
      severity: 'warning',
    });
    suggestions.push('Use pontuação normal (apenas um ponto ou interrogação).');
  }

  // 7. Verificação de Personalização
  const hasNameVariable = /\{\{\s*(nome|responsavel|responsável|contato|cliente)\s*\}\}/i.test(rawMessage);
  const hasGreeting = /\b(ol[aá]|oi|bom dia|boa tarde|boa noite|tudo bem|como vai)\b/i.test(normalized);

  if (!hasGreeting && text.length > 50) {
    score += 15;
    violations.push({
      id: 'no_greeting',
      rule: 'Sem Saudação Inicial',
      description: 'A mensagem começa diretamente vendendo sem dar "Olá" ou "Oi".',
      severity: 'warning',
    });
    suggestions.push('Comece a mensagem com uma saudação como "Olá {{nome}}, tudo bem?".');
  }

  if (!hasNameVariable && text.length > 60) {
    score += 15;
    violations.push({
      id: 'no_personalization',
      rule: 'Sem Personalização com o Nome do Contato',
      description: 'Mensagens genéricas sem o nome do destinatário são 4x mais denunciadas como spam.',
      severity: 'warning',
    });
    suggestions.push('Insira a variável {{nome}} ou {{responsável}} no início da mensagem.');
  }

  // Calcula nível final
  const cappedScore = Math.min(Math.max(score, 0), 100);
  const hasCritical = violations.some((v) => v.severity === 'critical');
  const isBlocked = cappedScore >= 50 || (hasCritical && cappedScore >= 40);

  const level: 'safe' | 'warning' | 'blocked' = isBlocked
    ? 'blocked'
    : cappedScore > 20
    ? 'warning'
    : 'safe';

  // Gera uma versão limpa sugerida (heurística rápida)
  let cleanPreview = text;
  // Substitui sirenes
  cleanPreview = cleanPreview.replace(/🚨|💣|📢/g, '');
  // Substitui pontuação
  cleanPreview = cleanPreview.replace(/!{2,}/g, '.').replace(/\?{2,}/g, '?');
  // Se contiver PROMOÇÃO IMPERDÍVEL, substitui por abordagem consultiva
  cleanPreview = cleanPreview.replace(/PROMOÇÃO IMPERDÍVEL B2B/gi, 'Oportunidades para sua empresa');
  cleanPreview = cleanPreview.replace(/PROMOÇÃO IMPERDÍVEL/gi, 'Novidades especiais');
  cleanPreview = cleanPreview.replace(/COMPRE AGORA/gi, 'Caso tenha interesse, podemos conversar');
  cleanPreview = cleanPreview.replace(/COMPRE JÁ/gi, 'Estamos à disposição');
  cleanPreview = cleanPreview.replace(/[ \t]{2,}/g, ' ').trim();

  return {
    isBlocked,
    score: cappedScore,
    level,
    violations,
    suggestions: Array.from(new Set(suggestions)),
    cleanPreview: isBlocked ? cleanPreview : undefined,
  };
}
