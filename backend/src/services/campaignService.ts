import crypto from 'crypto';

/**
 * Normaliza uma chave de texto para matching flexível.
 */
function cleanKey(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '')
    .trim();
}

/**
 * Verifica se o nome informado é inválido ou um placeholder (ex: 'Nome', 'Contato', vazio)
 */
export function isInvalidName(name?: string | null): boolean {
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

/**
 * Processa Spintax textual para gerar variações dinâmicas de mensagens.
 * Exemplo: "{Olá|Oi|Bom dia} {{Responsável}}, {tudo bem?|como vai?}"
 * IMPORTANTE: Exige pelo menos uma barra vertical '|' para não colidir com variáveis {{Nome}}.
 */
export function parseSpintax(text: string): string {
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

/**
 * Altera imperceptivelmente o buffer da imagem anexando bytes aleatórios seguros
 * para que cada destinatário receba um arquivo com Hash criptográfico (SHA-256 / MD5) ÚNICO.
 * Isso impede que os filtros heurísticos da Meta detectem envio massivo do mesmo arquivo.
 */
export function randomizeImageBuffer(buffer: Buffer): Buffer {
  // Gera de 16 a 48 bytes aleatórios adicionais ao fim do arquivo
  // Visualizadores JPEG/PNG/WebP ignoram dados após os marcadores EOF/IEND
  const randomBytes = crypto.randomBytes(Math.floor(Math.random() * 32) + 16);
  return Buffer.from(Buffer.concat([buffer, randomBytes]));
}

/**
 * Processa o template de mensagem substituindo variáveis, aplicando Spintax
 * e opcionalmente adicionando o rodapé de Opt-Out anti-denúncia.
 * SE O CONTATO NÃO TIVER NOME SALVO, NÃO MANDA NADA NO LUGAR DO NOME.
 */
export function processTemplate(
  template: string,
  contact: Record<string, string | undefined>,
  options?: { optOutFooter?: boolean }
): string {
  if (!template) return '';

  // 1. Aplica Spintax primeiro para criar a variação frasal única (somente blocos com |)
  let message = parseSpintax(template);

  // 2. Cria mapa de chaves normalizadas
  const normalizedMap = new Map<string, string>();
  for (const [key, val] of Object.entries(contact)) {
    if (val !== undefined && val !== null) {
      normalizedMap.set(cleanKey(key), String(val));
    }
  }

  // Aliases conhecidos para preenchimento inteligente
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

  // 3. Substitui as tags {{variavel}}
  message = message.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey: string) => {
    const trimmedKey = rawKey.trim();
    const cKey = cleanKey(trimmedKey);

    // Se a variável for referente a Nome / Responsável / Contato:
    // REGRA DE OURO DO USUÁRIO: "se não tiver nome salvo, não mandar nada"
    if (cKey === 'nome' || cKey === 'responsavel' || cKey === 'contato') {
      return contactName; // Se vazio, retorna string vazia '' (não coloca empresa nem 'Nome')
    }

    // Se for referente a Empresa / Razão Social
    if (cKey === 'empresa' || cKey === 'nomedaempresa' || cKey === 'razaosocial') {
      return contactCompany;
    }

    // Se for referente a Telefone
    if (cKey === 'telefone' || cKey === 'whatsapp' || cKey === 'celular' || cKey === 'fone') {
      return contactPhone;
    }

    // Match exato com o objeto de contato
    if (contact[trimmedKey] !== undefined && contact[trimmedKey] !== null) {
      const val = String(contact[trimmedKey]).trim();
      return isInvalidName(val) ? '' : val;
    }

    // Busca normalizada no mapa
    if (normalizedMap.has(cKey)) {
      const val = normalizedMap.get(cKey)!.trim();
      return isInvalidName(val) ? '' : val;
    }

    // Se a variável não existir ou for vazia, não manda nada
    return '';
  });

  // Limpa pontuações e espaços residuais gerados por variáveis vazias (ex: "Olá , tudo bem?" -> "Olá, tudo bem?")
  message = message
    .replace(/\s+,/g, ',')
    .replace(/\s+!/g, '!')
    .replace(/\s+\?/g, '?')
    .replace(/\s+\./g, '.')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  // 4. Adiciona rodapé de Opt-Out anti-denúncia se habilitado
  if (options?.optOutFooter) {
    message += '\n\n_Para não receber mais mensagens, responda SAIR._';
  }

  return message.trim();
}

/**
 * Calcula tempo estimado considerando pausas entre lotes (Batch cooling)
 */
export function estimateTimeRemaining(
  remaining: number,
  delayMin: number,
  delayMax: number,
  batchSize = 20,
  batchPauseMin = 3
): string {
  if (remaining <= 0) return '0s';
  const avgDelay = (delayMin + delayMax) / 2;
  const numBatches = Math.floor(remaining / batchSize);
  const pauseSeconds = numBatches * (batchPauseMin * 60);
  const totalSeconds = Math.round(remaining * avgDelay + pauseSeconds);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (minutes === 0) return `~${seconds}s`;
  if (minutes < 60) return `~${minutes}min ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `~${hours}h ${mins}min`;
}
