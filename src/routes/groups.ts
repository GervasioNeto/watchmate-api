import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { generateInviteCode } from '../lib/inviteCode';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

const MAX_CODE_ATTEMPTS = 5;

router.post(
  '/groups',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const existingMembership = await prisma.membroDoGrupo.findUnique({
      where: { usuarioId: userId },
    });
    if (existingMembership) {
      res.status(409).json({ error: 'Você já faz parte de um grupo' });
      return;
    }

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      try {
        const group = await prisma.grupo.create({
          data: {
            codigoConvite: generateInviteCode(),
            membros: { create: { usuarioId: userId } },
          },
          include: { membros: true },
        });
        res.status(201).json(group);
        return;
      } catch (err) {
        const isCodeCollision =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          (err.meta?.target as string[] | undefined)?.includes('codigo_convite');

        if (!isCodeCollision) {
          throw err;
        }
      }
    }

    res.status(500).json({ error: 'Não foi possível gerar um código de convite único' });
  }),
);

router.post(
  '/groups/join',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { codigoConvite } = req.body as { codigoConvite?: string };

    if (!codigoConvite) {
      res.status(400).json({ error: 'codigoConvite é obrigatório' });
      return;
    }

    const existingMembership = await prisma.membroDoGrupo.findUnique({
      where: { usuarioId: userId },
    });
    if (existingMembership) {
      res.status(409).json({ error: 'Você já faz parte de um grupo' });
      return;
    }

    const group = await prisma.grupo.findUnique({
      where: { codigoConvite: codigoConvite.toUpperCase() },
      include: { membros: true },
    });

    if (!group) {
      res.status(404).json({ error: 'Grupo não encontrado' });
      return;
    }

    if (group.membros.length >= 2) {
      res.status(409).json({ error: 'Grupo já está cheio' });
      return;
    }

    try {
      await prisma.membroDoGrupo.create({ data: { grupoId: group.id, usuarioId: userId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        res.status(409).json({ error: 'Você já faz parte de um grupo' });
        return;
      }
      throw err;
    }

    const updatedGroup = await prisma.grupo.findUnique({
      where: { id: group.id },
      include: { membros: true },
    });

    res.status(201).json(updatedGroup);
  }),
);

router.get(
  '/groups/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const membership = await prisma.membroDoGrupo.findUnique({
      where: { usuarioId: userId },
      include: { grupo: { include: { membros: true } } },
    });

    if (!membership) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    res.json(membership.grupo);
  }),
);

export default router;
