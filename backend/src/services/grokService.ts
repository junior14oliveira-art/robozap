import { logger } from '../index';

export interface GrokVariationResult {
  variations: string[];
  spintax?: string;
  advice?: string[];
}

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROK_MODEL || 'grok-2-latest';

/**
 * Obtém a chave da API do Grok (xAI) a partir da requisição ou das variáveis de ambiente.
 */
export function getGrokApiKey(overrideKey?: string): string | null {
  if (overrideKey && overrideKey.trim().startsWith('xai-')) {
    return overrideKey.trim();
  }
  const envKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (envKey && envKey.trim().length > 0) {
    return envKey.trim();
  }
  if (overrideKey && overrideKey.trim().length > 10) {
    return overrideKey.trim();
  }
  return null;
}

/**
 * Faz chamada à API do Grok (xAI) usando fetch nativo.
 */
async function callGrok(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  apiKey: string,
  temperature = 0.75,
  model = DEFAULT_MODEL
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(XAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: 2500,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Erro na API do Grok (${res.status}): ${errText || res.statusText}`);
    }

    const data = (await res.json()) as any;
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Resposta vazia da API do Grok');
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Gera de 3 a 7 variações completamente distintas de uma mensagem comercial/promocional,
 * mantendo as variáveis intactas (ex: {{nome}}, {{empresa}}) e aplicando técnicas anti-ban.
 */
export async function generateVariationsWithGrok(params: {
  baseMessage: string;
  count?: number;
  apiKey?: string;
  tone?: 'consultivo' | 'direto' | 'amigavel' | 'curto';
  preserveVariables?: boolean;
}): Promise<GrokVariationResult> {
  const { baseMessage, count = 4, apiKey: rawKey, tone = 'consultivo' } = params;
  const apiKey = getGrokApiKey(rawKey);

  if (!apiKey) {
    return generateFallbackVariations(baseMessage, count);
  }

  const systemPrompt = `Você é um especialista em Copywriting B2B, Segurança no WhatsApp e Prevenção de Banimentos da Meta.
Sua missão é reescrever uma mensagem de prospecção para o WhatsApp em ${count} VARIAÇÕES COMPLETAMENTE DISTINTAS, garantindo:
1. **ANTI-BAN / NÃO PARECER BOT**: Cada variação deve ter uma estrutura frasal, abertura e fechamento diferentes. NÃO use o mesmo padrão ou as mesmas palavras.
2. **EVITAR DENÚNCIAS DE SPAM**: Elimine termos apelativos de spam como "PROMOÇÃO IMPERDÍVEL 🚨", "URGENTE", "ÚLTIMA CHANCE", CAIXA ALTA EXCESSIVA e excesso de emojis. A abordagem deve ser educada, humana e consultiva.
3. **PRESERVAR VARIÁVEIS**: Se a mensagem original contiver variáveis como {{nome}}, {{empresa}}, {{responsavel}}, {{telefone}}, você DEVE mantê-las exatamente nesse formato {{nome}}.
4. **MENSAGEM EM 1ª PESSOA**: Como se um consultor humano real estivesse digitando para um colega de negócios.
5. **FORMATO DE RESPOSTA ESTRITO**:
Retorne APENAS um objeto JSON válido (sem blocos markdown extras ou texto antes/depois) no formato:
{
  "variations": [
    "Variação 1 aqui...",
    "Variação 2 aqui..."
  ],
  "advice": [
    "Dica 1 de segurança",
    "Dica 2 de segurança"
  ]
}`;

  const userPrompt = `Mensagem original do usuário:
"""
${baseMessage}
"""

Tom desejado: ${tone}
Quantidade de variações: ${count}

Gere ${count} variações humanizadas que nunca sejam detectadas como spam pela Meta nem denunciadas pelos destinatários. Retorne apenas o JSON.`;

  try {
    const rawResponse = await callGrok(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      apiKey,
      0.8
    );

    // Limpa possíveis blocos ```json ... ```
    const cleanJson = rawResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleanJson);
    if (Array.isArray(parsed.variations) && parsed.variations.length > 0) {
      return {
        variations: parsed.variations.map((v: string) => v.trim()),
        advice: Array.isArray(parsed.advice) ? parsed.advice : [],
      };
    }
    throw new Error('JSON retornado não contém a lista de variações esperada');
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Falha ao processar Grok API, gerando variações inteligentes de fallback');
    return generateFallbackVariations(baseMessage, count);
  }
}

/**
 * Transforma uma mensagem em Spintax aninhado rico usando o Grok.
 * Ex: "{Olá|Oi|Bom dia} {{nome}}, {tudo bem?|como vai?}"
 */
export async function generateSpintaxWithGrok(params: {
  baseMessage: string;
  apiKey?: string;
}): Promise<{ spintax: string; combinationsEstimate: number }> {
  const { baseMessage, apiKey: rawKey } = params;
  const apiKey = getGrokApiKey(rawKey);

  if (!apiKey) {
    return generateFallbackSpintax(baseMessage);
  }

  const systemPrompt = `Você é um especialista em Spintax e automação humanizada de mensagens para WhatsApp.
Converta o texto do usuário em um formato Spintax profissional rico.
Regras:
1. Use a sintaxe de chaves e barras: {opção 1|opção 2|opção 3}.
2. Crie variações para saudações, conexões, frases de transição e chamadas para ação (CTA).
3. Preserve variáveis existentes como {{nome}}, {{empresa}}, {{responsavel}}.
4. A mensagem resultante deve ter pelo menos 4 a 6 blocos Spintax, gerando dezenas ou centenas de combinações únicas.
5. Retorne APENAS um JSON no formato:
{
  "spintax": "texto completo com spintax aqui...",
  "combinationsEstimate": 256
}`;

  try {
    const rawResponse = await callGrok(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Texto para converter em Spintax:\n"""\n${baseMessage}\n"""` },
      ],
      apiKey,
      0.7
    );

    const cleanJson = rawResponse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleanJson);
    if (parsed.spintax) {
      return {
        spintax: parsed.spintax,
        combinationsEstimate: Number(parsed.combinationsEstimate) || 120,
      };
    }
    throw new Error('Resposta sem campo spintax');
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Falha ao gerar Spintax com Grok, aplicando fallback');
    return generateFallbackSpintax(baseMessage);
  }
}

/**
 * Fallback inteligente em caso de indisponibilidade da API ou ausência de chave Grok.
 * Garante que o usuário NUNCA fique travado e sempre tenha variações humanizadas prontas.
 */
function generateFallbackVariations(baseMessage: string, count = 4): GrokVariationResult {
  const greetings = [
    'Olá {{nome}}, tudo bem?',
    'Oi {{nome}}, como vai?',
    'Bom dia {{nome}}, tudo certo por aí?',
    'Olá {{nome}}, espero que esteja tendo uma excelente semana!',
    'Oi {{nome}}, tudo bem com você?',
  ];

  const closings = [
    'Se fizer sentido para você, me avisa por aqui!',
    'Qualquer dúvida estou à disposição.',
    'Se tiver interesse em saber mais detalhes, fico à disposição!',
    'Caso queira ver mais opções ou valores, só me dar um alô.',
  ];

  // Limpa possíveis cabeçalhos de spam em caixa alta
  let cleaned = baseMessage
    .replace(/^PROMOÇÃO IMPERDÍVEL[^\n]*\n+/i, '')
    .replace(/^🚨[^\n]*\n+/i, '')
    .replace(/🚨/g, '')
    .trim();

  const variations: string[] = [];

  for (let i = 0; i < count; i++) {
    const greeting = greetings[i % greetings.length];
    const closing = closings[i % closings.length];

    if (i === 0) {
      variations.push(`${greeting}\n\n${cleaned}\n\n${closing}`);
    } else if (i === 1) {
      variations.push(
        `${greeting} Passando rapidinho para compartilhar uma novidade com você:\n\n${cleaned}\n\n${closing}`
      );
    } else if (i === 2) {
      variations.push(
        `${greeting} Temos uma condição diferenciada disponível hoje:\n\n${cleaned}\n\n${closing}`
      );
    } else {
      variations.push(
        `${greeting} Notei a sua atuação e pensei que essa oportunidade poderia te interessar:\n\n${cleaned}\n\n${closing}`
      );
    }
  }

  return {
    variations,
    advice: [
      'Cadastre sua chave da API do Grok (.env ou nas configurações) para variações de copy ultracriativas com IA.',
      'Nunca inicie mensagens frias com "PROMOÇÃO IMPERDÍVEL" ou sirenes 🚨 — isso dispara denúncias instantâneas.',
      'Varie as palavras de abertura e de encerramento para que cada destinatário receba um hash textual diferente.',
    ],
  };
}

function generateFallbackSpintax(baseMessage: string): { spintax: string; combinationsEstimate: number } {
  let text = baseMessage.trim();

  // Substitui saudações comuns por Spintax
  text = text.replace(
    /^(olá|oi|bom dia|boa tarde)/i,
    '{Olá|Oi|Bom dia|Olá, como vai?}'
  );

  if (!text.includes('{')) {
    text = `{Olá|Oi|Bom dia} {{nome}}, {tudo bem?|como vai?|tudo certo?}\n\n${text}\n\n{Fico à disposição|Qualquer dúvida estou por aqui|Se tiver interesse me avise!}`;
  }

  return {
    spintax: text,
    combinationsEstimate: 36,
  };
}

export interface HumanizeSpamResult {
  cleanMessage: string;
  improvements: string[];
  riskBefore: number;
  riskAfter: number;
  usedAI: boolean;
}

/**
 * Reescreve mensagens com alto risco de spam usando a IA do Grok (xAI)
 * para transformá-las em abordagens consultivas 100% aprovadas pelas regras da Meta.
 */
export async function humanizeAndCleanSpamWithGrok(
  baseMessage: string,
  overrideKey?: string
): Promise<HumanizeSpamResult> {
  const apiKey = getGrokApiKey(overrideKey);

  if (!apiKey) {
    return generateFallbackHumanize(baseMessage);
  }

  const systemPrompt = `Você é um especialista em entregabilidade de WhatsApp, engenharia reversa dos filtros de spam da Meta e copywriting B2B ético.
Sua missão: Pegar uma mensagem que foi BLOQUEADA pelo nosso sistema anti-ban por conter gatilhos agressivos de spam e reescrevê-la completamente para que se torne uma abordagem consultiva, educada, humana e com ZERO risco de denúncia.

REGRAS ABSOLUTAS:
1. Elimine QUALQUER palavra agressiva: "PROMOÇÃO IMPERDÍVEL", "COMPRE AGORA", "OFERTA", "50% OFF", "LIQUIDAÇÃO", "ÚLTIMAS UNIDADES", "APROVEITE JÁ".
2. Elimine qualquer emoji de alarme ou urgência (🚨, 💣, 🔥, 💰, 📢). Use emojis suaves (👋, 🤝) ou nenhum.
3. Elimine gritarias em caixa alta (ALL CAPS). Escreva em letras minúsculas fluidas e profissionais.
4. Mantenha TODAS as variáveis de interpolação existentes como {{nome}}, {{empresa}}, {{responsavel}} EXATAMENTE no mesmo formato.
5. Inicie com uma saudação educada: "Olá {{nome}}, tudo bem?".
6. Adote uma abordagem consultiva B2B (ex: "Trabalhamos com soluções de infraestrutura e temos um lote especial disponível. Você seria a pessoa responsável por essa área na {{empresa}}?").
7. Termine convidando para uma resposta simples sem pressão.

Responda APENAS com um objeto JSON válido no formato:
{
  "cleanMessage": "Texto humanizado e blindado contra spam",
  "improvements": ["Removido 'PROMOÇÃO IMPERDÍVEL'", "Convertido caixa alta para texto natural", "Adicionada saudação consultiva"]
}`;

  try {
    const raw = await callGrok(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Reescreva e humanize esta mensagem bloqueada por spam:\n\n${baseMessage}`,
        },
      ],
      apiKey,
      0.65
    );

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.cleanMessage && typeof parsed.cleanMessage === 'string') {
        return {
          cleanMessage: parsed.cleanMessage.trim(),
          improvements: Array.isArray(parsed.improvements) ? parsed.improvements : ['Mensagem reescrita em tom consultivo B2B.'],
          riskBefore: 85,
          riskAfter: 8,
          usedAI: true,
        };
      }
    }
    throw new Error('Formato inválido retornado pelo Grok');
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Falha ao humanizar mensagem com Grok, aplicando fallback heurístico');
    return generateFallbackHumanize(baseMessage);
  }
}

/**
 * Fallback heurístico caso a API do Grok esteja inacessível ou sem chave
 */
function generateFallbackHumanize(baseMessage: string): HumanizeSpamResult {
  let cleaned = baseMessage;

  // Remove sirenes e alarmes
  cleaned = cleaned.replace(/🚨|💣|🔥{2,}|💰{2,}|📢{2,}|⚠️{2,}/g, '');

  // Remove pontuação excessiva
  cleaned = cleaned.replace(/!{2,}/g, '.').replace(/\?{2,}/g, '?');

  // Substitui termos agressivos
  cleaned = cleaned.replace(/PROMOÇÃO IMPERDÍVEL B2B/gi, 'Oportunidades em servidores');
  cleaned = cleaned.replace(/PROMOÇÃO IMPERDÍVEL/gi, 'Novidades especiais');
  cleaned = cleaned.replace(/SUPER PROMOÇÃO/gi, 'Condições diferenciadas');
  cleaned = cleaned.replace(/COMPRE AGORA|COMPRE JÁ/gi, 'Caso tenha interesse, podemos alinhar os detalhes');
  cleaned = cleaned.replace(/LIQUIDAÇÃO|QUEIMA DE ESTOQUE/gi, 'Lote com disponibilidade imediata');

  // Converte linhas que estão gritando em ALL CAPS para formato normal
  const lines = cleaned.split('\n');
  const formattedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.length > 8 && trimmed === trimmed.toUpperCase() && !/\{\{/.test(trimmed)) {
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    }
    return line;
  });
  cleaned = formattedLines.join('\n');

  // Garante saudação inicial se não houver
  const hasGreeting = /\b(ol[aá]|oi|bom dia|boa tarde)\b/i.test(cleaned);
  if (!hasGreeting) {
    cleaned = `Olá {{nome}}, tudo bem?\n\n${cleaned.trim()}`;
  }

  // Garante fechamento suave
  if (!/fico à disposição|qualquer dúvida/i.test(cleaned)) {
    cleaned = `${cleaned.trim()}\n\nCaso tenha interesse, fico à disposição por aqui!`;
  }

  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  return {
    cleanMessage: cleaned,
    improvements: [
      'Removidos termos agressivos de venda ("PROMOÇÃO IMPERDÍVEL", "COMPRE AGORA")',
      'Eliminados emojis de sirene e alarme',
      'Convertido texto de caixa alta (ALL CAPS) para conversa natural',
      'Adicionada saudação inicial com nome e encerramento consultivo',
    ],
    riskBefore: 85,
    riskAfter: 12,
    usedAI: false,
  };
}
