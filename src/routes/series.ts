import { ModoAcompanhamento, Prisma } from '@prisma/client';
import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { getUserGroupId } from '../lib/groupMembership';
import prisma from '../lib/prisma';
import {
  episodeKey,
  getGroupMembers,
  getWatchedEpisodeKeys,
  isSpoilerFor,
  loadProgressSummary,
  parseScope,
  resolveTargetUserIds,
  setEpisodesWatched,
} from '../lib/progress';
import {
  fetchSeasonFromTmdb,
  fetchSeriesFromTmdb,
  searchSeriesOnTmdb,
  SeriesNotFoundError,
  TmdbSeasonSummary,
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
    const { tmdbId, modo } = req.body as { tmdbId?: number; modo?: unknown };

    if (!Number.isInteger(tmdbId)) {
      res.status(400).json({ error: 'tmdbId é obrigatório e deve ser um número inteiro' });
      return;
    }

    if (modo !== undefined && !isModo(modo)) {
      res.status(400).json({ error: 'modo deve ser JUNTOS ou SEPARADOS' });
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
          modo,
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

router.patch(
  '/series/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const { modo } = req.body as { modo?: unknown };

    if (!isModo(modo)) {
      res.status(400).json({ error: 'modo é obrigatório e deve ser JUNTOS ou SEPARADOS' });
      return;
    }

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

    const updated = await prisma.serieAcompanhada.update({ where: { id }, data: { modo } });
    res.json(updated);
  }),
);

router.put(
  '/series/:seriesId/seasons/:season/episodes/:episode',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { seriesId, season, episode } = req.params;
    const {
      watched,
      scope: rawScope,
      juntos,
    } = req.body as { watched?: boolean; scope?: unknown; juntos?: unknown };

    if (typeof watched !== 'boolean') {
      res.status(400).json({ error: 'watched é obrigatório e deve ser um booleano' });
      return;
    }

    const scope = parseScope(rawScope);
    if (scope === null) {
      res.status(400).json({ error: "scope deve ser 'me' ou 'both'" });
      return;
    }

    if (juntos !== undefined && typeof juntos !== 'boolean') {
      res.status(400).json({ error: 'juntos deve ser um booleano' });
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

    const temporadas = series.temporadas as unknown as TmdbSeasonSummary[];
    const seasonInfo = temporadas.find((t) => t.numero === seasonNumber);
    if (!seasonInfo || episodeNumber < 1 || episodeNumber > seasonInfo.totalEpisodios) {
      res.status(404).json({ error: 'Episódio não encontrado' });
      return;
    }

    const members = await getGroupMembers(groupId);
    const targetIds = resolveTargetUserIds(
      series.modo,
      scope,
      userId,
      members.map((member) => member.id),
    );

    if (juntos === true && targetIds.length < 2) {
      res.status(400).json({ error: 'juntos só vale quando a marcação é para os dois' });
      return;
    }

    await setEpisodesWatched(seriesId, [{ temporada: seasonNumber, episodio: episodeNumber }], {
      watched,
      targetIds,
      markedBy: userId,
      together: juntos,
    });

    res.json(await loadProgressSummary(series));
  }),
);

router.put(
  '/series/:seriesId/seasons/:season/watched',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { seriesId, season } = req.params;
    const {
      watched,
      scope: rawScope,
      juntos,
    } = req.body as { watched?: boolean; scope?: unknown; juntos?: unknown };

    if (typeof watched !== 'boolean') {
      res.status(400).json({ error: 'watched é obrigatório e deve ser um booleano' });
      return;
    }

    const scope = parseScope(rawScope);
    if (scope === null) {
      res.status(400).json({ error: "scope deve ser 'me' ou 'both'" });
      return;
    }

    if (juntos !== undefined && typeof juntos !== 'boolean') {
      res.status(400).json({ error: 'juntos deve ser um booleano' });
      return;
    }

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

    const temporadas = series.temporadas as unknown as TmdbSeasonSummary[];
    const seasonInfo = temporadas.find((t) => t.numero === seasonNumber);
    if (!seasonInfo) {
      res.status(404).json({ error: 'Temporada não encontrada' });
      return;
    }

    const members = await getGroupMembers(groupId);
    const targetIds = resolveTargetUserIds(
      series.modo,
      scope,
      userId,
      members.map((member) => member.id),
    );

    if (juntos === true && targetIds.length < 2) {
      res.status(400).json({ error: 'juntos só vale quando a marcação é para os dois' });
      return;
    }

    const episodes = Array.from({ length: seasonInfo.totalEpisodios }, (_, i) => ({
      temporada: seasonNumber,
      episodio: i + 1,
    }));
    await setEpisodesWatched(seriesId, episodes, {
      watched,
      targetIds,
      markedBy: userId,
      together: juntos,
    });

    res.json(await loadProgressSummary(series));
  }),
);

// "Alcancei": marca para quem chamou todos os episódios que algum outro membro já viu
// e ele ainda não - para os dois voltarem a estar no mesmo ponto.
router.post(
  '/series/:seriesId/catch-up',
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

    const members = await getGroupMembers(groupId);
    const partnerIds = members.map((member) => member.id).filter((id) => id !== userId);
    const [mine, partners] = await Promise.all([
      getWatchedEpisodeKeys(seriesId, userId),
      prisma.progressoEpisodio.findMany({
        where: { serieAcompanhadaId: seriesId, usuarioId: { in: partnerIds } },
        select: { temporada: true, episodio: true },
      }),
    ]);

    const missing = new Map<string, { temporada: number; episodio: number }>();
    for (const row of partners) {
      const key = episodeKey(row.temporada, row.episodio);
      if (!mine.has(key)) missing.set(key, row);
    }

    await setEpisodesWatched(seriesId, [...missing.values()], {
      watched: true,
      targetIds: [userId],
      markedBy: userId,
    });

    res.json(await loadProgressSummary(series));
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

    const [reactions, watchedKeys] = await Promise.all([
      prisma.reacaoEpisodio.findMany({
        where: { serieAcompanhadaId: seriesId, temporada: seasonNumber, episodio: episodeNumber },
        include: { usuario: { select: { id: true, nome: true } } },
      }),
      getWatchedEpisodeKeys(seriesId, userId, seasonNumber),
    ]);

    res.json(reactions.map((reaction) => hideReactionSpoiler(reaction, userId, watchedKeys)));
  }),
);

router.get(
  '/series/:seriesId/seasons/:season/reactions',
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

    const [reactions, watchedKeys] = await Promise.all([
      prisma.reacaoEpisodio.findMany({
        where: { serieAcompanhadaId: seriesId, temporada: seasonNumber },
        include: { usuario: { select: { id: true, nome: true } } },
        orderBy: { episodio: 'asc' },
      }),
      getWatchedEpisodeKeys(seriesId, userId, seasonNumber),
    ]);

    res.json(reactions.map((reaction) => hideReactionSpoiler(reaction, userId, watchedKeys)));
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

    const [comments, watchedKeys] = await Promise.all([
      prisma.comentarioEpisodio.findMany({
        where: { serieAcompanhadaId: seriesId, temporada: seasonNumber, episodio: episodeNumber },
        include: { usuario: { select: { id: true, nome: true } } },
        orderBy: { criadoEm: 'asc' },
      }),
      getWatchedEpisodeKeys(seriesId, userId, seasonNumber),
    ]);

    res.json(
      comments.map((comment) =>
        isSpoilerFor(userId, watchedKeys, comment)
          ? { ...comment, texto: null, oculto: true }
          : { ...comment, oculto: false },
      ),
    );
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

    res.json(await loadProgressSummary(series));
  }),
);

// Reações/comentários do parceiro em episódios que você ainda não viu voltam sem o
// conteúdo (oculto: true) - o front mostra "assista para ver" em vez de dar spoiler.
function hideReactionSpoiler<T extends { usuarioId: string; temporada: number; episodio: number }>(
  reaction: T,
  viewerId: string,
  watchedKeys: Set<string>,
) {
  return isSpoilerFor(viewerId, watchedKeys, reaction)
    ? { ...reaction, emoji: null, oculto: true }
    : { ...reaction, oculto: false };
}

function isModo(value: unknown): value is ModoAcompanhamento {
  return value === ModoAcompanhamento.JUNTOS || value === ModoAcompanhamento.SEPARADOS;
}

export default router;
