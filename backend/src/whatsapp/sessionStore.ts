import fs from 'fs';
import path from 'path';
import { logger } from '../index';
import { prisma } from '../prisma';

/**
 * Salva ou atualiza uma chave de sessão individual no Supabase.
 */
export async function saveAuthKeyToDb(userId: string, key: string, value: string): Promise<void> {
  try {
    await prisma.whatsAppAuthKey.upsert({
      where: {
        userId_key: {
          userId,
          key,
        },
      },
      create: {
        userId,
        key,
        value,
      },
      update: {
        value,
      },
    });
  } catch (err: any) {
    logger.warn({ userId, key, err: err.message }, 'Falha ao salvar WhatsAppAuthKey no Supabase');
  }
}

/**
 * Remove uma chave de sessão individual do Supabase.
 */
export async function deleteAuthKeyFromDb(userId: string, key: string): Promise<void> {
  try {
    await prisma.whatsAppAuthKey.deleteMany({
      where: {
        userId,
        key,
      },
    });
  } catch (err: any) {
    logger.warn({ userId, key, err: err.message }, 'Falha ao remover WhatsAppAuthKey do Supabase');
  }
}

/**
 * Remove todas as chaves de sessão de um usuário no Supabase (Logout definitivo).
 */
export async function clearAllAuthKeysFromDb(userId: string): Promise<void> {
  try {
    await prisma.whatsAppAuthKey.deleteMany({
      where: { userId },
    });
    logger.info({ userId }, '🗑️ Todas as chaves de autenticação do usuário foram removidas do Supabase');
  } catch (err: any) {
    logger.warn({ userId, err: err.message }, 'Falha ao limpar WhatsAppAuthKeys no Supabase');
  }
}

/**
 * Restaura todos os arquivos de sessão salvos no Supabase para a pasta local em disco.
 * Retorna true se credenciais foram restauradas, false caso contrário.
 */
export async function restoreSessionFromDb(userId: string, targetDir: string): Promise<boolean> {
  try {
    const keys = await prisma.whatsAppAuthKey.findMany({
      where: { userId },
    });

    if (!keys || keys.length === 0) {
      return false;
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    let hasCreds = false;
    for (const item of keys) {
      const filePath = path.join(targetDir, item.key);
      fs.writeFileSync(filePath, item.value, 'utf-8');
      try {
        const stat = fs.statSync(filePath);
        fileSyncMtimeCache.set(`${userId}:${item.key}`, stat.mtimeMs);
      } catch (_) {}
      if (item.key === 'creds.json') {
        hasCreds = true;
      }
    }

    logger.info(
      { userId, filesRestored: keys.length, hasCreds },
      '📦 Sessão do WhatsApp restaurada com sucesso do Supabase para o disco local'
    );

    return hasCreds;
  } catch (err: any) {
    logger.error({ userId, err: err.message }, 'Erro ao restaurar sessão do WhatsApp do Supabase');
    return false;
  }
}

// Cache em memória de data de modificação dos arquivos para evitar queries redundantes no Supabase
const fileSyncMtimeCache = new Map<string, number>();
const syncInProgress = new Set<string>();
const syncDebounceTimers = new Map<string, NodeJS.Timeout>();

/**
 * Sincroniza APENAS o arquivo creds.json para o Supabase (1 query rápida de ~15ms).
 * Usado pelo evento 'creds.update' do Baileys para nunca sobrecarregar o pool de conexões.
 */
export async function syncCredsOnly(userId: string, sessionDir: string): Promise<void> {
  try {
    const credsPath = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath)) return;

    const stat = fs.statSync(credsPath);
    const cacheKey = `${userId}:creds.json`;
    if (fileSyncMtimeCache.get(cacheKey) === stat.mtimeMs) return;

    const content = fs.readFileSync(credsPath, 'utf-8');
    await saveAuthKeyToDb(userId, 'creds.json', content);
    fileSyncMtimeCache.set(cacheKey, stat.mtimeMs);
  } catch (err: any) {
    logger.warn({ userId, err: err.message }, 'Falha ao sincronizar creds.json com Supabase');
  }
}

/**
 * Agenda sincronização de arquivos com debounce para agrupar múltiplas emissões do Baileys.
 */
export function scheduleSessionSync(userId: string, sessionDir: string, delayMs = 5000): void {
  const existing = syncDebounceTimers.get(userId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    syncDebounceTimers.delete(userId);
    syncSessionFilesToDb(userId, sessionDir).catch(() => {});
  }, delayMs);

  syncDebounceTimers.set(userId, timer);
}

/**
 * Sincroniza arquivos do diretório de sessão para o Supabase.
 * OTIMIZADO: Apenas envia arquivos cujo mtime foi alterado desde a última sincronização.
 * Arquivos estáticos (99% das chaves) são ignorados em milissegundos sem tocar o banco.
 */
export async function syncSessionFilesToDb(userId: string, sessionDir: string): Promise<void> {
  if (syncInProgress.has(userId)) return;
  syncInProgress.add(userId);

  try {
    if (!fs.existsSync(sessionDir)) return;

    const files = fs.readdirSync(sessionDir);
    if (files.length === 0) return;

    const changedFiles: Array<{ file: string; content: string; mtime: number }> = [];

    for (const file of files) {
      const filePath = path.join(sessionDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          const cacheKey = `${userId}:${file}`;
          if (fileSyncMtimeCache.get(cacheKey) !== stat.mtimeMs) {
            const content = fs.readFileSync(filePath, 'utf-8');
            changedFiles.push({ file, content, mtime: stat.mtimeMs });
          }
        }
      } catch (_) {}
    }

    if (changedFiles.length === 0) {
      return; // Nenhuma chave mudou, 0 queries ao banco!
    }

    // Salva apenas os arquivos que realmente foram alterados
    for (const item of changedFiles) {
      await saveAuthKeyToDb(userId, item.file, item.content);
      fileSyncMtimeCache.set(`${userId}:${item.file}`, item.mtime);
    }

    logger.info(
      { userId, changedCount: changedFiles.length, totalFiles: files.length },
      '☁️ Arquivos alterados da sessão sincronizados com o Supabase'
    );
  } catch (err: any) {
    logger.warn({ userId, err: err.message }, 'Erro na sincronização de arquivos para o Supabase');
  } finally {
    syncInProgress.delete(userId);
  }
}

/**
 * Verifica se existem credenciais salvas no banco para o usuário.
 */
export async function hasSavedCredentials(userId: string): Promise<boolean> {
  try {
    const creds = await prisma.whatsAppAuthKey.findUnique({
      where: {
        userId_key: {
          userId,
          key: 'creds.json',
        },
      },
      select: { id: true },
    });
    return !!creds;
  } catch (_) {
    return false;
  }
}

