import { PrismaClient } from '@prisma/client';

function getDatabaseUrl(): string {
  let url = process.env.DATABASE_URL || '';
  // Se estiver conectando via pooler do Supabase na porta 5432 (Session Mode com limite baixo),
  // redireciona automaticamente para a porta 6543 (Transaction Mode) com PgBouncer
  // para permitir alta concorrência sem esgotar o pool de conexões.
  if (url.includes('pooler.supabase.com:5432')) {
    url = url.replace(':5432', ':6543');
    if (!url.includes('pgbouncer=true')) {
      url += (url.includes('?') ? '&' : '?') + 'pgbouncer=true&connection_limit=15&pool_timeout=30';
    }
  }
  return url;
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
  });

globalForPrisma.prisma = prisma;
