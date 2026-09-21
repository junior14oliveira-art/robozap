'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/Sidebar';
import { WhatsAppStatusBanner } from '@/components/WhatsAppStatusBanner';
import { Toaster } from '@/components/ui/toaster';
import { Loader2 } from 'lucide-react';

function AppContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const isAuthPage = pathname === '/login' || pathname === '/register';

  // Keep-alive anti cold-start ping para manter o backend no Render sempre acordado
  useEffect(() => {
    const pingBackend = () => {
      fetch('/health', { method: 'GET', cache: 'no-store' }).catch(() => {
        // Ignora silenciosamente erros em segundo plano
      });
    };

    // Ping inicial ao carregar a página
    pingBackend();

    // Ping a cada 3 minutos (Render desliga com 15 minutos de inatividade)
    const intervalId = setInterval(pingBackend, 3 * 60 * 1000);

    // Ping quando o usuário volta o foco para a aba do navegador
    const onFocus = () => {
      pingBackend();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-whatsapp" />
          <p className="text-sm font-medium text-muted-foreground">Iniciando RoboZap...</p>
        </div>
      </div>
    );
  }

  if (isAuthPage) {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <WhatsAppStatusBanner />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppContent>{children}</AppContent>
      <Toaster />
    </AuthProvider>
  );
}
