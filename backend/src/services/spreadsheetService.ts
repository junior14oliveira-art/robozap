import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

export interface ParsedContact {
  phone: string;
  formattedPhone: string;
  name?: string;
  company?: string;
  [key: string]: string | undefined;
}

export interface SpreadsheetParseResult {
  contacts: ParsedContact[];
  columns: string[];
  totalRows: number;
  validContactsCount: number;
  emptyPhoneCount: number;
  detectedPhoneColumn: string | null;
  detectedNameColumn: string | null;
  preview: ParsedContact[];
  warnings: string[];
  hasPhoneColumn: boolean;
}

/**
 * Normaliza um texto para comparação simples (remove acentos, espaços extras, lowercase).
 */
function normalizeKey(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Detecta a coluna de telefone usando pontuação de relevância.
 */
export function detectPhoneColumn(columns: string[]): string | null {
  for (const col of columns) {
    const norm = normalizeKey(col);
    // Prioridade máxima: termos explícitos
    if (/(whats|whatsapp|celular|telefone|fone|phone|contato.*whats|tel.*whats)/i.test(norm)) {
      return col;
    }
  }
  // Segunda prioridade: 'tel', 'numero'
  for (const col of columns) {
    const norm = normalizeKey(col);
    if (/(^tel$|^numero$|numero.*tel|contato.*tel)/i.test(norm)) {
      return col;
    }
  }
  return null;
}

/**
 * Detecta a coluna de nome/responsável/empresa usando pontuação.
 */
export function detectNameColumn(columns: string[]): string | null {
  // Prioridade 1: Responsável, Contato Direto, Nome
  for (const col of columns) {
    const norm = normalizeKey(col);
    if (/(responsavel|nome|pessoa|destinatario|titular)/i.test(norm)) {
      return col;
    }
  }
  // Prioridade 2: Empresa, Razão Social, Cliente
  for (const col of columns) {
    const norm = normalizeKey(col);
    if (/(empresa|cliente|razao|loja)/i.test(norm)) {
      return col;
    }
  }
  return null;
}

/**
 * Normaliza número de telefone brasileiro e internacional para formato puro com DDI (ex: 5511988130598).
 */
export function normalizePhone(raw: any): string | null {
  if (raw === null || raw === undefined) return null;
  let str = String(raw).trim();
  if (!str) return null;

  // Se houver múltiplos telefones separados por barra, vírgula ou ponto e vírgula, extrai o primeiro
  if (/[/,;]/.test(str)) {
    str = str.split(/[/,;]/)[0].trim();
  }

  // Remove tudo que não for dígito
  let digits = str.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;

  // Remove 0 inicial se houver (ex: 011988130598 -> 11988130598)
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  // Se tem 10 dígitos (DDD + 8 dígitos de fixo/antigo) ou 11 dígitos (DDD + 9 dígitos de celular)
  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits;
  }

  // Se já tem 12 ou 13 dígitos e começa com 55 (Brasil)
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return digits;
  }

  // Se tem mais de 10 dígitos com DDI internacional já incluído
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }

  return null;
}

/**
 * Formata número para exibição amigável no UI (ex: +55 (11) 98813-0598)
 */
export function formatPhoneDisplay(digits: string): string {
  if (digits.startsWith('55') && digits.length === 13) {
    // 55 11 98813-0598
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.startsWith('55') && digits.length === 12) {
    // 55 11 3333-1697
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return `+${digits}`;
}

export interface ParseOptions {
  phoneColumn?: string;
  nameColumn?: string;
}

/**
 * Faz parse da planilha (XLSX, XLS ou CSV) extraindo os contatos e variáveis de personalização.
 */
export async function parseSpreadsheet(
  filePath: string,
  options?: ParseOptions
): Promise<SpreadsheetParseResult> {
  const ext = path.extname(filePath).toLowerCase();
  const warnings: string[] = [];

  let workbook: XLSX.WorkBook;

  if (ext === '.csv') {
    const csvContent = fs.readFileSync(filePath, 'utf-8');
    workbook = XLSX.read(csvContent, { type: 'string' });
  } else {
    workbook = XLSX.readFile(filePath);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('A planilha está vazia ou não possui abas.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
    raw: false,
    defval: '',
  });

  if (rawData.length === 0) {
    throw new Error('A planilha não contém dados. Verifique se há pelo menos uma linha com dados.');
  }

  const columns = Object.keys(rawData[0]);

  // Identifica coluna de telefone (ou usa a informada pelo usuário)
  const phoneCol = (options?.phoneColumn && columns.includes(options.phoneColumn))
    ? options.phoneColumn
    : detectPhoneColumn(columns);

  // Identifica coluna de nome (ou usa a informada pelo usuário)
  const nameCol = (options?.nameColumn && columns.includes(options.nameColumn))
    ? options.nameColumn
    : detectNameColumn(columns);

  // Também identifica coluna de empresa se houver separada
  const companyCol = columns.find(c => /(empresa|razao|loja)/i.test(normalizeKey(c)));

  const hasPhoneColumn = phoneCol !== null;

  if (!hasPhoneColumn) {
    warnings.push(
      `Coluna de telefone não identificada automaticamente. Colunas encontradas: ${columns.join(', ')}. ` +
      `Por favor, selecione qual coluna contém o telefone.`
    );
  }

  let emptyPhoneCount = 0;
  const contacts: ParsedContact[] = [];

  rawData.forEach((row) => {
    const rawPhone = phoneCol ? row[phoneCol] : undefined;
    const normalized = normalizePhone(rawPhone);

    if (!normalized) {
      emptyPhoneCount++;
      return;
    }

    const rawName = nameCol ? String(row[nameCol] || '').trim() : undefined;
    const rawCompany = companyCol ? String(row[companyCol] || '').trim() : undefined;

    const contact: ParsedContact = {
      phone: normalized,
      formattedPhone: formatPhoneDisplay(normalized),
      name: rawName || '',
      company: rawCompany || '',
    };

    // Adiciona todas as colunas da planilha como variáveis do contato
    for (const col of columns) {
      const val = row[col] !== undefined ? String(row[col]).trim() : '';
      contact[col] = val;
      // Adiciona também versão normalizada (sem acentos, lowercase) para facilitar no template
      const normCol = normalizeKey(col).replace(/\s+/g, '_');
      if (normCol && !contact[normCol]) {
        contact[normCol] = val;
      }
    }

    contacts.push(contact);
  });

  if (emptyPhoneCount > 0) {
    warnings.push(
      `${emptyPhoneCount} linha(s) sem telefone válido foram desconsideradas automaticamente.`
    );
  }

  return {
    contacts,
    columns,
    totalRows: rawData.length,
    validContactsCount: contacts.length,
    emptyPhoneCount,
    detectedPhoneColumn: phoneCol,
    detectedNameColumn: nameCol,
    preview: contacts.slice(0, 5),
    warnings,
    hasPhoneColumn,
  };
}
