import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

const ESTILOS_AVATAR = ['fun-emoji'] as const;

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.usuario.findUniqueOrThrow({
      where: { id: req.user!.id },
      include: {
        membroDoGrupo: {
          include: { grupo: { include: { membros: { include: { usuario: true } } } } },
        },
      },
    });
    res.json(user);
  }),
);

router.patch(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const { nome } = req.body as { nome?: string };

    if (typeof nome !== 'string' || nome.trim().length === 0) {
      res.status(400).json({ error: 'nome é obrigatório' });
      return;
    }

    const user = await prisma.usuario.update({
      where: { id: req.user!.id },
      data: { nome: nome.trim() },
    });
    res.json(user);
  }),
);

router.patch(
  '/me/avatar',
  authenticate,
  asyncHandler(async (req, res) => {
    const { estilo, semente } = req.body as { estilo?: string; semente?: string };

    if (!ESTILOS_AVATAR.includes(estilo as (typeof ESTILOS_AVATAR)[number])) {
      res.status(400).json({ error: 'Estilo de avatar inválido' });
      return;
    }

    if (typeof semente !== 'string' || semente.length < 1 || semente.length > 40) {
      res.status(400).json({ error: 'Semente do avatar inválida' });
      return;
    }

    const user = await prisma.usuario.update({
      where: { id: req.user!.id },
      data: { avatarEstilo: estilo, avatarSemente: semente },
    });
    res.json(user);
  }),
);

export default router;
