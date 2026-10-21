import { readableName, SeriesNotFoundError, tmdbUrl, type TmdbSeriesSummary } from './tmdb';

// As listas da busca (ver lib/discovery.ts, que guarda em cache): o que está em alta, o que
// está no ar, recomendações a partir de uma série e a prévia de uma série antes de adicionar.

// De onde vêm as listas do "Explorar": tudo, ou um país (a comunidade vê muita série
// asiática). Vale para o "Em alta" e o "No ar esta semana".
export const TRENDING_ORIGINS = ['all', 'th', 'kr', 'jp', 'anime'] as const;
export type TrendingOrigin = (typeof TRENDING_ORIGINS)[number];

export function isTrendingOrigin(value: unknown): value is TrendingOrigin {
  return typeof value === 'string' && (TRENDING_ORIGINS as readonly string[]).includes(value);
}

const ANIMATION = 16;
// Não são séries para acompanhar episódio a episódio: jornal, reality e entrevista.
const NOT_SERIES = [10763, 10764, 10767];
// "Em alta" é o que é novo: sem isso, a popularidade traz programas de décadas ainda no ar.
const TRENDING_MAX_AGE_YEARS = 3;

// O filtro de cada origem no /discover do TMDB. Gêneros separados por "|" querem dizer
// "qualquer um deles" (com vírgula seria "todos ao mesmo tempo").
function originFilter(origin: Exclude<TrendingOrigin, 'all'>): Record<string, string> {
  const notSeries = NOT_SERIES.join('|');
  switch (origin) {
    case 'th':
      return { with_origin_country: 'TH', without_genres: notSeries };
    case 'kr':
    case 'jp':
      return {
        with_origin_country: origin.toUpperCase(),
        without_genres: `${notSeries}|${ANIMATION}`,
      };
    case 'anime':
      return {
        with_origin_country: 'JP',
        with_genres: String(ANIMATION),
        without_genres: notSeries,
      };
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

interface TmdbListItem {
  id: number;
  name: string;
  poster_path: string | null;
  first_air_date?: string;
  genre_ids?: number[];
}

interface TmdbListResponse {
  results: TmdbListItem[];
}

function yearOf(date: string | null | undefined): number | null {
  return date ? Number(date.slice(0, 4)) : null;
}

// Uma lista do TMDB em português, com o nome em inglês ao lado (para séries que só têm o
// nome no alfabeto original). Fica de fora o que não tem pôster e o que não é série.
async function fetchSeriesList(
  path: string,
  params: Record<string, string> = {},
  excludeGenres: number[] = [],
): Promise<TmdbSeriesSummary[]> {
  const [response, englishResponse] = await Promise.all([
    fetch(tmdbUrl(path, 'pt-BR', params)),
    fetch(tmdbUrl(path, 'en-US', params)),
  ]);
  if (response.status === 404) throw new SeriesNotFoundError(`TMDB ${path} não encontrado`);
  if (!response.ok) throw new Error(`Erro ao consultar TMDB ${path}: ${response.status}`);

  const data = (await response.json()) as TmdbListResponse;
  const englishNames = new Map<number, string>();
  if (englishResponse.ok) {
    const english = (await englishResponse.json()) as TmdbListResponse;
    for (const item of english.results) englishNames.set(item.id, item.name);
  }

  const excluded = [...NOT_SERIES, ...excludeGenres];
  return data.results
    .filter((item) => item.poster_path && !item.genre_ids?.some((id) => excluded.includes(id)))
    .map((item) => {
      const englishName = englishNames.get(item.id) ?? null;
      return {
        tmdbId: item.id,
        name: readableName(item.name, englishName),
        posterPath: item.poster_path,
        firstAirYear: yearOf(item.first_air_date),
        englishName,
      };
    });
}

// Os gêneros que a lista tira de novo depois de chegar, por garantia (o filtro do TMDB é o
// principal).
function excludedAfter(origin: TrendingOrigin): number[] {
  return origin === 'kr' || origin === 'jp' ? [ANIMATION] : [];
}

// O que está bombando: a semana do TMDB para "tudo"; por país, as séries novas (dos últimos
// anos) mais populares agora, com um mínimo de votos para tirar cadastros vazios.
export function fetchTrending(origin: TrendingOrigin): Promise<TmdbSeriesSummary[]> {
  if (origin === 'all') return fetchSeriesList('/trending/tv/week');
  const since = new Date();
  since.setFullYear(since.getFullYear() - TRENDING_MAX_AGE_YEARS);
  return fetchSeriesList(
    '/discover/tv',
    {
      sort_by: 'popularity.desc',
      'vote_count.gte': '3',
      'first_air_date.gte': isoDate(since),
      ...originFilter(origin),
    },
    excludedAfter(origin),
  );
}

// Séries com episódio saindo nos próximos 7 dias, as mais populares primeiro, da mesma
// origem do "Em alta".
export function fetchOnTheAir(origin: TrendingOrigin): Promise<TmdbSeriesSummary[]> {
  return fetchSeriesList(
    '/discover/tv',
    {
      sort_by: 'popularity.desc',
      'air_date.gte': isoDate(new Date()),
      'air_date.lte': isoDate(daysFromNow(7)),
      ...(origin === 'all' ? { without_genres: NOT_SERIES.join('|') } : originFilter(origin)),
    },
    excludedAfter(origin),
  );
}

// "Quem viu esta também viu", na ordem de relevância do TMDB.
export function fetchRecommendations(tmdbId: number): Promise<TmdbSeriesSummary[]> {
  return fetchSeriesList(`/tv/${tmdbId}/recommendations`);
}

export interface StreamingProvider {
  id: number;
  name: string;
  logoPath: string;
}

// O que a prévia mostra antes de adicionar: o essencial da série e onde assistir no Brasil.
export interface TmdbSeriesPreview {
  tmdbId: number;
  name: string;
  originalName: string | null;
  englishName: string | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  firstAirYear: number | null;
  lastAirYear: number | null;
  status: string | null;
  genres: string[];
  voteAverage: number | null;
  seasonsCount: number;
  episodesCount: number;
  // Onde assistir no Brasil, pelos dados do JustWatch que o TMDB repassa: assinatura,
  // grátis e grátis com anúncios. `link` é a página do TMDB com todas as opções.
  watch: { link: string | null; providers: StreamingProvider[] };
}

interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

interface TmdbPreviewResponse {
  name: string;
  original_name: string | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string | null;
  last_air_date: string | null;
  status: string | null;
  genres: Array<{ name: string }>;
  vote_average: number | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  'watch/providers'?: {
    results?: Record<
      string,
      { link?: string; flatrate?: TmdbProvider[]; free?: TmdbProvider[]; ads?: TmdbProvider[] }
    >;
  };
}

type ProvidersByRegion = NonNullable<TmdbPreviewResponse['watch/providers']>['results'];

// Assinatura, grátis e com anúncios no Brasil, sem repetir o mesmo serviço, na ordem do
// JustWatch.
function streamingInBrazil(results: ProvidersByRegion) {
  const br = results?.BR;
  const byId = new Map<number, TmdbProvider>();
  for (const provider of [...(br?.flatrate ?? []), ...(br?.free ?? []), ...(br?.ads ?? [])]) {
    if (!byId.has(provider.provider_id)) byId.set(provider.provider_id, provider);
  }
  const providers = [...byId.values()].sort((a, b) => a.display_priority - b.display_priority);
  // Planos do mesmo serviço ("Netflix" e "Netflix Standard with Ads") viram um só.
  const isPlanOfAnother = (provider: TmdbProvider) =>
    providers.some(
      (other) => other !== provider && provider.provider_name.startsWith(`${other.provider_name} `),
    );
  return {
    link: br?.link ?? null,
    providers: providers
      .filter((provider) => !isPlanOfAnother(provider))
      .map((provider) => ({
        id: provider.provider_id,
        name: provider.provider_name,
        logoPath: provider.logo_path,
      })),
  };
}

export async function fetchSeriesPreview(tmdbId: number): Promise<TmdbSeriesPreview> {
  const [response, englishResponse] = await Promise.all([
    fetch(tmdbUrl(`/tv/${tmdbId}`, 'pt-BR', { append_to_response: 'watch/providers' })),
    fetch(tmdbUrl(`/tv/${tmdbId}`, 'en-US')),
  ]);
  if (response.status === 404) throw new SeriesNotFoundError(`Série TMDB ${tmdbId} não encontrada`);
  if (!response.ok) throw new Error(`Erro ao consultar TMDB: ${response.status}`);

  const data = (await response.json()) as TmdbPreviewResponse;
  const english = englishResponse.ok
    ? ((await englishResponse.json()) as { name: string; overview: string | null })
    : null;
  const englishName = english?.name ?? null;

  return {
    tmdbId,
    name: readableName(data.name, englishName),
    originalName: data.original_name,
    englishName,
    // Sem sinopse em português (comum em série asiática), vale a em inglês.
    overview: data.overview || english?.overview || null,
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    firstAirYear: yearOf(data.first_air_date),
    lastAirYear: yearOf(data.last_air_date),
    status: data.status,
    genres: data.genres.map((genre) => genre.name),
    voteAverage: data.vote_average || null,
    seasonsCount: data.number_of_seasons ?? 0,
    episodesCount: data.number_of_episodes ?? 0,
    watch: streamingInBrazil(data['watch/providers']?.results),
  };
}
