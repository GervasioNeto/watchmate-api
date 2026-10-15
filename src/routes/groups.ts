import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { generateInviteCode } from '../lib/inviteCode';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

const MAX_CODE_ATTEMPTS = 5;

// Recado para o par: uma frase curta, sobrescrita a cada envio (não é um chat).
const MAX_RECADO = 80;

type RecadoData = { recado: string; recadoEm: Date } | { recado: null; recadoEm: null };

// Atualiza o recado de quem chamou. Devolve null se a pessoa não está em nenhum grupo.
async function saveOwnNote(userId: string, data: RecadoData) {
  try {
    return await prisma.membroDoGrupo.update({ where: { usuarioId: userId }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return null;
    }
    throw err;
  }
}

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

router.patch(
  '/groups/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { nome } = req.body as { nome?: string };

    if (typeof nome !== 'string' || nome.trim().length === 0) {
      res.status(400).json({ error: 'nome é obrigatório' });
      return;
    }

    const membership = await prisma.membroDoGrupo.findUnique({ where: { usuarioId: userId } });
    if (!membership) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    const group = await prisma.grupo.update({
      where: { id: membership.grupoId },
      data: { nome: nome.trim() },
      include: { membros: true },
    });

    res.json(group);
  }),
);

router.put(
  '/groups/me/note',
  authenticate,
  asyncHandler(async (req, res) => {
    const { texto } = req.body as { texto?: unknown };

    if (typeof texto !== 'string') {
      res.status(400).json({ error: 'texto é obrigatório' });
      return;
    }

    // O recado aparece numa linha só: quebras e espaços repetidos viram um espaço.
    const recado = texto.replace(/\s+/g, ' ').trim();
    if (recado.length === 0 || recado.length > MAX_RECADO) {
      res.status(400).json({ error: `texto deve ter entre 1 e ${MAX_RECADO} caracteres` });
      return;
    }

    const membership = await saveOwnNote(req.user!.id, { recado, recadoEm: new Date() });
    if (!membership) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    res.json(membership);
  }),
);

router.delete(
  '/groups/me/note',
  authenticate,
  asyncHandler(async (req, res) => {
    const membership = await saveOwnNote(req.user!.id, { recado: null, recadoEm: null });
    if (!membership) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    res.status(204).end();
  }),
);

export default router;
