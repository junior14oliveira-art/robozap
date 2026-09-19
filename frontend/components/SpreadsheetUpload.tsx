'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  Phone,
  User,
  Building2,
  Sparkles,
  Columns,
  UserPlus,
  Trash2,
  Plus,
  ClipboardPaste,
  Users,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';

export interface ParsedContact {
  phone: string;
  formattedPhone?: string;
  name?: string;
  company?: string;
  [key: string]: string | undefined;
}

export interface SpreadsheetData {
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
  filename: string;
}

interface SpreadsheetUploadProps {
  onParsed: (data: SpreadsheetData) => void;
  onClear?: () => void;
}

function normalizeKey(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function detectPhoneColumn(columns: string[]): string | null {
  for (const col of columns) {
    const norm = normalizeKey(col);
    if (/(whats|whatsapp|celular|telefone|fone|phone|contato.*whats|tel.*whats)/i.test(norm)) {
      return col;
    }
  }
  for (const col of columns) {
    const norm = normalizeKey(col);
    if (/(^tel$|^numero$|numero.*tel|contato.*tel)/i.test(norm)) {
      return col;
    }
  }
  return null;
}

function detectNameColumn(columns: string[]): string | null {
  for (const col of columns) {
    const norm = normalizeKey(col);
    if (/(responsavel|nome|pessoa|destinatario|titular)/i.test(norm)) {
      return col;
    }
  }
  for (const col of columns) {
    const norm = normalizeKey(col);
    if (/(empresa|cliente|razao|loja)/i.test(norm)) {
      return col;
    }
  }
  return null;
}

export function normalizePhone(raw: any): string | null {
  if (raw === null || raw === undefined) return null;
  let str = String(raw).trim();
  if (!str) return null;

  if (/[/,;]/.test(str)) {
    str = str.split(/[/,;]/)[0].trim();
  }

  let digits = str.replace(/\D/g, '');
  if (!digits || digits.length < 8) return null;

  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  if (digits.length === 10 || digits.length === 11) {
    digits = '55' + digits;
  }

  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return digits;
  }

  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }

  return null;
}

export function formatPhoneDisplay(digits: string): string {
  if (digits.startsWith('55') && digits.length === 13) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.startsWith('55') && digits.length === 12) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return `+${digits}`;
}

function processWorkbook(
  workbook: XLSX.WorkBook,
  filename: string,
  chosenPhoneCol?: string,
  chosenNameCol?: string
): SpreadsheetData {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
    raw: false,
    defval: '',
  });

  if (rawData.length === 0) throw new Error('A planilha está vazia.');

  const columns = Object.keys(rawData[0]);
  const phoneCol = chosenPhoneCol || detectPhoneColumn(columns);
  const nameCol = chosenNameCol || detectNameColumn(columns);
  const companyCol = columns.find((c) => /(empresa|razao|loja)/i.test(normalizeKey(c)));

  const warnings: string[] = [];
  if (!phoneCol) {
    warnings.push(
      'Coluna de telefone não identificada automaticamente. Por favor, selecione-a no seletor abaixo.'
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

    for (const col of columns) {
      const val = row[col] !== undefined ? String(row[col]).trim() : '';
      contact[col] = val;
      const normCol = normalizeKey(col).replace(/\s+/g, '_');
      if (normCol && !contact[normCol]) {
        contact[normCol] = val;
      }
    }

    contacts.push(contact);
  });

  // De-duplicação automática por telefone na planilha
  const seenPhones = new Set<string>();
  let duplicateCount = 0;
  const uniqueContacts: ParsedContact[] = [];

  contacts.forEach((c) => {
    if (seenPhones.has(c.phone)) {
      duplicateCount++;
    } else {
      seenPhones.add(c.phone);
      uniqueContacts.push(c);
    }
  });

  if (duplicateCount > 0) {
    warnings.push(
      `${duplicateCount} número(s) com telefone duplicado na planilha foram unificados automaticamente.`
    );
  }

  if (emptyPhoneCount > 0) {
    warnings.push(
      `${emptyPhoneCount} linha(s) sem telefone válido foram desconsideradas automaticamente.`
    );
  }

  return {
    contacts: uniqueContacts,
    columns,
    totalRows: rawData.length,
    validContactsCount: uniqueContacts.length,
    emptyPhoneCount,
    detectedPhoneColumn: phoneCol,
    detectedNameColumn: nameCol,
    preview: uniqueContacts.slice(0, 5),
    warnings,
    hasPhoneColumn: !!phoneCol,
    filename,
  };
}

export function SpreadsheetUpload({ onParsed, onClear }: SpreadsheetUploadProps) {
  const [mode, setMode] = useState<'upload' | 'manual' | 'crm'>('upload');
  const [data, setData] = useState<SpreadsheetData | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Formulário Manual Individual
  const [manualPhone, setManualPhone] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualCompany, setManualCompany] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Colar em lote
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Contatos salvos do Perfil (CRM)
  const [savedContacts, setSavedContacts] = useState<any[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savedSearch, setSavedSearch] = useState('');
  const [savedFilter, setSavedFilter] = useState<'all' | 'uncontacted' | 'contacted'>('all');
  const [selectedSavedIds, setSelectedSavedIds] = useState<string[]>([]);

  const loadSavedContacts = async () => {
    setLoadingSaved(true);
    try {
      const res = await apiFetch<{ contacts: any[] }>('/api/contacts?limit=10000');
      setSavedContacts(res.contacts || []);
      setSelectedSavedIds((res.contacts || []).map((c: any) => c.id));
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingSaved(false);
    }
  };

  const handleApplySavedContacts = () => {
    const filtered = savedContacts.filter((c) => {
      if (!selectedSavedIds.includes(c.id)) return false;
      if (savedFilter === 'uncontacted') return c.totalSent === 0;
      if (savedFilter === 'contacted') return c.totalSent > 0;
      if (savedSearch.trim()) {
        const s = savedSearch.toLowerCase();
        return (
          (c.name && c.name.toLowerCase().includes(s)) ||
          c.phone.includes(s) ||
          (c.company && c.company.toLowerCase().includes(s))
        );
      }
      return true;
    });

    if (filtered.length === 0) {
      alert('Nenhum contato selecionado com os filtros atuais.');
      return;
    }

    const contacts: ParsedContact[] = filtered.map((c) => {
      let extraVars: any = {};
      try {
        if (c.variables) extraVars = JSON.parse(c.variables);
      } catch (_) {}

      return {
        phone: c.phone,
        formattedPhone: formatPhoneDisplay(c.phone),
        name: c.name || '',
        company: c.company || '',
        'Telefone': c.phone,
        'Nome': c.name || '',
        'Empresa': c.company || '',
        'Responsável': c.name || '',
        'Nome da Empresa': c.company || '',
        ...extraVars,
      };
    });

    const columns = Array.from(
      new Set(['Telefone', 'Nome', 'Empresa', 'Responsável', 'Nome da Empresa', ...Object.keys(contacts[0] || {})])
    );

    const updatedData: SpreadsheetData = {
      contacts,
      columns,
      totalRows: contacts.length,
      validContactsCount: contacts.length,
      emptyPhoneCount: 0,
      detectedPhoneColumn: 'Telefone',
      detectedNameColumn: 'Nome',
      preview: contacts.slice(0, 5),
      warnings: [],
      hasPhoneColumn: true,
      filename: `Contatos do Perfil (${contacts.length} contatos)`,
    };

    setData(updatedData);
    onParsed(updatedData);
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      setLoading(true);
      setError(null);

      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        setWorkbook(wb);
        const parsed = processWorkbook(wb, file.name);
        setData(parsed);
        onParsed(parsed);
      } catch (err: any) {
        setError(err.message || 'Erro ao processar a planilha.');
      } finally {
        setLoading(false);
      }
    },
    [onParsed]
  );

  const handleColumnChange = (type: 'phone' | 'name', newCol: string) => {
    if (!workbook || !data) return;
    const phoneCol = type === 'phone' ? newCol : data.detectedPhoneColumn || undefined;
    const nameCol = type === 'name' ? newCol : data.detectedNameColumn || undefined;
    const reprocessed = processWorkbook(workbook, data.filename, phoneCol, nameCol);
    setData(reprocessed);
    onParsed(reprocessed);
  };

  const handleAddManualContact = () => {
    setManualError(null);
    const normalized = normalizePhone(manualPhone);
    if (!normalized) {
      setManualError('Digite um número de telefone válido com DDD (ex: 11988130598).');
      return;
    }

    const currentContacts = data?.contacts || [];
    if (currentContacts.some((c) => c.phone === normalized)) {
      setManualError('Este número de telefone já está presente na lista (duplicação evitada).');
      return;
    }

    const cleanName = manualName.trim();
    const cleanCompany = manualCompany.trim();

    const newContact: ParsedContact = {
      phone: normalized,
      formattedPhone: formatPhoneDisplay(normalized),
      name: cleanName,
      company: cleanCompany,
      'Telefone': manualPhone.trim(),
      'Nome': cleanName,
      'Empresa': cleanCompany,
      'Responsável': cleanName,
      'Nome da Empresa': cleanCompany,
    };

    const updatedContacts = [newContact, ...currentContacts];
    const columns = Array.from(
      new Set([...(data?.columns || ['Telefone', 'Nome', 'Empresa', 'Responsável', 'Nome da Empresa'])])
    );

    const updatedData: SpreadsheetData = {
      contacts: updatedContacts,
      columns,
      totalRows: updatedContacts.length,
      validContactsCount: updatedContacts.length,
      emptyPhoneCount: data?.emptyPhoneCount || 0,
      detectedPhoneColumn: data?.detectedPhoneColumn || 'Telefone',
      detectedNameColumn: data?.detectedNameColumn || 'Nome',
      preview: updatedContacts.slice(0, 5),
      warnings: data?.warnings || [],
      hasPhoneColumn: true,
      filename: data?.filename || 'Contatos Manuais',
    };

    setData(updatedData);
    onParsed(updatedData);

    // Limpa campos
    setManualPhone('');
    setManualName('');
    setManualCompany('');
  };

  const handleBulkPaste = () => {
    if (!bulkText.trim()) return;
    const lines = bulkText.split('\n');
    const newContacts: ParsedContact[] = [];

    const currentContacts = data?.contacts || [];
    const seenPhones = new Set(currentContacts.map((c) => c.phone));
    let dupCount = 0;

    lines.forEach((line) => {
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      if (parts.length === 0) return;
      const rawPhone = parts[0];
      const rawName = parts[1] || '';
      const rawCompany = parts[2] || '';

      const normalized = normalizePhone(rawPhone);
      if (normalized) {
        if (seenPhones.has(normalized)) {
          dupCount++;
          return;
        }
        seenPhones.add(normalized);

        newContacts.push({
          phone: normalized,
          formattedPhone: formatPhoneDisplay(normalized),
          name: rawName,
          company: rawCompany,
          'Telefone': rawPhone,
          'Nome': rawName,
          'Empresa': rawCompany,
          'Responsável': rawName,
          'Nome da Empresa': rawCompany,
        });
      }
    });

    if (newContacts.length === 0) {
      setManualError(
        dupCount > 0
          ? `${dupCount} contato(s) colados já existiam na lista (duplicações ignoradas).`
          : 'Nenhum telefone válido encontrado no texto colado.'
      );
      return;
    }

    const updatedContacts = [...newContacts, ...currentContacts];
    const columns = Array.from(
      new Set([...(data?.columns || ['Telefone', 'Nome', 'Empresa', 'Responsável', 'Nome da Empresa'])])
    );

    const updatedData: SpreadsheetData = {
      contacts: updatedContacts,
      columns,
      totalRows: updatedContacts.length,
      validContactsCount: updatedContacts.length,
      emptyPhoneCount: data?.emptyPhoneCount || 0,
      detectedPhoneColumn: data?.detectedPhoneColumn || 'Telefone',
      detectedNameColumn: data?.detectedNameColumn || 'Nome',
      preview: updatedContacts.slice(0, 5),
      warnings: data?.warnings || [],
      hasPhoneColumn: true,
      filename: data?.filename || 'Lista Manual / Colada',
    };

    setData(updatedData);
    onParsed(updatedData);
    setBulkText('');
    setShowBulkPaste(false);
  };

  const handleRemoveContact = (indexToRemove: number) => {
    if (!data) return;
    const updatedContacts = data.contacts.filter((_, i) => i !== indexToRemove);

    if (updatedContacts.length === 0) {
      handleClear();
      return;
    }

    const updatedData: SpreadsheetData = {
      ...data,
      contacts: updatedContacts,
      totalRows: updatedContacts.length,
      validContactsCount: updatedContacts.length,
      preview: updatedContacts.slice(0, 5),
    };

    setData(updatedData);
    onParsed(updatedData);
  };

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    maxSize: 25 * 1024 * 1024,
    disabled: loading,
  });

  const handleClear = () => {
    setData(null);
    setWorkbook(null);
    setError(null);
    setManualError(null);
    onClear?.();
  };

  return (
    <div className="space-y-6">
      {/* Selector de Modo: Planilha, Manual ou Puxar do Perfil */}
      {!data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 rounded-xl bg-secondary/50 p-1 border border-border">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all',
              mode === 'upload'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Importar Planilha (Excel / CSV)
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all',
              mode === 'manual'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <UserPlus className="h-4 w-4 text-primary" />
            Inserir Manualmente
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('crm');
              loadSavedContacts();
            }}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all',
              mode === 'crm'
                ? 'bg-card text-whatsapp shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Users className="h-4 w-4 text-whatsapp" />
            Puxar Contatos Já Salvos
          </button>
        </div>
      )}

      {/* ÁREA CRM: Puxar Contatos Salvos do Perfil */}
      {!data && mode === 'crm' && (
        <div className="rounded-2xl border border-whatsapp/30 bg-card p-6 space-y-5 animate-slide-up shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-whatsapp" />
                <h3 className="font-bold text-foreground">Contatos Salvos no seu Perfil</h3>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Selecione os contatos já cadastrados no seu CRM para disparar esta campanha.
              </p>
            </div>
            <button
              type="button"
              onClick={loadSavedContacts}
              disabled={loadingSaved}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground rounded-lg border border-border px-3 py-1.5 hover:bg-secondary transition"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loadingSaved && 'animate-spin')} />
              Atualizar Base
            </button>
          </div>

          {loadingSaved ? (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-whatsapp mb-2" />
              <p className="text-sm">Carregando contatos salvos do seu perfil...</p>
            </div>
          ) : savedContacts.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <p className="text-sm font-medium text-foreground">Nenhum contato salvo ainda no seu perfil.</p>
              <p className="text-xs mt-1">Suba uma planilha na aba ao lado para que os clientes fiquem salvos permanentemente!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Filtros e Busca */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={savedSearch}
                    onChange={(e) => setSavedSearch(e.target.value)}
                    placeholder="Buscar por nome ou telefone..."
                    className="w-full rounded-xl border border-border bg-secondary/50 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-whatsapp"
                  />
                </div>

                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setSavedFilter('all')}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                      savedFilter === 'all'
                        ? 'bg-whatsapp text-white'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Todos ({savedContacts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSavedFilter('uncontacted')}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                      savedFilter === 'uncontacted'
                        ? 'bg-whatsapp text-white'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Nunca Contatados ({savedContacts.filter((c) => c.totalSent === 0).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSavedFilter('contacted')}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                      savedFilter === 'contacted'
                        ? 'bg-whatsapp text-white'
                        : 'bg-secondary text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Já Contatados ({savedContacts.filter((c) => c.totalSent > 0).length})
                  </button>
                </div>
              </div>

              {/* Botão de Ação */}
              <div className="flex items-center justify-between rounded-xl bg-whatsapp/10 border border-whatsapp/20 p-3">
                <span className="text-xs text-foreground font-medium">
                  {savedContacts.filter((c) => {
                    if (savedFilter === 'uncontacted') return c.totalSent === 0;
                    if (savedFilter === 'contacted') return c.totalSent > 0;
                    return true;
                  }).length} contato(s) prontos para carregar nesta campanha
                </span>
                <button
                  type="button"
                  onClick={handleApplySavedContacts}
                  className="rounded-xl bg-whatsapp px-4 py-2 text-xs font-bold text-white shadow-md hover:brightness-110 transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Carregar Contatos na Campanha
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ÁREA 1: Upload de Planilha */}
      {!data && mode === 'upload' && (
        <div className="space-y-3 animate-slide-up">
          <div
            {...getRootProps()}
            className={cn(
              'relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-200 cursor-pointer',
              isDragActive && !isDragReject
                ? 'border-primary bg-primary/5 scale-[1.01]'
                : isDragReject
                ? 'border-destructive bg-destructive/5'
                : 'border-border bg-secondary/20 hover:border-primary/50 hover:bg-secondary/40',
              loading && 'opacity-50 cursor-not-allowed'
            )}
          >
            <input {...getInputProps()} />

            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary">
              {loading ? (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : isDragActive ? (
                <Upload className="h-7 w-7 text-primary" />
              ) : (
                <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
              )}
            </div>

            <p className="text-sm font-semibold text-foreground">
              {isDragActive ? 'Solte a planilha aqui' : 'Arraste e solte sua planilha Excel ou CSV aqui'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              ou <span className="text-primary underline underline-offset-2">clique para selecionar do seu computador</span>
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Formatos: <strong className="text-foreground">XLSX, XLS, CSV</strong> · Suporta qualquer formato de telefone
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
      )}

      {/* ÁREA 2: Inserção Manual / Colar Lista */}
      {(!data && mode === 'manual') || data ? (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <UserPlus className="h-4 w-4 text-primary" />
              <span>{data ? 'Adicionar Mais Contatos Manualmente' : 'Adicionar Contatos Manualmente'}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowBulkPaste(!showBulkPaste)}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              {showBulkPaste ? 'Entrada Individual' : 'Colar Lista em Lote'}
            </button>
          </div>

          {showBulkPaste ? (
            <div className="space-y-2">
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={4}
                placeholder="Cole um por linha no formato: Telefone, Nome, Empresa&#10;Exemplo:&#10;11988130598, Marcio, MSServer&#10;1133331697, Wagner, 24h Servidores&#10;11946703942, Masterweb Shop"
                className="w-full rounded-xl border border-border bg-secondary/50 p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
              />
              <button
                type="button"
                onClick={handleBulkPaste}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar Linhas Coladas à Lista
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3 text-primary" />
                    Telefone WhatsApp <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    placeholder="11988130598"
                    className="w-full rounded-xl border border-border bg-secondary/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3 text-primary" />
                    Nome / Responsável
                  </label>
                  <input
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Marcio"
                    className="w-full rounded-xl border border-border bg-secondary/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3 text-primary" />
                    Empresa
                  </label>
                  <input
                    value={manualCompany}
                    onChange={(e) => setManualCompany(e.target.value)}
                    placeholder="MSServer"
                    className="w-full rounded-xl border border-border bg-secondary/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAddManualContact}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Inserir Contato
                </button>
              </div>
            </div>
          )}

          {manualError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {manualError}
            </p>
          )}
        </div>
      ) : null}

      {/* ÁREA 3: Resumo dos Contatos Carregados (Planilha ou Manual) */}
      {data && (
        <div className="space-y-5 animate-slide-up">
          {/* Card de Sucesso & Resumo */}
          <div className="rounded-2xl border border-whatsapp/30 bg-whatsapp/5 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-whatsapp/20 text-whatsapp">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{data.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-whatsapp">{data.validContactsCount}</strong> contatos prontos para disparo · {data.totalRows} registros no total
                  </p>
                </div>
              </div>
              <button
                onClick={handleClear}
                className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                title="Limpar lista e recomeçar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Avisos */}
            {data.warnings.length > 0 && (
              <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3 space-y-1 text-xs text-yellow-300">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400" />
                  <span>Avisos de importação:</span>
                </div>
                {data.warnings.map((w, i) => (
                  <p key={i} className="pl-5 text-yellow-300/90">{w}</p>
                ))}
              </div>
            )}
          </div>

          {/* Mapeamento de Colunas (se vier de planilha) */}
          {workbook && (
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Columns className="h-4 w-4 text-primary" />
                <span>Mapeamento de Colunas da Planilha</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 text-primary" />
                    Coluna do Telefone <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={data.detectedPhoneColumn || ''}
                    onChange={(e) => handleColumnChange('phone', e.target.value)}
                    className="w-full rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {data.columns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <User className="h-3.5 w-3.5 text-primary" />
                    Coluna do Nome / Responsável
                  </label>
                  <select
                    value={data.detectedNameColumn || ''}
                    onChange={(e) => handleColumnChange('name', e.target.value)}
                    className="w-full rounded-xl border border-border bg-secondary/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">Nenhum (usar padrão)</option>
                    {data.columns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Variáveis Dinâmicas */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Variáveis disponíveis para a mensagem:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.columns.map((col) => (
                <span
                  key={col}
                  className="inline-flex items-center rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-mono font-medium text-primary"
                >
                  {`{{${col}}}`}
                </span>
              ))}
            </div>
          </div>

          {/* Tabela de Contatos com Opção de Excluir */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Lista de Contatos ({data.contacts.length})
              </p>
              <span className="text-xs text-muted-foreground">
                Exibindo primeiros {Math.min(data.contacts.length, 10)} contatos
              </span>
            </div>

            <div className="overflow-auto rounded-xl border border-border max-h-72">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 sticky top-0">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Telefone</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Nome</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Empresa</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground w-12">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.contacts.slice(0, 15).map((contact, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-2 text-xs font-mono text-whatsapp font-medium">
                        {contact.formattedPhone || contact.phone}
                      </td>
                      <td className="px-4 py-2 text-xs text-foreground truncate max-w-[150px]">
                        {contact.name || contact['Responsável'] || contact['Nome'] || '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-[150px]">
                        {contact.company || contact['Nome da Empresa'] || contact['Empresa'] || '—'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveContact(i)}
                          className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Remover contato da lista"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.contacts.length > 15 && (
              <p className="mt-2 text-xs text-muted-foreground text-right">
                + {data.contacts.length - 15} outros contatos na lista
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
