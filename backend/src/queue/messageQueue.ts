import IORedis from 'ioredis';
import { logger } from '../index';
import { executeMessageJob } from './worker';

// ── Redis Connection & Version Detection ────────────────────────────────────
export const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

export let isRedisBullMQCompatible = false;

// Check Redis version asynchronously without blocking or throwing unhandled errors
redisConnection
  .connect()
  .then(async () => {
    try {
      const info = await redisConnection.info('server');
      const match = info.match(/redis_version:(\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1], 10);
        if (major >= 5) {
          isRedisBullMQCompatible = true;
          logger.info(`✅ Redis ${match[1]}.${match[2]} conectado (compatível com BullMQ)`);
        } else {
          logger.info(
            `ℹ️ Redis versão ${match[1]}.${match[2]} detectado (< 5.0.0). Motor de Fila Nativo Assíncrono ATIVADO com Blindagem Anti-Ban.`
          );
        }
      }
    } catch (_err) {
      logger.info('ℹ️ Ativando Motor de Fila Nativo Assíncrono.');
    }
  })
  .catch((_err) => {
    logger.info('ℹ️ Redis indisponível ou sem suporte a BullMQ. Usando Motor de Fila Nativo Assíncrono.');
  });

// ── Queue Types & Structures ───────────────────────────────────────────────
export const MESSAGE_QUEUE_NAME = 'message-dispatch';

export interface MessageJobData {
  userId: string;
  campaignId: string;
  contactId: string;
  phone: string;
  message: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  randomizeMedia?: boolean;
  index: number;
  totalContacts: number;
  delayMs: number;
  isBatchCooldown?: boolean;
}

// ── Native In-Memory Async Queue Engine ────────────────────────────────────
// Garante execução 100% segura, sequencial, com delays humanizados e batch cooling,
// eliminando dependência de Docker ou Redis >= 5 no Windows local.
interface CampaignRunner {
  campaignId: string;
  userId: string;
  paused: boolean;
  cancelled: boolean;
  queue: MessageJobData[];
  timeoutRef: NodeJS.Timeout | null;
}

const activeRunners = new Map<string, CampaignRunner>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function startCampaignRunner(runner: CampaignRunner): Promise<void> {
  while (runner.queue.length > 0) {
    if (runner.cancelled) {
      logger.info({ campaignId: runner.campaignId, userId: runner.userId }, '🚫 Runner da campanha cancelado.');
      activeRunners.delete(runner.campaignId);
      return;
    }

    if (runner.paused) {
      await sleep(2000);
      continue;
    }

    const jobData = runner.queue.shift();
    if (!jobData) break;

    // Aguarda o delay humanizado do job
    if (jobData.delayMs > 0) {
      await new Promise<void>((resolve) => {
        runner.timeoutRef = setTimeout(() => {
          runner.timeoutRef = null;
          resolve();
        }, jobData.delayMs);
      });
    }

    if (runner.cancelled) {
      activeRunners.delete(runner.campaignId);
      return;
    }

    // Executa disparo com todas as proteções anti-ban
    try {
      await executeMessageJob(jobData);
    } catch (err: any) {
      logger.error(
        { campaignId: runner.campaignId, userId: runner.userId, err: err.message },
        'Erro ao disparar mensagem no runner'
      );
    }
  }

  activeRunners.delete(runner.campaignId);
  logger.info({ campaignId: runner.campaignId, userId: runner.userId }, '🏁 Runner da campanha finalizado.');
}

/**
 * Enfileira contatos da campanha calculando os delays humanizados
 * e intervalos de resfriamento de lote (Batch Cooling).
 */
export async function enqueueCampaign(params: {
  userId: string;
  campaignId: string;
  contacts: Array<{
    id: string;
    phone: string;
    message: string;
    mediaUrl?: string | null;
    mediaType?: string | null;
    randomizeMedia?: boolean;
  }>;
  delayMin: number;
  delayMax: number;
  batchSize?: number;
  batchPauseMin?: number;
}): Promise<void> {
  const { userId, campaignId, contacts, delayMin, delayMax, batchSize = 20, batchPauseMin = 3 } = params;
  const totalContacts = contacts.length;

  const queueItems: MessageJobData[] = [];

  for (let index = 0; index < totalContacts; index++) {
    const contact = contacts[index];
    const randomDelayMs = randomBetween(delayMin * 1000, delayMax * 1000);
    let jobDelay = 0;
    let isBatchCooldown = false;

    if (index === 0) {
      jobDelay = 1500; // 1.5s inicial
    } else {
      if (batchSize > 0 && index % batchSize === 0) {
        const cooldownMs = batchPauseMin * 60 * 1000;
        jobDelay = cooldownMs + randomDelayMs;
        isBatchCooldown = true;
        logger.info(
          { campaignId, userId, contactIndex: index, cooldownMinutes: batchPauseMin },
          '🧊 Aplicando resfriamento de lote (Batch Cooling) anti-ban'
        );
      } else {
        jobDelay = randomDelayMs;
      }
    }

    queueItems.push({
      userId,
      campaignId,
      contactId: contact.id,
      phone: contact.phone,
      message: contact.message,
      mediaUrl: contact.mediaUrl,
      mediaType: contact.mediaType || 'image',
      randomizeMedia: contact.randomizeMedia !== false,
      index,
      totalContacts,
      delayMs: jobDelay,
      isBatchCooldown,
    });
  }

  const runner: CampaignRunner = {
    campaignId,
    userId,
    paused: false,
    cancelled: false,
    queue: queueItems,
    timeoutRef: null,
  };

  activeRunners.set(campaignId, runner);

  logger.info(
    {
      campaignId,
      userId,
      total: totalContacts,
      hasMedia: contacts.some((c) => !!c.mediaUrl),
    },
    '📨 Disparos enfileirados no Motor de Fila Nativo RoboZap com Batch Cooling e Spintax'
  );

  // Inicia o processamento assíncrono em background
  startCampaignRunner(runner).catch((err) => {
    logger.error({ campaignId, userId, err }, 'Erro inesperado no runner da campanha');
  });
}

export async function pauseCampaignJobs(campaignId: string): Promise<void> {
  const runner = activeRunners.get(campaignId);
  if (runner) {
    runner.paused = true;
  }
  logger.info({ campaignId }, '⏸️ Campanha pausada');
}

export async function resumeCampaignJobs(campaignId: string): Promise<void> {
  const runner = activeRunners.get(campaignId);
  if (runner) {
    runner.paused = false;
  }
  logger.info({ campaignId }, '▶️ Campanha retomada');
}

export async function cancelCampaignJobs(campaignId: string): Promise<void> {
  const runner = activeRunners.get(campaignId);
  if (runner) {
    runner.cancelled = true;
    if (runner.timeoutRef) {
      clearTimeout(runner.timeoutRef);
      runner.timeoutRef = null;
    }
    runner.queue = [];
  }
  activeRunners.delete(campaignId);
  logger.info({ campaignId }, '🚫 Disparos da campanha cancelados');
}
