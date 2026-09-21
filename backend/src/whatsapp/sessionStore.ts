import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { logger } from '../index';

const prisma = new PrismaClient();

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

/**
 * Sincroniza todos os arquivos presentes no diretório local da sessão para o Supabase.
 */
export async function syncSessionFilesToDb(userId: string, sessionDir: string): Promise<void> {
  try {
    if (!fs.existsSync(sessionDir)) return;

    const files = fs.readdirSync(sessionDir);
    if (files.length === 0) return;

    for (const file of files) {
      const filePath = path.join(sessionDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          const content = fs.readFileSync(filePath, 'utf-8');
          await saveAuthKeyToDb(userId, file, content);
        }
      } catch (_) {}
    }

    logger.info({ userId, filesCount: files.length }, '☁️ Arquivos da sessão sincronizados com o Supabase');
  } catch (err: any) {
    logger.warn({ userId, err: err.message }, 'Erro na sincronização de arquivos para o Supabase');
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
