import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const templateRouter = Router();

/** GET /api/templates */
templateRouter.get('/', async (_req, res: Response) => {
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  res.json(templates);
});

/** POST /api/templates */
templateRouter.post('/', async (req: Request, res: Response) => {
  const { name, body } = req.body;
  if (!name || !body) {
    return res.status(400).json({ error: 'name e body são obrigatórios.' });
  }
  const template = await prisma.messageTemplate.create({ data: { name, body } });
  return res.status(201).json(template);
});

/** PUT /api/templates/:id */
templateRouter.put('/:id', async (req: Request, res: Response) => {
  const { name, body } = req.body;
  const template = await prisma.messageTemplate.update({
    where: { id: req.params.id },
    data: { name, body },
  });
  res.json(template);
});

/** DELETE /api/templates/:id */
templateRouter.delete('/:id', async (req: Request, res: Response) => {
  await prisma.messageTemplate.delete({ where: { id: req.params.id } });
  res.json({ message: 'Template excluído.' });
});
