import { ModoAcompanhamento, Prisma, ProgressoEpisodio, SerieAcompanhada } from '@prisma/client';
import prisma from './prisma';
import { TmdbSeasonSummary } from './tmdb';

export type ProgressScope = 'me' | 'both';

export interface EpisodePosition {
  temporada: number;
  episodio: number;
}

export interface MemberProgress {
  usuarioId: string;
  nome: string | null;
  assistidos: number;
  percentual: number | null;
  posicaoAtual: EpisodePosition | null;
  ultimoAssistidoEm: Date | null;
  // Episódios que esse membro viu e pelo menos um outro membro ainda não.
  aFrente: number;
}

export interface EpisodeWatcher {
  usuarioId: string;
  assistidoEm: Date;
  juntos: boolean;
  marcadoPor: string | null;
}

export interface EpisodeProgressEntry extends EpisodePosition {
  assistidoPor: EpisodeWatcher[];
}

export interface SeriesProgressSummary {
  modo: ModoAcompanhamento;
  totalEpisodios: number;
  membros: MemberProgress[];
  // Episódios que todos os membros já viram - calculado, não é um contador separado.
  emComum: {
    assistidos: number;
    percentual: number | null;
    posicaoAtual: EpisodePosition | null;
  };
  episodios: EpisodeProgressEntry[];
}

export function parseScope(value: unknown): ProgressScope | undefined | null {
  if (value === undefined) return undefined;
  if (value === 'me' || value === 'both') return value;
  return null;
}

// Sem scope explícito, segue o modo da série: JUNTOS marca para todos, SEPARADOS só para quem clicou.
export function resolveTargetUserIds(
  modo: ModoAcompanhamento,
  scope: ProgressScope | undefined,
  userId: string,
  memberIds: string[],
): string[] {
  const effectiveScope = scope ?? (modo === ModoAcompanhamento.JUNTOS ? 'both' : 'me');
  return effectiveScope === 'both' ? memberIds : [userId];
}

export async function getGroupMembers(groupId: string) {
  const members = await prisma.membroDoGrupo.findMany({
    where: { grupoId: groupId },
    include: { usuario: { select: { id: true, nome: true } } },
    orderBy: { entrouEm: 'asc' },
  });
  return members.map((member) => member.usuario);
}

export function episodeKey(temporada: number, episodio: number): string {
  return `${temporada}:${episodio}`;
}

function isLater(a: EpisodePosition, b: EpisodePosition): boolean {
  return a.temporada > b.temporada || (a.temporada === b.temporada && a.episodio > b.episodio);
}

function furthest(positions: EpisodePosition[]): EpisodePosition | null {
  return positions.reduce<EpisodePosition | null>(
    (latest, position) =>
      !latest || isLater(position, latest)
        ? { temporada: position.temporada, episodio: position.episodio }
        : latest,
    null,
  );
}

function percent(count: number, total: number): number | null {
  if (total === 0) return null;
  return Math.min(100, Math.round((count / total) * 100));
}

export function buildProgressSummary(
  series: SerieAcompanhada,
  members: Array<{ id: string; nome: string | null }>,
  rows: ProgressoEpisodio[],
): SeriesProgressSummary {
  const temporadas = series.temporadas as unknown as TmdbSeasonSummary[];
  const totalEpisodios = temporadas.reduce((sum, season) => sum + season.totalEpisodios, 0);
  const memberIds = new Set(members.map((member) => member.id));

  const byEpisode = new Map<string, EpisodeProgressEntry>();
  for (const row of rows) {
    if (!memberIds.has(row.usuarioId)) continue;
    const key = episodeKey(row.temporada, row.episodio);
    let entry = byEpisode.get(key);
    if (!entry) {
      entry = { temporada: row.temporada, episodio: row.episodio, assistidoPor: [] };
      byEpisode.set(key, entry);
    }
    entry.assistidoPor.push({
      usuarioId: row.usuarioId,
      assistidoEm: row.assistidoEm,
      juntos: row.juntos,
      marcadoPor: row.marcadoPor,
    });
  }

  const episodios = [...byEpisode.values()].sort((a, b) =>
    a.temporada !== b.temporada ? a.temporada - b.temporada : a.episodio - b.episodio,
  );
  const watchedByAll = episodios.filter((entry) => entry.assistidoPor.length === members.length);

  const membros = members.map<MemberProgress>((member) => {
    const watched = episodios.filter((entry) =>
      entry.assistidoPor.some((watcher) => watcher.usuarioId === member.id),
    );
    const lastWatched = watched
      .flatMap((entry) => entry.assistidoPor)
      .filter((watcher) => watcher.usuarioId === member.id)
      .reduce<Date | null>(
        (latest, watcher) =>
          !latest || watcher.assistidoEm > latest ? watcher.assistidoEm : latest,
        null,
      );

    return {
      usuarioId: member.id,
      nome: member.nome,
      assistidos: watched.length,
      percentual: percent(watched.length, totalEpisodios),
      posicaoAtual: furthest(watched),
      ultimoAssistidoEm: lastWatched,
      aFrente: watched.filter((entry) => entry.assistidoPor.length < members.length).length,
    };
  });

  return {
    modo: series.modo,
    totalEpisodios,
    membros,
    emComum: {
      assistidos: watchedByAll.length,
      percentual: percent(watchedByAll.length, totalEpisodios),
      posicaoAtual: furthest(watchedByAll),
    },
    episodios,
  };
}

export async function loadProgressSummary(
  series: SerieAcompanhada,
): Promise<SeriesProgressSummary> {
  const [members, rows] = await Promise.all([
    getGroupMembers(series.grupoId),
    prisma.progressoEpisodio.findMany({ where: { serieAcompanhadaId: series.id } }),
  ]);
  return buildProgressSummary(series, members, rows);
}

// Episódios (chave "temporada:episodio") que o usuário já assistiu numa série - usado para
// esconder reações/comentários do parceiro em episódios que seriam spoiler.
export async function getWatchedEpisodeKeys(
  seriesId: string,
  userId: string,
  temporada?: number,
): Promise<Set<string>> {
  const rows = await prisma.progressoEpisodio.findMany({
    where: { serieAcompanhadaId: seriesId, usuarioId: userId, temporada },
    select: { temporada: true, episodio: true },
  });
  return new Set(rows.map((row) => episodeKey(row.temporada, row.episodio)));
}

export function isSpoilerFor(
  viewerId: string,
  watchedKeys: Set<string>,
  item: { usuarioId: string; temporada: number; episodio: number },
): boolean {
  return item.usuarioId !== viewerId && !watchedKeys.has(episodeKey(item.temporada, item.episodio));
}

// Marcar não sobrescreve quem já tinha assistido (mantém a data original).
// Desmarcar apaga sempre o progresso de quem clicou, mas no dos outros membros só o que
// foi registrado por quem clicou ou marcado como "juntos" - assim desfazer um "nós dois"
// marcado por engano não apaga um episódio que o parceiro tinha marcado sozinho.
//
// `together` diz se a marcação foi "assistimos juntos":
// - true: os registros novos nascem como juntos e os que já existiam (ex.: você tinha
//   marcado sozinho antes) passam a ser juntos também - "Leila viu comigo".
// - false: os registros novos nascem como não juntos - "Leila viu em outro momento".
// - ausente: comportamento anterior (juntos quando a marcação é para mais de uma pessoa,
//   sem mexer nos registros que já existiam).
export async function setEpisodesWatched(
  seriesId: string,
  episodes: Array<{ temporada: number; episodio: number }>,
  options: { watched: boolean; targetIds: string[]; markedBy: string; together?: boolean },
) {
  const { watched, targetIds, markedBy, together } = options;
  if (episodes.length === 0 || targetIds.length === 0) return;

  if (!watched) {
    const otherIds = targetIds.filter((id) => id !== markedBy);
    const ownerFilters: Prisma.ProgressoEpisodioWhereInput[] = [];
    if (targetIds.includes(markedBy)) {
      ownerFilters.push({ usuarioId: markedBy });
    }
    if (otherIds.length > 0) {
      ownerFilters.push({
        usuarioId: { in: otherIds },
        OR: [{ marcadoPor: markedBy }, { juntos: true }],
      });
    }

    await prisma.progressoEpisodio.deleteMany({
      where: {
        serieAcompanhadaId: seriesId,
        AND: [
          { OR: episodes.map(({ temporada, episodio }) => ({ temporada, episodio })) },
          { OR: ownerFilters },
        ],
      },
    });
    return;
  }

  const assistidoEm = new Date();
  const juntos = together ?? targetIds.length > 1;
  const create = prisma.progressoEpisodio.createMany({
    data: targetIds.flatMap((usuarioId) =>
      episodes.map(({ temporada, episodio }) => ({
        serieAcompanhadaId: seriesId,
        usuarioId,
        temporada,
        episodio,
        assistidoEm,
        marcadoPor: markedBy,
        juntos,
      })),
    ),
    skipDuplicates: true,
  });

  if (together !== true) {
    await create;
    return;
  }

  // Só com "juntos" explícito os registros que já existiam também viram juntos.
  await prisma.$transaction([
    create,
    prisma.progressoEpisodio.updateMany({
      where: {
        serieAcompanhadaId: seriesId,
        usuarioId: { in: targetIds },
        juntos: false,
        OR: episodes.map(({ temporada, episodio }) => ({ temporada, episodio })),
      },
      data: { juntos: true },
    }),
  ]);
}
