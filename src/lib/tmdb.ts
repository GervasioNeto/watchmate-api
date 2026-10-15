const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export class SeriesNotFoundError extends Error {}

export interface TmdbSeasonSummary {
  numero: number;
  totalEpisodios: number;
}

// Um episódio de referência: o último que foi ao ar ou o próximo agendado. A data fica
// como o TMDB manda, só o dia ('2026-10-16'): virar Date a deixaria à meia-noite UTC,
// que no Brasil ainda é o dia anterior.
export interface TmdbEpisodeRef {
  temporada: number;
  episodio: number;
  dataExibicao: string | null;
}

// O que muda enquanto a série está no ar: é o que a lista renova de tempos em tempos
// (ver lib/seriesSnapshot.ts).
export interface TmdbSeriesSnapshot {
  posterPath: string | null;
  backdropPath: string | null;
  seasons: TmdbSeasonSummary[];
  notaMedia: number | null;
  status: string | null;
  ultimoEpisodioExibido: TmdbEpisodeRef | null;
  proximoEpisodio: TmdbEpisodeRef | null;
}

export interface TmdbSeriesDetails extends TmdbSeriesSnapshot {
  tmdbId: number;
  name: string;
  sinopse: string | null;
  generos: string[];
  primeiraExibicaoEm: Date | null;
  idiomaOriginal: string | null;
  nomeOriginal: string | null;
  englishName: string | null;
}

interface TmdbEpisodeToAir {
  season_number: number;
  episode_number: number;
  air_date: string | null;
}

interface TmdbTvResponse {
  name: string;
  poster_path: string | null;
  seasons: Array<{ season_number: number; episode_count: number }>;
  overview: string | null;
  vote_average: number | null;
  status: string | null;
  backdrop_path: string | null;
  genres: Array<{ id: number; name: string }>;
  first_air_date: string | null;
  original_language: string | null;
  original_name: string | null;
  last_episode_to_air: TmdbEpisodeToAir | null;
  next_episode_to_air: TmdbEpisodeToAir | null;
}

export interface TmdbSeriesSummary {
  tmdbId: number;
  name: string;
  posterPath: string | null;
  firstAirYear: number | null;
  englishName: string | null;
}

interface TmdbSearchResponse {
  results: Array<{
    id: number;
    name: string;
    poster_path: string | null;
    first_air_date: string;
  }>;
}

function tvUrl(tmdbId: number, language: string): URL {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY não configurada');
  }

  const url = new URL(`${TMDB_BASE_URL}/tv/${tmdbId}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', language);
  return url;
}

async function readTvResponse(tmdbId: number, response: Response): Promise<TmdbTvResponse> {
  if (response.status === 404) {
    throw new SeriesNotFoundError(`Série TMDB ${tmdbId} não encontrada`);
  }

  if (!response.ok) {
    throw new Error(`Erro ao consultar TMDB: ${response.status}`);
  }

  return (await response.json()) as TmdbTvResponse;
}

// Especiais (temporada 0) ficam de fora, como em `seasons`.
function toEpisodeRef(episode: TmdbEpisodeToAir | null): TmdbEpisodeRef | null {
  if (!episode || episode.season_number === 0) return null;
  return {
    temporada: episode.season_number,
    episodio: episode.episode_number,
    dataExibicao: episode.air_date || null,
  };
}

function toSnapshot(data: TmdbTvResponse): TmdbSeriesSnapshot {
  return {
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    seasons: data.seasons
      .filter((season) => season.season_number > 0)
      .map((season) => ({ numero: season.season_number, totalEpisodios: season.episode_count })),
    notaMedia: data.vote_average ?? null,
    status: data.status,
    ultimoEpisodioExibido: toEpisodeRef(data.last_episode_to_air),
    proximoEpisodio: toEpisodeRef(data.next_episode_to_air),
  };
}

export async function fetchSeriesFromTmdb(tmdbId: number): Promise<TmdbSeriesDetails> {
  const [response, englishResponse] = await Promise.all([
    fetch(tvUrl(tmdbId, 'pt-BR')),
    fetch(tvUrl(tmdbId, 'en-US')),
  ]);

  const data = await readTvResponse(tmdbId, response);
  const englishName = englishResponse.ok
    ? ((await englishResponse.json()) as { name: string }).name
    : null;

  return {
    ...toSnapshot(data),
    tmdbId,
    name: data.name,
    sinopse: data.overview || null,
    generos: data.genres.map((genre) => genre.name),
    primeiraExibicaoEm: data.first_air_date ? new Date(data.first_air_date) : null,
    idiomaOriginal: data.original_language,
    nomeOriginal: data.original_name,
    englishName,
  };
}

// Só o que muda com o tempo, numa consulta só (o nome em inglês não muda).
export async function fetchSeriesSnapshot(
  tmdbId: number,
  signal?: AbortSignal,
): Promise<TmdbSeriesSnapshot> {
  const response = await fetch(tvUrl(tmdbId, 'pt-BR'), { signal });
  return toSnapshot(await readTvResponse(tmdbId, response));
}

export interface TmdbEpisodeDetails {
  numero: number;
  titulo: string;
  resumo: string | null;
  dataExibicao: Date | null;
  duracaoMinutos: number | null;
  imagem: string | null;
}

interface TmdbSeasonResponse {
  episodes: Array<{
    episode_number: number;
    name: string;
    overview: string | null;
    air_date: string | null;
    runtime: number | null;
    still_path: string | null;
  }>;
}

export async function fetchSeasonFromTmdb(
  tmdbId: number,
  seasonNumber: number,
): Promise<TmdbEpisodeDetails[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY não configurada');
  }

  const url = new URL(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${seasonNumber}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', 'pt-BR');

  const response = await fetch(url);

  if (response.status === 404) {
    throw new SeriesNotFoundError(`Temporada ${seasonNumber} da série TMDB ${tmdbId} não encontrada`);
  }

  if (!response.ok) {
    throw new Error(`Erro ao consultar TMDB: ${response.status}`);
  }

  const data = (await response.json()) as TmdbSeasonResponse;

  return data.episodes.map((episode) => ({
    numero: episode.episode_number,
    titulo: episode.name,
    resumo: episode.overview || null,
    dataExibicao: episode.air_date ? new Date(episode.air_date) : null,
    duracaoMinutos: episode.runtime,
    imagem: episode.still_path,
  }));
}

export async function searchSeriesOnTmdb(query: string): Promise<TmdbSeriesSummary[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY não configurada');
  }

  const url = new URL(`${TMDB_BASE_URL}/search/tv`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('query', query);

  const englishUrl = new URL(`${TMDB_BASE_URL}/search/tv`);
  englishUrl.searchParams.set('api_key', apiKey);
  englishUrl.searchParams.set('language', 'en-US');
  englishUrl.searchParams.set('query', query);

  const [response, englishResponse] = await Promise.all([fetch(url), fetch(englishUrl)]);

  if (!response.ok) {
    throw new Error(`Erro ao consultar TMDB: ${response.status}`);
  }

  const data = (await response.json()) as TmdbSearchResponse;
  const englishNamesById = new Map<number, string>();
  if (englishResponse.ok) {
    const englishData = (await englishResponse.json()) as TmdbSearchResponse;
    for (const item of englishData.results) {
      englishNamesById.set(item.id, item.name);
    }
  }

  return data.results.map((item) => ({
    tmdbId: item.id,
    name: item.name,
    posterPath: item.poster_path,
    firstAirYear: item.first_air_date ? Number(item.first_air_date.slice(0, 4)) : null,
    englishName: englishNamesById.get(item.id) ?? null,
  }));
}
