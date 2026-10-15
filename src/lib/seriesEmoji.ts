import prisma from './prisma';
import { episodeKey, isSpoilerFor } from './progress';

// Quantas reações uma série precisa para ganhar um emoji. Com uma ou duas, o "emoji da
// série" seria só o de um episódio.
const MIN_REACTIONS = 3;

interface Tally {
  count: number;
  // A reação mais recente com esse emoji: desempata a favor do que vocês sentiram por último.
  latest: number;
}

// O emoji que a dupla mais usou em cada série, do ponto de vista de quem pede: entram as
// suas reações e as do par só em episódios que você já viu (a mesma regra que esconde
// reações nas telas de episódio). Séries com poucas reações ficam de fora do mapa.
export async function loadSeriesEmojis(
  seriesIds: string[],
  viewerId: string,
): Promise<Map<string, string>> {
  if (seriesIds.length === 0) return new Map();

  const [reactions, watched] = await Promise.all([
    prisma.reacaoEpisodio.findMany({
      where: { serieAcompanhadaId: { in: seriesIds } },
      select: {
        serieAcompanhadaId: true,
        temporada: true,
        episodio: true,
        usuarioId: true,
        emoji: true,
        atualizadoEm: true,
      },
    }),
    prisma.progressoEpisodio.findMany({
      where: { serieAcompanhadaId: { in: seriesIds }, usuarioId: viewerId },
      select: { serieAcompanhadaId: true, temporada: true, episodio: true },
    }),
  ]);

  const watchedBySeries = new Map<string, Set<string>>();
  for (const row of watched) {
    const keys = watchedBySeries.get(row.serieAcompanhadaId) ?? new Set<string>();
    keys.add(episodeKey(row.temporada, row.episodio));
    watchedBySeries.set(row.serieAcompanhadaId, keys);
  }

  const talliesBySeries = new Map<string, Map<string, Tally>>();
  for (const reaction of reactions) {
    const watchedKeys = watchedBySeries.get(reaction.serieAcompanhadaId) ?? new Set<string>();
    if (isSpoilerFor(viewerId, watchedKeys, reaction)) continue;

    const tallies = talliesBySeries.get(reaction.serieAcompanhadaId) ?? new Map<string, Tally>();
    const tally = tallies.get(reaction.emoji) ?? { count: 0, latest: 0 };
    tally.count++;
    tally.latest = Math.max(tally.latest, reaction.atualizadoEm.getTime());
    tallies.set(reaction.emoji, tally);
    talliesBySeries.set(reaction.serieAcompanhadaId, tallies);
  }

  const emojis = new Map<string, string>();
  for (const [seriesId, tallies] of talliesBySeries) {
    let total = 0;
    let best: { emoji: string; tally: Tally } | null = null;
    for (const [emoji, tally] of tallies) {
      total += tally.count;
      if (
        !best ||
        tally.count > best.tally.count ||
        (tally.count === best.tally.count && tally.latest > best.tally.latest)
      ) {
        best = { emoji, tally };
      }
    }
    if (best && total >= MIN_REACTIONS) emojis.set(seriesId, best.emoji);
  }
  return emojis;
}
