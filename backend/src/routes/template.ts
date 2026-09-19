import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
export const templateRouter = Router();

// Exige autenticação
templateRouter.use(requireAuth);

/** GET /api/templates */
templateRouter.get('/', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const templates = await prisma.messageTemplate.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(templates);
});

/** POST /api/templates */
templateRouter.post('/', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { name, body, mediaUrl } = req.body;
  if (!name || !body) {
    return res.status(400).json({ error: 'name e body são obrigatórios.' });
  }
  const template = await prisma.messageTemplate.create({
    data: {
      userId,
      name,
      body,
      mediaUrl: mediaUrl || null,
    },
  });
  return res.status(201).json(template);
});

/** PUT /api/templates/:id */
templateRouter.put('/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { name, body, mediaUrl } = req.body;

  const existing = await prisma.messageTemplate.findFirst({
    where: { id: req.params.id, userId },
  });
  if (!existing) return res.status(404).json({ error: 'Template não encontrado.' });

  const template = await prisma.messageTemplate.update({
    where: { id: req.params.id },
    data: {
      name: name || existing.name,
      body: body || existing.body,
      mediaUrl: mediaUrl !== undefined ? mediaUrl : existing.mediaUrl,
    },
  });
  res.json(template);
});

/** DELETE /api/templates/:id */
templateRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const existing = await prisma.messageTemplate.findFirst({
    where: { id: req.params.id, userId },
  });
  if (!existing) return res.status(404).json({ error: 'Template não encontrado.' });

  await prisma.messageTemplate.delete({ where: { id: req.params.id } });
  res.json({ message: 'Template excluído.' });
});
