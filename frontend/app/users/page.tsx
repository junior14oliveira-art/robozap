'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Lock,
  Mail,
  User,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  whatsAppSession?: { status: string; phone: string | null } | null;
  _count: {
    campaigns: number;
    savedContacts: number;
  };
}

export default function UsersManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ users: UserData[] }>('/api/users');
      setUsers(data.users);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Erro ao carregar usuários.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatusMsg(null);

    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role }),
      });
      setStatusMsg({ type: 'success', text: 'Usuário cadastrado com sucesso!' });
      setIsModalOpen(false);
      setName('');
      setEmail('');
      setPassword('');
      setRole('user');
      fetchUsers();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Erro ao criar usuário.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (userToToggle: UserData) => {
    const nextStatus = userToToggle.status === 'active' ? 'blocked' : 'active';
    try {
      await apiFetch(`/api/users/${userToToggle.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      fetchUsers();
    } catch (err: any) {
      window.alert(err.message || 'Erro ao alterar status.');
    }
  };

  const handleDeleteUser = async (id: string, userName: string) => {
    if (!confirm(`Tem certeza que deseja excluir permanentemente o usuário "${userName}"?`)) return;
    try {
      await apiFetch(`/api/users/${id}`, { method: 'DELETE' });
      fetchUsers();
    } catch (err: any) {
      window.alert(err.message || 'Erro ao excluir usuário.');
    }
  };

  const copyRegisterLink = () => {
    const link = `${window.location.origin}/register`;
    navigator.clipboard.writeText(link);
    setStatusMsg({ type: 'success', text: `Link copiado: ${link}` });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Gerenciamento de Usuários
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastre outros operadores ou envie o link para eles mesmos criarem suas contas.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={copyRegisterLink}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent transition"
            title="Copiar link público de cadastro"
          >
            <Copy className="h-4 w-4" />
            <span>Copiar Link de Cadastro</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-whatsapp px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-whatsapp/25 hover:brightness-110 transition"
          >
            <UserPlus className="h-4 w-4" />
            <span>Cadastrar Novo Usuário</span>
          </button>
        </div>
      </div>

      {/* Alert */}
      {statusMsg && (
        <div
          className={`flex items-center gap-3 rounded-xl p-4 text-sm ${
            statusMsg.type === 'success'
              ? 'border border-whatsapp/30 bg-whatsapp/10 text-whatsapp'
              : 'border border-red-500/30 bg-red-500/10 text-red-400'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <p>{statusMsg.text}</p>
        </div>
      )}

      {/* Public link banner */}
      <div className="rounded-2xl border border-border bg-card/60 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-whatsapp/20 text-whatsapp">
            <ExternalLink className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Link direto para novos usuários:</p>
            <p className="text-muted-foreground">Qualquer pessoa que acessar poderá criar uma conta isolada e usar o sistema.</p>
          </div>
        </div>
        <button
          onClick={copyRegisterLink}
          className="font-mono text-whatsapp bg-whatsapp/10 border border-whatsapp/20 px-3 py-1.5 rounded-lg hover:bg-whatsapp/20 transition"
        >
          /register (clique para copiar)
        </button>
      </div>

      {/* Users Table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-whatsapp" />
            <span className="font-semibold text-foreground">Usuários Cadastrados ({users.length})</span>
          </div>
          <button
            onClick={fetchUsers}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-secondary transition"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            <span>Atualizar</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-secondary/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-4">Usuário / Nome</th>
                <th className="p-4">Email</th>
                <th className="p-4">Nível</th>
                <th className="p-4">Status</th>
                <th className="p-4">WhatsApp</th>
                <th className="p-4 text-center">Campanhas</th>
                <th className="p-4 text-center">Contatos CRM</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-whatsapp mb-2" />
                    Carregando usuários...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isCurrent = currentUser?.id === u.id;
                  const isConn = u.whatsAppSession?.status === 'connected';

                  return (
                    <tr key={u.id} className="hover:bg-accent/40 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-whatsapp/15 text-whatsapp font-bold text-xs uppercase">
                            {u.name.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground flex items-center gap-1.5">
                              {u.name}
                              {isCurrent && (
                                <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold">
                                  Você
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Criado em {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-xs text-foreground">{u.email}</td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            u.role === 'admin'
                              ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                              : 'bg-secondary text-muted-foreground'
                          }`}
                        >
                          {u.role === 'admin' ? 'Administrador' : 'Operador'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            u.status === 'active'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                              : 'bg-red-500/15 text-red-400 border border-red-500/20'
                          }`}
                        >
                          {u.status === 'active' ? 'Ativo' : 'Bloqueado'}
                        </span>
                      </td>
                      <td className="p-4 text-xs">
                        {isConn ? (
                          <span className="text-emerald-400 font-mono flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            {u.whatsAppSession?.phone || 'Conectado'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Desconectado</span>
                        )}
                      </td>
                      <td className="p-4 text-center font-medium text-foreground">{u._count.campaigns}</td>
                      <td className="p-4 text-center font-medium text-foreground">{u._count.savedContacts}</td>
                      <td className="p-4 text-right">
                        {!isCurrent && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleToggleStatus(u)}
                              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                                u.status === 'active'
                                  ? 'border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10'
                                  : 'border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                              }`}
                            >
                              {u.status === 'active' ? 'Bloquear' : 'Ativar'}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id, u.name)}
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/20 hover:text-red-400 transition"
                              title="Excluir Usuário"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Novo Usuário */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
            <div>
              <h3 className="text-lg font-bold text-foreground">Cadastrar Novo Usuário</h3>
              <p className="text-xs text-muted-foreground">
                Crie um acesso com conta isolada para um novo operador ou cliente.
              </p>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Nome Completo *
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome do operador"
                    className="w-full rounded-xl border border-border bg-secondary/50 py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-whatsapp"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Email de Acesso *
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@empresa.com"
                    className="w-full rounded-xl border border-border bg-secondary/50 py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-whatsapp"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Senha Inicial *
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full rounded-xl border border-border bg-secondary/50 py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-whatsapp"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Nível de Permissão
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full rounded-xl border border-border bg-secondary/50 py-2 px-3 text-sm text-foreground outline-none focus:border-whatsapp"
                >
                  <option value="user">Operador Padrão (usa campanhas e WhatsApp isolados)</option>
                  <option value="admin">Administrador (pode gerenciar outros usuários)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-xl bg-whatsapp px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-whatsapp/25 hover:brightness-110 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Criar Usuário</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
