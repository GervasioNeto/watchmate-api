const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export class SeriesNotFoundError extends Error {}

export interface TmdbSeasonSummary {
  numero: number;
  totalEpisodios: number;
}

export interface TmdbSeriesDetails {
  tmdbId: number;
  name: string;
  posterPath: string | null;
  seasons: TmdbSeasonSummary[];
  sinopse: string | null;
  notaMedia: number | null;
  status: string | null;
  backdropPath: string | null;
  generos: string[];
  primeiraExibicaoEm: Date | null;
  idiomaOriginal: string | null;
  nomeOriginal: string | null;
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
}

export interface TmdbSeriesSummary {
  tmdbId: number;
  name: string;
  posterPath: string | null;
  firstAirYear: number | null;
}

interface TmdbSearchResponse {
  results: Array<{
    id: number;
    name: string;
    poster_path: string | null;
    first_air_date: string;
  }>;
}

export async function fetchSeriesFromTmdb(tmdbId: number): Promise<TmdbSeriesDetails> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY não configurada');
  }

  const url = new URL(`${TMDB_BASE_URL}/tv/${tmdbId}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', 'pt-BR');

  const response = await fetch(url);

  if (response.status === 404) {
    throw new SeriesNotFoundError(`Série TMDB ${tmdbId} não encontrada`);
  }

  if (!response.ok) {
    throw new Error(`Erro ao consultar TMDB: ${response.status}`);
  }

  const data = (await response.json()) as TmdbTvResponse;

  const seasons = data.seasons
    .filter((season) => season.season_number > 0)
    .map((season) => ({ numero: season.season_number, totalEpisodios: season.episode_count }));

  return {
    tmdbId,
    name: data.name,
    posterPath: data.poster_path,
    seasons,
    sinopse: data.overview || null,
    notaMedia: data.vote_average ?? null,
    status: data.status,
    backdropPath: data.backdrop_path,
    generos: data.genres.map((genre) => genre.name),
    primeiraExibicaoEm: data.first_air_date ? new Date(data.first_air_date) : null,
    idiomaOriginal: data.original_language,
    nomeOriginal: data.original_name,
  };
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

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Erro ao consultar TMDB: ${response.status}`);
  }

  const data = (await response.json()) as TmdbSearchResponse;

  return data.results.map((item) => ({
    tmdbId: item.id,
    name: item.name,
    posterPath: item.poster_path,
    firstAirYear: item.first_air_date ? Number(item.first_air_date.slice(0, 4)) : null,
  }));
}
