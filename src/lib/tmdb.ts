const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export class SeriesNotFoundError extends Error {}

export interface TmdbSeriesDetails {
  tmdbId: number;
  name: string;
  posterPath: string | null;
}

interface TmdbTvResponse {
  name: string;
  poster_path: string | null;
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

  return { tmdbId, name: data.name, posterPath: data.poster_path };
}
