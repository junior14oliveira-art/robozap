import { PrismaClient } from '@prisma/client';

function getDatabaseUrl(): string {
  let url = process.env.DATABASE_URL || '';
  // Se estiver conectando via pooler do Supabase na porta 5432 (Session Mode com limite de 15 conexões),
  // redireciona automaticamente para a porta 6543 (Transaction Mode) com PgBouncer
  // para permitir centenas de conexões simultâneas sem nunca esgotar o pool.
  if (url.includes('pooler.supabase.com:5432')) {
    url = url.replace(':5432', ':6543');
    if (!url.includes('pgbouncer=true')) {
      url += (url.includes('?') ? '&' : '?') + 'pgbouncer=true&connection_limit=5';
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

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
