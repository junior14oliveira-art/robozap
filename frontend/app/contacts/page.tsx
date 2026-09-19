'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Phone,
  Building,
  Calendar,
  CheckCircle2,
  UserX,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface SavedContact {
  id: string;
  phone: string;
  name: string | null;
  company: string | null;
  variables: string | null;
  totalSent: number;
  lastSentAt: string | null;
  createdAt: string;
}

interface Stats {
  totalContacts: number;
  contactedCount: number;
  neverContactedCount: number;
  optOutCount: number;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<SavedContact[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalContacts: 0,
    contactedCount: 0,
    neverContactedCount: 0,
    optOutCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiFetch<Stats>('/api/contacts/stats');
      setStats(data);
    } catch (_) {}
  }, []);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        search,
        page: page.toString(),
        limit: '50',
      });
      const data = await apiFetch<{
        contacts: SavedContact[];
        pagination: { total: number; page: number; totalPages: number };
      }>(`/api/contacts?${query.toString()}`);
      setContacts(data.contacts);
      setTotalPages(data.pagination.totalPages || 1);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setMessage(null);
    try {
      await apiFetch('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({
          phone: newPhone,
          name: newName || undefined,
          company: newCompany || undefined,
        }),
      });
      setMessage({ type: 'success', text: 'Contato adicionado com sucesso!' });
      setNewPhone('');
      setNewName('');
      setNewCompany('');
      setIsAddModalOpen(false);
      fetchContacts();
      fetchStats();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro ao adicionar contato.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este contato do seu perfil?')) return;
    try {
      await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' });
      fetchContacts();
      fetchStats();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover contato.');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Excluir os ${selectedIds.length} contatos selecionados?`)) return;
    try {
      await apiFetch('/api/contacts', {
        method: 'DELETE',
        body: JSON.stringify({ ids: selectedIds }),
      });
      setSelectedIds([]);
      fetchContacts();
      fetchStats();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover contatos.');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(contacts.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Meus Contatos Salvos
          </h1>
          <p className="text-sm text-muted-foreground">
            Base de clientes salva automaticamente em cada planilha que você envia.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              fetchContacts();
              fetchStats();
            }}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent transition"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Atualizar</span>
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-whatsapp px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-whatsapp/25 hover:brightness-110 transition"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Contato</span>
          </button>
        </div>
      </div>

      {/* Message alert */}
      {message && (
        <div
          className={`flex items-center gap-3 rounded-xl p-4 text-sm ${
            message.type === 'success'
              ? 'border border-whatsapp/30 bg-whatsapp/10 text-whatsapp'
              : 'border border-red-500/30 bg-red-500/10 text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <p>{message.text}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total de Contatos
            </span>
            <Users className="h-5 w-5 text-whatsapp" />
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">{stats.totalContacts}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Já Receberam Mensagem
            </span>
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">{stats.contactedCount}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ainda Não Contatados
            </span>
            <Phone className="h-5 w-5 text-amber-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">{stats.neverContactedCount}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Opt-Out (Pediram SAIR)
            </span>
            <UserX className="h-5 w-5 text-red-400" />
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">{stats.optOutCount}</p>
        </div>
      </div>

      {/* Table Card */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-b border-border">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nome, telefone ou empresa..."
              className="w-full rounded-xl border border-border bg-secondary/50 py-2 pl-9 pr-4 text-sm text-foreground placeholder-muted-foreground outline-none transition focus:border-whatsapp"
            />
          </div>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-sm text-muted-foreground">
                {selectedIds.length} selecionado(s)
              </span>
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir Selecionados
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-secondary/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-4 w-12 text-center">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={contacts.length > 0 && selectedIds.length === contacts.length}
                    className="rounded border-border accent-whatsapp"
                  />
                </th>
                <th className="p-4">Telefone</th>
                <th className="p-4">Nome</th>
                <th className="p-4">Empresa</th>
                <th className="p-4 text-center">Disparos Recebidos</th>
                <th className="p-4">Último Envio</th>
                <th className="p-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
                    Carregando contatos...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    Nenhum contato encontrado. Suba uma planilha em Nova Campanha para sincronizar automaticamente!
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-accent/40 transition-colors"
                  >
                    <td className="p-4 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="rounded border-border accent-whatsapp"
                      />
                    </td>
                    <td className="p-4 font-mono font-medium text-foreground">
                      {c.phone}
                    </td>
                    <td className="p-4 text-foreground">
                      {c.name || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-4 text-muted-foreground">
                      {c.company || '—'}
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          c.totalSent > 0
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-secondary text-muted-foreground'
                        }`}
                      >
                        {c.totalSent} envio(s)
                      </span>
                    </td>
                    <td className="p-4 text-xs text-muted-foreground">
                      {c.lastSentAt ? (
                        new Date(c.lastSentAt).toLocaleString('pt-BR')
                      ) : (
                        <span>Nunca</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/20 hover:text-red-400 transition"
                        title="Excluir Contato"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-border">
            <span className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Novo Contato */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
            <div>
              <h3 className="text-lg font-bold text-foreground">Adicionar Novo Contato</h3>
              <p className="text-xs text-muted-foreground">
                Cadastre um contato diretamente no seu perfil do RoboZap.
              </p>
            </div>

            <form onSubmit={handleAddContact} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Telefone (com DDD) *
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="11999998888 ou 5511999998888"
                    className="w-full rounded-xl border border-border bg-secondary/50 py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-whatsapp"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome do cliente"
                  className="w-full rounded-xl border border-border bg-secondary/50 py-2 px-3 text-sm text-foreground outline-none focus:border-whatsapp"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Empresa
                </label>
                <div className="relative">
                  <Building className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder="Nome da empresa (opcional)"
                    className="w-full rounded-xl border border-border bg-secondary/50 py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-whatsapp"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-2 rounded-xl bg-whatsapp px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-whatsapp/25 hover:brightness-110 disabled:opacity-50"
                >
                  {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Salvar Contato</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
