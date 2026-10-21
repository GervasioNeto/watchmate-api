import prisma from './prisma';
import { readableName, type TmdbSeriesSummary } from './tmdb';
import {
  fetchOnTheAir,
  fetchRecommendations,
  fetchSeriesPreview,
  fetchTrending,
  type TmdbSeriesPreview,
  type TrendingOrigin,
} from './tmdbDiscover';
import { TtlCache } from './ttlCache';

// O que a tela de busca mostra antes de a pessoa digitar (ver routes/discover.ts). As listas
// do TMDB valem para todo mundo e mudam devagar, então ficam em cache: com muita gente
// abrindo a busca, o TMDB é consultado poucas vezes por dia.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const listCache = new TtlCache<TmdbSeriesSummary[]>(6 * HOUR);
const recommendationCache = new TtlCache<TmdbSeriesSummary[]>(24 * HOUR);
const previewCache = new TtlCache<TmdbSeriesPreview>(12 * HOUR);
const communityCache = new TtlCache<CommunitySeries[]>(30 * MINUTE);

export function getTrending(origin: TrendingOrigin) {
  return listCache.get(`trending:${origin}`, () => fetchTrending(origin));
}

export function getOnTheAir(origin: TrendingOrigin) {
  return listCache.get(`on-the-air:${origin}`, () => fetchOnTheAir(origin));
}

// ---------- "Para vocês dois" ----------

// Quantas séries da lista servem de ponto de partida, e quantas sugestões voltam.
const MAX_SEEDS = 5;
const MAX_SUGGESTIONS = 20;

export interface GroupRecommendations {
  // As séries da dupla de onde as sugestões saíram, da que mais pesou para a que menos.
  basedOn: string[];
  items: TmdbSeriesSummary[];
}

// Sugestões para a dupla: as recomendações do TMDB para as séries que vocês mais assistiram
// (as mais recentes desempatam), somadas. Uma série recomendada a partir de várias das suas
// sobe; as que já estão na lista ficam de fora.
export async function getRecommendationsForGroup(groupId: string): Promise<GroupRecommendations> {
  const series = await prisma.serieAcompanhada.findMany({
    where: { grupoId: groupId },
    select: { id: true, tmdbId: true, nome: true, englishName: true, adicionadoEm: true },
  });
  if (series.length === 0) return { basedOn: [], items: [] };

  const watched = await prisma.progressoEpisodio.groupBy({
    by: ['serieAcompanhadaId'],
    where: { serieAcompanhada: { grupoId: groupId } },
    _count: { _all: true },
  });
  const watchCount = new Map(watched.map((row) => [row.serieAcompanhadaId, row._count._all]));

  const seeds = [...series]
    .sort(
      (a, b) =>
        (watchCount.get(b.id) ?? 0) - (watchCount.get(a.id) ?? 0) ||
        b.adicionadoEm.getTime() - a.adicionadoEm.getTime(),
    )
    .slice(0, MAX_SEEDS);

  // Uma série que falhar no TMDB só fica sem contribuir; as outras seguem.
  const lists = await Promise.all(
    seeds.map((seed) =>
      recommendationCache
        .get(String(seed.tmdbId), () => fetchRecommendations(seed.tmdbId))
        .catch(() => [] as TmdbSeriesSummary[]),
    ),
  );

  const tracked = new Set(series.map((item) => item.tmdbId));
  const scores = new Map<number, { item: TmdbSeriesSummary; score: number }>();
  lists.forEach((list, seedIndex) => {
    list.forEach((item, rank) => {
      if (tracked.has(item.tmdbId)) return;
      // Pesa mais: a semente que vocês mais viram, e o topo da lista de cada uma.
      const weight = (1 - seedIndex * 0.12) * (1 - (rank / list.length) * 0.5);
      const current = scores.get(item.tmdbId);
      scores.set(item.tmdbId, { item, score: (current?.score ?? 0) + weight });
    });
  });

  return {
    basedOn: seeds
      .filter((_, index) => lists[index].length > 0)
      .map((seed) => readableName(seed.nome, seed.englishName)),
    items: [...scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SUGGESTIONS)
      .map((entry) => entry.item),
  };
}

// ---------- O que as duplas do WatchMate estão salvando ----------

// Uma série só aparece quando várias duplas a salvaram: com poucas pessoas no app, uma série
// que só um casal adicionou entregaria a lista dele. Dá para baixar para testar
// (COMMUNITY_MIN_GROUPS=1), nunca em produção.
const COMMUNITY_MIN_GROUPS = Math.max(1, Number(process.env.COMMUNITY_MIN_GROUPS) || 3);
const COMMUNITY_WINDOW_DAYS = 30;
const MAX_COMMUNITY = 20;

export interface CommunitySeries extends TmdbSeriesSummary {
  // Quantas duplas adicionaram a série nos últimos 30 dias.
  groupCount: number;
}

async function loadCommunityTrending(): Promise<CommunitySeries[]> {
  const since = new Date(Date.now() - COMMUNITY_WINDOW_DAYS * 24 * HOUR);
  // Uma linha por dupla e série (o par é único), então contar linhas é contar duplas.
  const counts = await prisma.serieAcompanhada.groupBy({
    by: ['tmdbId'],
    where: { adicionadoEm: { gte: since } },
    _count: { tmdbId: true },
    having: { tmdbId: { _count: { gte: COMMUNITY_MIN_GROUPS } } },
    orderBy: { _count: { tmdbId: 'desc' } },
    take: MAX_COMMUNITY,
  });
  if (counts.length === 0) return [];

  const rows = await prisma.serieAcompanhada.findMany({
    where: { tmdbId: { in: counts.map((row) => row.tmdbId) } },
    distinct: ['tmdbId'],
    orderBy: { adicionadoEm: 'desc' },
    select: {
      tmdbId: true,
      nome: true,
      englishName: true,
      posterPath: true,
      primeiraExibicaoEm: true,
    },
  });
  const byTmdbId = new Map(rows.map((row) => [row.tmdbId, row]));

  return counts.flatMap(({ tmdbId, _count }) => {
    const row = byTmdbId.get(tmdbId);
    if (!row) return [];
    return [
      {
        tmdbId,
        name: readableName(row.nome, row.englishName),
        posterPath: row.posterPath,
        firstAirYear: row.primeiraExibicaoEm?.getFullYear() ?? null,
        englishName: row.englishName,
        groupCount: _count.tmdbId,
      },
    ];
  });
}

export function getCommunityTrending() {
  return communityCache.get('community', loadCommunityTrending);
}

// ---------- A prévia de uma série ----------

export interface SeriesPreview extends TmdbSeriesPreview {
  // Quantas duplas do WatchMate acompanham a série, quando são o bastante para não expor
  // ninguém (a mesma regra da lista acima). Null abaixo disso.
  couplesTracking: number | null;
}

export async function getSeriesPreview(tmdbId: number): Promise<SeriesPreview> {
  const [preview, couples] = await Promise.all([
    previewCache.get(String(tmdbId), () => fetchSeriesPreview(tmdbId)),
    prisma.serieAcompanhada.count({ where: { tmdbId } }),
  ]);
  return { ...preview, couplesTracking: couples >= COMMUNITY_MIN_GROUPS ? couples : null };
}
