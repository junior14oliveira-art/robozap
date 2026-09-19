import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();
export const userRouter = Router();

userRouter.use(requireAuth);

// Middleware para garantir que apenas administradores acessem
function requireAdmin(req: AuthRequest, res: Response, next: any) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem gerenciar usuários.' });
  }
  next();
}

userRouter.use(requireAdmin);

/**
 * GET /api/users
 * Lista todos os usuários cadastrados com métricas
 */
userRouter.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        whatsAppSession: {
          select: { status: true, phone: true },
        },
        _count: {
          select: {
            campaigns: true,
            savedContacts: true,
          },
        },
      },
    });

    return res.json({ users });
  } catch (err: any) {
    console.error('Erro ao listar usuários:', err);
    return res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

/**
 * POST /api/users
 * Administrador cadastra um novo usuário
 */
userRouter.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, role = 'user' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      return res.status(400).json({ error: 'Já existe um usuário cadastrado com este email.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: cleanEmail,
        password: hashedPassword,
        role: role === 'admin' ? 'admin' : 'user',
        status: 'active',
        whatsAppSession: {
          create: { status: 'disconnected' },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return res.status(201).json({ message: 'Usuário cadastrado com sucesso!', user: newUser });
  } catch (err: any) {
    console.error('Erro ao criar usuário:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
  }
});

/**
 * PATCH /api/users/:id/status
 * Bloqueia ou ativa um usuário
 */
userRouter.patch('/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (status !== 'active' && status !== 'blocked') {
      return res.status(400).json({ error: 'Status deve ser active ou blocked.' });
    }

    if (id === req.user!.id) {
      return res.status(400).json({ error: 'Você não pode bloquear sua própria conta.' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, email: true, status: true },
    });

    return res.json({ message: `Usuário ${status === 'active' ? 'ativado' : 'bloqueado'} com sucesso!`, user });
  } catch (err: any) {
    console.error('Erro ao alterar status:', err);
    return res.status(500).json({ error: 'Erro ao alterar status do usuário.' });
  }
});

/**
 * DELETE /api/users/:id
 * Exclui um usuário do sistema
 */
userRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (id === req.user!.id) {
      return res.status(400).json({ error: 'Você não pode excluir sua própria conta de administrador.' });
    }

    await prisma.user.delete({ where: { id } });
    return res.json({ message: 'Usuário excluído com sucesso.' });
  } catch (err: any) {
    console.error('Erro ao excluir usuário:', err);
    return res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});
