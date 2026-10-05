import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
  generateVariationsWithGrok,
  generateSpintaxWithGrok,
  getGrokApiKey,
} from '../services/grokService';
import { logger } from '../index';

export const aiRouter = Router();

// Todas as rotas de IA exigem autenticação
aiRouter.use(requireAuth);

/**
 * GET /api/ai/status
 * Verifica se a chave do Grok (xAI) está configurada
 */
aiRouter.get('/status', (req: AuthRequest, res: Response) => {
  const customKey = req.headers['x-grok-api-key'] as string | undefined;
  const key = getGrokApiKey(customKey);
  res.json({
    hasKey: !!key,
    model: process.env.GROK_MODEL || 'grok-2-latest',
  });
});

/**
 * POST /api/ai/variations
 * Gera múltiplas variações humanizadas da mensagem usando Grok (xAI)
 */
aiRouter.post('/variations', async (req: AuthRequest, res: Response) => {
  try {
    const { baseMessage, count = 4, tone = 'consultivo', apiKey: bodyKey } = req.body;

    if (!baseMessage || typeof baseMessage !== 'string' || baseMessage.trim().length === 0) {
      return res.status(400).json({ error: 'Mensagem base é obrigatória para gerar variações.' });
    }

    const headerKey = req.headers['x-grok-api-key'] as string | undefined;
    const apiKey = bodyKey || headerKey;

    const result = await generateVariationsWithGrok({
      baseMessage: baseMessage.trim(),
      count: Math.min(Math.max(Number(count) || 4, 2), 7),
      tone,
      apiKey,
    });

    return res.json({
      variations: result.variations,
      advice: result.advice || [],
      usedAI: !!getGrokApiKey(apiKey),
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Erro ao gerar variações com Grok');
    return res.status(500).json({ error: 'Erro ao gerar variações: ' + err.message });
  }
});

/**
 * POST /api/ai/spintax
 * Converte uma mensagem em Spintax aninhado rico com Grok (xAI)
 */
aiRouter.post('/spintax', async (req: AuthRequest, res: Response) => {
  try {
    const { baseMessage, apiKey: bodyKey } = req.body;

    if (!baseMessage || typeof baseMessage !== 'string' || baseMessage.trim().length === 0) {
      return res.status(400).json({ error: 'Mensagem base é obrigatória para converter em Spintax.' });
    }

    const headerKey = req.headers['x-grok-api-key'] as string | undefined;
    const apiKey = bodyKey || headerKey;

    const result = await generateSpintaxWithGrok({
      baseMessage: baseMessage.trim(),
      apiKey,
    });

    return res.json({
      spintax: result.spintax,
      combinationsEstimate: result.combinationsEstimate,
      usedAI: !!getGrokApiKey(apiKey),
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Erro ao gerar Spintax com Grok');
    return res.status(500).json({ error: 'Erro ao gerar Spintax: ' + err.message });
  }
});
