import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { normalizePhone } from '../services/spreadsheetService';
import { prisma } from '../prisma';

export const contactRouter = Router();

// Todas as rotas de contatos exigem autenticação
contactRouter.use(requireAuth);

/**
 * GET /api/contacts
 * Lista contatos salvos no perfil do usuário com paginação e busca
 */
contactRouter.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { search = '', page = '1', limit = '50' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const whereClause: any = { userId };
    if (search && typeof search === 'string') {
      const cleanSearch = search.trim();
      whereClause.OR = [
        { name: { contains: cleanSearch, mode: 'insensitive' } },
        { phone: { contains: cleanSearch } },
        { company: { contains: cleanSearch, mode: 'insensitive' } },
      ];
    }

    const [total, contacts] = await Promise.all([
      prisma.savedContact.count({ where: whereClause }),
      prisma.savedContact.findMany({
        where: whereClause,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    return res.json({
      contacts,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err: any) {
    console.error('Erro ao buscar contatos salvos:', err);
    return res.status(500).json({ error: 'Erro ao carregar lista de contatos.' });
  }
});

/**
 * GET /api/contacts/stats
 * Resumo dos contatos do perfil
 */
contactRouter.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const totalContacts = await prisma.savedContact.count({ where: { userId } });
    const contactedCount = await prisma.savedContact.count({
      where: { userId, totalSent: { gt: 0 } },
    });
    const optOutCount = await prisma.optOutContact.count({ where: { userId } });

    return res.json({
      totalContacts,
      contactedCount,
      neverContactedCount: Math.max(0, totalContacts - contactedCount),
      optOutCount,
    });
  } catch (err: any) {
    console.error('Erro ao carregar estatísticas de contatos:', err);
    return res.status(500).json({ error: 'Erro ao calcular estatísticas.' });
  }
});

/**
 * POST /api/contacts
 * Adiciona ou atualiza manualmente um contato no perfil
 */
contactRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { phone, name, company, variables } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Telefone é obrigatório.' });
    }

    const normalized = normalizePhone(phone);
    if (!normalized) {
      return res.status(400).json({ error: 'Número de telefone inválido.' });
    }

    const saved = await prisma.savedContact.upsert({
      where: {
        userId_phone: {
          userId,
          phone: normalized,
        },
      },
      create: {
        userId,
        phone: normalized,
        name: name ? name.trim() : null,
        company: company ? company.trim() : null,
        variables: variables ? JSON.stringify(variables) : null,
      },
      update: {
        name: name ? name.trim() : undefined,
        company: company ? company.trim() : undefined,
        variables: variables ? JSON.stringify(variables) : undefined,
      },
    });

    return res.status(201).json(saved);
  } catch (err: any) {
    console.error('Erro ao salvar contato:', err);
    return res.status(500).json({ error: 'Erro ao salvar contato.' });
  }
});

/**
 * DELETE /api/contacts/:id
 * Remove um contato salvo do perfil
 */
contactRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const contact = await prisma.savedContact.findFirst({
      where: { id, userId },
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contato não encontrado.' });
    }

    await prisma.savedContact.delete({ where: { id } });
    return res.json({ message: 'Contato removido com sucesso.' });
  } catch (err: any) {
    console.error('Erro ao excluir contato:', err);
    return res.status(500).json({ error: 'Erro ao excluir contato.' });
  }
});

/**
 * DELETE /api/contacts
 * Exclui múltiplos contatos ou todos os contatos do usuário
 */
contactRouter.delete('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { ids, all } = req.body;

    if (all === true) {
      const result = await prisma.savedContact.deleteMany({
        where: { userId },
      });
      return res.json({ message: `Todos os ${result.count} contatos foram removidos.` });
    }

    if (Array.isArray(ids) && ids.length > 0) {
      const result = await prisma.savedContact.deleteMany({
        where: {
          userId,
          id: { in: ids },
        },
      });
      return res.json({ message: `${result.count} contatos removidos com sucesso.` });
    }

    return res.status(400).json({ error: 'Informe os IDs para exclusão ou configure all: true.' });
  } catch (err: any) {
    console.error('Erro ao excluir contatos em massa:', err);
    return res.status(500).json({ error: 'Erro ao excluir contatos.' });
  }
});
