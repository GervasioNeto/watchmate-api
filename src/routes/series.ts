import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { getUserGroupId } from '../lib/groupMembership';
import prisma from '../lib/prisma';
import {
  fetchSeasonFromTmdb,
  fetchSeriesFromTmdb,
  searchSeriesOnTmdb,
  SeriesNotFoundError,
} from '../lib/tmdb';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get(
  '/series/search',
  authenticate,
  asyncHandler(async (req, res) => {
    const { q } = req.query;

    if (typeof q !== 'string' || q.trim().length === 0) {
      res.status(400).json({ error: 'q é obrigatório' });
      return;
    }

    const results = await searchSeriesOnTmdb(q.trim());
    res.json(results);
  }),
);

router.post(
  '/series',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { tmdbId } = req.body as { tmdbId?: number };

    if (!Number.isInteger(tmdbId)) {
      res.status(400).json({ error: 'tmdbId é obrigatório e deve ser um número inteiro' });
      return;
    }

    const groupId = await getUserGroupId(userId);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    let details;
    try {
      details = await fetchSeriesFromTmdb(tmdbId as number);
    } catch (err) {
      if (err instanceof SeriesNotFoundError) {
        res.status(404).json({ error: 'Série não encontrada no TMDB' });
        return;
      }
      throw err;
    }

    try {
      const series = await prisma.serieAcompanhada.create({
        data: {
          grupoId: groupId,
          tmdbId: details.tmdbId,
          nome: details.name,
          posterPath: details.posterPath,
          temporadas: details.seasons as unknown as Prisma.InputJsonValue,
          sinopse: details.sinopse,
          notaMedia: details.notaMedia,
          status: details.status,
          backdropPath: details.backdropPath,
          generos: details.generos,
          primeiraExibicaoEm: details.primeiraExibicaoEm,
          idiomaOriginal: details.idiomaOriginal,
          nomeOriginal: details.nomeOriginal,
          englishName: details.englishName,
          adicionadoPor: userId,
        },
      });
      res.status(201).json(series);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        res.status(409).json({ error: 'Essa série já está sendo acompanhada pelo grupo' });
        return;
      }
      throw err;
    }
  }),
);

router.get(
  '/series',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const groupId = await getUserGroupId(userId);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    const series = await prisma.serieAcompanhada.findMany({
      where: { grupoId: groupId },
      orderBy: { adicionadoEm: 'desc' },
    });

    res.json(series);
  }),
);

router.delete(
  '/series/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const groupId = await getUserGroupId(userId);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    const series = await prisma.serieAcompanhada.findUnique({ where: { id } });
    if (!series || series.grupoId !== groupId) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }

    await prisma.serieAcompanhada.delete({ where: { id } });
    res.status(204).send();
  }),
);

router.put(
  '/series/:seriesId/seasons/:season/episodes/:episode',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { seriesId, season, episode } = req.params;
    const { watched } = req.body as { watched?: boolean };

    if (typeof watched !== 'boolean') {
      res.status(400).json({ error: 'watched é obrigatório e deve ser um booleano' });
      return;
    }

    const seasonNumber = Number(season);
    const episodeNumber = Number(episode);
    if (!Number.isInteger(seasonNumber) || !Number.isInteger(episodeNumber)) {
      res.status(400).json({ error: 'season e episode devem ser números inteiros' });
      return;
    }

    const groupId = await getUserGroupId(userId);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    const series = await prisma.serieAcompanhada.findUnique({ where: { id: seriesId } });
    if (!series || series.grupoId !== groupId) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }

    const progress = await prisma.progressoEpisodio.upsert({
      where: {
        serieAcompanhadaId_temporada_episodio: {
          serieAcompanhadaId: seriesId,
          temporada: seasonNumber,
          episodio: episodeNumber,
        },
      },
      update: {
        assistidoEm: watched ? new Date() : null,
        marcadoPor: watched ? userId : null,
      },
      create: {
        serieAcompanhadaId: seriesId,
        temporada: seasonNumber,
        episodio: episodeNumber,
        assistidoEm: watched ? new Date() : null,
        marcadoPor: watched ? userId : null,
      },
    });

    res.json(progress);
  }),
);

router.get(
  '/series/:seriesId/seasons/:season/episodes',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { seriesId, season } = req.params;

    const seasonNumber = Number(season);
    if (!Number.isInteger(seasonNumber)) {
      res.status(400).json({ error: 'season deve ser um número inteiro' });
      return;
    }

    const groupId = await getUserGroupId(userId);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    const series = await prisma.serieAcompanhada.findUnique({ where: { id: seriesId } });
    if (!series || series.grupoId !== groupId) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }

    try {
      const episodes = await fetchSeasonFromTmdb(series.tmdbId, seasonNumber);
      res.json(episodes);
    } catch (err) {
      if (err instanceof SeriesNotFoundError) {
        res.status(404).json({ error: 'Temporada não encontrada no TMDB' });
        return;
      }
      throw err;
    }
  }),
);

router.put(
  '/series/:seriesId/seasons/:season/episodes/:episode/reaction',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { seriesId, season, episode } = req.params;
    const { emoji } = req.body as { emoji?: string };

    if (typeof emoji !== 'string' || emoji.trim().length === 0) {
      res.status(400).json({ error: 'emoji é obrigatório' });
      return;
    }

    const seasonNumber = Number(season);
    const episodeNumber = Number(episode);
    if (!Number.isInteger(seasonNumber) || !Number.isInteger(episodeNumber)) {
      res.status(400).json({ error: 'season e episode devem ser números inteiros' });
      return;
    }

    const groupId = await getUserGroupId(userId);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    const series = await prisma.serieAcompanhada.findUnique({ where: { id: seriesId } });
    if (!series || series.grupoId !== groupId) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }

    const reaction = await prisma.reacaoEpisodio.upsert({
      where: {
        serieAcompanhadaId_temporada_episodio_usuarioId: {
          serieAcompanhadaId: seriesId,
          temporada: seasonNumber,
          episodio: episodeNumber,
          usuarioId: userId,
        },
      },
      update: { emoji: emoji.trim() },
      create: {
        serieAcompanhadaId: seriesId,
        temporada: seasonNumber,
        episodio: episodeNumber,
        usuarioId: userId,
        emoji: emoji.trim(),
      },
    });

    res.json(reaction);
  }),
);

router.get(
  '/series/:seriesId/seasons/:season/episodes/:episode/reactions',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { seriesId, season, episode } = req.params;

    const seasonNumber = Number(season);
    const episodeNumber = Number(episode);
    if (!Number.isInteger(seasonNumber) || !Number.isInteger(episodeNumber)) {
      res.status(400).json({ error: 'season e episode devem ser números inteiros' });
      return;
    }

    const groupId = await getUserGroupId(userId);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    const series = await prisma.serieAcompanhada.findUnique({ where: { id: seriesId } });
    if (!series || series.grupoId !== groupId) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }

    const reactions = await prisma.reacaoEpisodio.findMany({
      where: { serieAcompanhadaId: seriesId, temporada: seasonNumber, episodio: episodeNumber },
      include: { usuario: { select: { id: true, nome: true } } },
    });

    res.json(reactions);
  }),
);

router.post(
  '/series/:seriesId/seasons/:season/episodes/:episode/comments',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { seriesId, season, episode } = req.params;
    const { texto } = req.body as { texto?: string };

    if (typeof texto !== 'string' || texto.trim().length === 0) {
      res.status(400).json({ error: 'texto é obrigatório' });
      return;
    }

    const seasonNumber = Number(season);
    const episodeNumber = Number(episode);
    if (!Number.isInteger(seasonNumber) || !Number.isInteger(episodeNumber)) {
      res.status(400).json({ error: 'season e episode devem ser números inteiros' });
      return;
    }

    const groupId = await getUserGroupId(userId);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    const series = await prisma.serieAcompanhada.findUnique({ where: { id: seriesId } });
    if (!series || series.grupoId !== groupId) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }

    const comment = await prisma.comentarioEpisodio.create({
      data: {
        serieAcompanhadaId: seriesId,
        temporada: seasonNumber,
        episodio: episodeNumber,
        usuarioId: userId,
        texto: texto.trim(),
      },
      include: { usuario: { select: { id: true, nome: true } } },
    });

    res.status(201).json(comment);
  }),
);

router.get(
  '/series/:seriesId/seasons/:season/episodes/:episode/comments',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { seriesId, season, episode } = req.params;

    const seasonNumber = Number(season);
    const episodeNumber = Number(episode);
    if (!Number.isInteger(seasonNumber) || !Number.isInteger(episodeNumber)) {
      res.status(400).json({ error: 'season e episode devem ser números inteiros' });
      return;
    }

    const groupId = await getUserGroupId(userId);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    const series = await prisma.serieAcompanhada.findUnique({ where: { id: seriesId } });
    if (!series || series.grupoId !== groupId) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }

    const comments = await prisma.comentarioEpisodio.findMany({
      where: { serieAcompanhadaId: seriesId, temporada: seasonNumber, episodio: episodeNumber },
      include: { usuario: { select: { id: true, nome: true } } },
      orderBy: { criadoEm: 'asc' },
    });

    res.json(comments);
  }),
);

router.delete(
  '/series/:seriesId/seasons/:season/episodes/:episode/comments/:commentId',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { seriesId, commentId } = req.params;

    const groupId = await getUserGroupId(userId);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    const series = await prisma.serieAcompanhada.findUnique({ where: { id: seriesId } });
    if (!series || series.grupoId !== groupId) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }

    const comment = await prisma.comentarioEpisodio.findUnique({ where: { id: commentId } });
    if (!comment || comment.serieAcompanhadaId !== seriesId) {
      res.status(404).json({ error: 'Comentário não encontrado' });
      return;
    }

    if (comment.usuarioId !== userId) {
      res.status(403).json({ error: 'Você só pode apagar seus próprios comentários' });
      return;
    }

    await prisma.comentarioEpisodio.delete({ where: { id: commentId } });
    res.status(204).send();
  }),
);

router.get(
  '/series/:seriesId/progress',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { seriesId } = req.params;

    const groupId = await getUserGroupId(userId);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    const series = await prisma.serieAcompanhada.findUnique({ where: { id: seriesId } });
    if (!series || series.grupoId !== groupId) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }

    const progress = await prisma.progressoEpisodio.findMany({
      where: { serieAcompanhadaId: seriesId },
      orderBy: [{ temporada: 'asc' }, { episodio: 'asc' }],
    });

    res.json(progress);
  }),
);

export default router;
