import { SerieAcompanhada } from '@prisma/client';
import prisma from './prisma';
import { getGroupMembers } from './progress';
import { loadSeriesEmojis } from './seriesEmoji';
import { refreshStaleSnapshots } from './seriesSnapshot';

// Como uma série sai da API: as colunas da tabela, quem do grupo quer ver ("quero ver",
// na ordem em que marcou) e o emoji da série para quem pediu.
export type SeriesResponse = SerieAcompanhada & {
  interessados: string[];
  emojiDaSerie: string | null;
};

export function toSeriesResponse(
  series: SerieAcompanhada,
  interessados: string[],
  emojiDaSerie: string | null,
): SeriesResponse {
  return { ...series, interessados, emojiDaSerie };
}

// Quem saiu do grupo deixa de contar: a marcação fica, mas não aparece.
async function memberIdsOf(groupId: string): Promise<Set<string>> {
  const members = await getGroupMembers(groupId);
  return new Set(members.map((member) => member.id));
}

export async function loadSeriesList(groupId: string, viewerId: string): Promise<SeriesResponse[]> {
  const [rows, memberIds] = await Promise.all([
    prisma.serieAcompanhada.findMany({
      where: { grupoId: groupId },
      orderBy: { adicionadoEm: 'desc' },
      include: { interesses: { select: { usuarioId: true }, orderBy: { criadoEm: 'asc' } } },
    }),
    memberIdsOf(groupId),
  ]);

  const [series, emojis] = await Promise.all([
    refreshStaleSnapshots(rows),
    loadSeriesEmojis(
      rows.map((row) => row.id),
      viewerId,
    ),
  ]);

  return series.map(({ interesses, ...row }) =>
    toSeriesResponse(
      row,
      interesses.map((interest) => interest.usuarioId).filter((id) => memberIds.has(id)),
      emojis.get(row.id) ?? null,
    ),
  );
}

export async function loadInterestedIds(seriesId: string, groupId: string): Promise<string[]> {
  const [rows, memberIds] = await Promise.all([
    prisma.interesseSerie.findMany({
      where: { serieAcompanhadaId: seriesId },
      select: { usuarioId: true },
      orderBy: { criadoEm: 'asc' },
    }),
    memberIdsOf(groupId),
  ]);
  return rows.map((row) => row.usuarioId).filter((id) => memberIds.has(id));
}
