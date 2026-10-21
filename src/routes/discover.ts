import { Response, Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import {
  getCommunityTrending,
  getOnTheAir,
  getRecommendationsForGroup,
  getSeriesPreview,
  getTrending,
} from '../lib/discovery';
import { getUserGroupId } from '../lib/groupMembership';
import { SeriesNotFoundError } from '../lib/tmdb';
import { isTrendingOrigin } from '../lib/tmdbDiscover';
import { authenticate } from '../middleware/auth';

const router = Router();

// O TMDB fora do ar não é erro nosso: a tela de busca mostra a estante com "tentar de novo".
async function respondFromTmdb(res: Response, load: () => Promise<unknown>) {
  try {
    res.json(await load());
  } catch (err) {
    if (err instanceof SeriesNotFoundError) {
      res.status(404).json({ error: 'Série não encontrada no TMDB' });
      return;
    }
    console.error('Descoberta: falha ao consultar o TMDB', err);
    res.status(502).json({ error: 'Não foi possível falar com o TMDB agora' });
  }
}

// As duas listas do "Explorar" aceitam `origin`: tudo (all, o padrão), um país (th, kr, jp)
// ou anime.
function readOrigin(origin: unknown, res: Response) {
  const value = origin ?? 'all';
  if (isTrendingOrigin(value)) return value;
  res.status(400).json({ error: 'origin deve ser all, th, kr, jp ou anime' });
  return null;
}

// "Em alta".
router.get(
  '/discover/trending',
  authenticate,
  asyncHandler(async (req, res) => {
    const origin = readOrigin(req.query.origin, res);
    if (origin) await respondFromTmdb(res, () => getTrending(origin));
  }),
);

// Séries com episódio saindo nos próximos 7 dias.
router.get(
  '/discover/on-the-air',
  authenticate,
  asyncHandler(async (req, res) => {
    const origin = readOrigin(req.query.origin, res);
    if (origin) await respondFromTmdb(res, () => getOnTheAir(origin));
  }),
);

// "Para vocês dois": sugestões a partir das séries da dupla.
router.get(
  '/discover/for-us',
  authenticate,
  asyncHandler(async (req, res) => {
    const groupId = await getUserGroupId(req.user!.id);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }
    await respondFromTmdb(res, () => getRecommendationsForGroup(groupId));
  }),
);

// O que mais duplas do WatchMate adicionaram no último mês (só com duplas suficientes).
router.get(
  '/discover/community',
  authenticate,
  asyncHandler(async (_req, res) => {
    res.json(await getCommunityTrending());
  }),
);

// A prévia de uma série antes de adicionar: o essencial, onde assistir e quantas duplas
// acompanham.
router.get(
  '/discover/series/:tmdbId',
  authenticate,
  asyncHandler(async (req, res) => {
    const tmdbId = Number(req.params.tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      res.status(400).json({ error: 'tmdbId deve ser um número inteiro' });
      return;
    }
    await respondFromTmdb(res, () => getSeriesPreview(tmdbId));
  }),
);

export default router;
