'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Smartphone,
  Send,
  History,
  FileText,
  Settings,
  Zap,
  Users,
  LogOut,
  User as UserIcon,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWhatsAppStatus } from '@/hooks/useWhatsAppStatus';
import { useAuth } from '@/context/AuthContext';

const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/connect', icon: Smartphone, label: 'Conectar Aparelho' },
  { href: '/campaigns/new', icon: Send, label: 'Nova Campanha' },
  { href: '/contacts', icon: Users, label: 'Meus Contatos' },
  { href: '/history', icon: History, label: 'Histórico' },
  { href: '/templates', icon: FileText, label: 'Templates' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { waStatus } = useWhatsAppStatus();
  const { user, logout } = useAuth();

  // Se estiver nas páginas de autenticação, não renderiza a barra lateral
  if (pathname === '/login' || pathname === '/register') {
    return null;
  }

  const itemsToRender = [
    ...navItems,
    ...(user?.role === 'admin'
      ? [{ href: '/users', icon: ShieldCheck, label: 'Usuários' }]
      : []),
  ];

  const statusColor =
    waStatus.status === 'connected'
      ? 'bg-whatsapp animate-pulse-green'
      : waStatus.status === 'qr_ready' || waStatus.status === 'connecting'
      ? 'bg-yellow-400 animate-pulse'
      : 'bg-red-500';

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-whatsapp shadow-lg shadow-whatsapp/25">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-foreground">RoboZap</h1>
          <p className="text-xs text-muted-foreground">Automação WhatsApp</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {itemsToRender.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : '')} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* WhatsApp Status Indicator */}
      <div className="border-t border-border p-4 space-y-3">
        <div className="flex items-center gap-3 rounded-lg bg-secondary/50 px-3 py-2.5">
          <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', statusColor)} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">
              {waStatus.status === 'connected'
                ? 'WhatsApp Conectado'
                : waStatus.status === 'qr_ready'
                ? 'Aguardando QR Code'
                : waStatus.status === 'connecting'
                ? 'Conectando...'
                : 'Desconectado'}
            </p>
            {waStatus.phone && (
              <p className="truncate text-xs text-muted-foreground">{waStatus.phone}</p>
            )}
          </div>
        </div>

        {/* User Profile Card & Logout */}
        {user && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/30 p-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-whatsapp/20 text-whatsapp font-bold text-xs uppercase">
                {user.name ? user.name.slice(0, 2) : <UserIcon className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{user.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <button
              onClick={logout}
              title="Sair da conta"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/20 hover:text-red-400 transition"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Settings link */}
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Configurações
        </Link>
      </div>
    </aside>
  );
}
