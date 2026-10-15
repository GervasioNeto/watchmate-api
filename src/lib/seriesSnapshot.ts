import { Prisma, SerieAcompanhada } from '@prisma/client';
import prisma from './prisma';
import { fetchSeriesSnapshot, SeriesNotFoundError, TmdbSeriesSnapshot } from './tmdb';

// De quanto em quanto tempo o snapshot de uma série no ar é renovado. Episódio novo sai
// no máximo uma vez por dia; 6 h deixa o "saiu episódio novo" em dia sem consultar o
// TMDB a cada vez que a lista abre.
const SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// Quanto a lista espera o TMDB antes de seguir com o snapshot que já tinha.
const TMDB_TIMEOUT_MS = 4000;

// Série que acabou não muda mais: depois do primeiro snapshot, não é consultada de novo.
const FINAL_STATUSES = new Set(['Ended', 'Canceled']);

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

// As colunas que vêm do snapshot, prontas para `create` e `update`.
export function snapshotFields(snapshot: TmdbSeriesSnapshot) {
  return {
    posterPath: snapshot.posterPath,
    backdropPath: snapshot.backdropPath,
    temporadas: toJson(snapshot.seasons),
    notaMedia: snapshot.notaMedia,
    status: snapshot.status,
    ultimoEpisodioExibido: snapshot.ultimoEpisodioExibido
      ? toJson(snapshot.ultimoEpisodioExibido)
      : Prisma.DbNull,
    proximoEpisodio: snapshot.proximoEpisodio ? toJson(snapshot.proximoEpisodio) : Prisma.DbNull,
    atualizadoTmdbEm: new Date(),
  };
}

// Séries adicionadas antes do snapshot existir são renovadas uma vez, mesmo as que acabaram.
function isStale(series: SerieAcompanhada, now: number): boolean {
  if (!series.atualizadoTmdbEm) return true;
  if (series.status && FINAL_STATUSES.has(series.status)) return false;
  return now - series.atualizadoTmdbEm.getTime() > SNAPSHOT_MAX_AGE_MS;
}

// O que veio junto da busca (ex.: `interesses`) é mantido: o update só devolve as colunas.
async function refreshSnapshot<T extends SerieAcompanhada>(series: T): Promise<T> {
  try {
    const snapshot = await fetchSeriesSnapshot(series.tmdbId, AbortSignal.timeout(TMDB_TIMEOUT_MS));
    const updated = await prisma.serieAcompanhada.update({
      where: { id: series.id },
      data: snapshotFields(snapshot),
    });
    return { ...series, ...updated };
  } catch (err) {
    // Sumiu do TMDB: espera o intervalo normal antes de tentar de novo, em vez de
    // consultar a cada abertura da lista. Outros erros (timeout, TMDB fora) tentam de novo.
    if (err instanceof SeriesNotFoundError) {
      return prisma.serieAcompanhada
        .update({ where: { id: series.id }, data: { atualizadoTmdbEm: new Date() } })
        .then((updated) => ({ ...series, ...updated }))
        .catch(() => series);
    }
    console.error(`Não foi possível renovar a série ${series.id} no TMDB`, err);
    return series;
  }
}

// Renova, antes de devolver a lista, o snapshot das séries que ainda estão no ar: assim
// temporadas novas, episódios novos e o próximo agendado aparecem sozinhos. Se o TMDB
// falhar ou demorar, a série segue com o que já tinha: a lista nunca deixa de abrir por
// causa dele.
export async function refreshStaleSnapshots<T extends SerieAcompanhada>(series: T[]): Promise<T[]> {
  const now = Date.now();
  return Promise.all(series.map((item) => (isStale(item, now) ? refreshSnapshot(item) : item)));
}
