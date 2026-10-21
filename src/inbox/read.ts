import { TipoAviso } from '@prisma/client';
import { inviteInclude, toInviteDtos, type InviteDto } from '../invites/invites';
import { episodeKey } from '../lib/progress';
import prisma from '../lib/prisma';

// "Entre vocês" guarda 30 dias; o resto é apagado quando a pessoa abre a tela.
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// Uma dupla não chega perto disso em 30 dias, com os avisos do mesmo assunto juntos.
const LIMIT = 60;

export type InboxItemType =
  | 'invite'
  | 'invite-answer'
  | 'note'
  | 'comment'
  | 'reaction'
  | 'series-added'
  | 'episode-watched'
  | 'season-finished';

const TYPE_OF: Record<TipoAviso, InboxItemType> = {
  CONVITE: 'invite',
  RESPOSTA_CONVITE: 'invite-answer',
  RECADO: 'note',
  COMENTARIO: 'comment',
  REACAO: 'reaction',
  SERIE_ADICIONADA: 'series-added',
  EPISODIO_VISTO: 'episode-watched',
  TEMPORADA_TERMINADA: 'season-finished',
};

export interface InboxItemDto {
  id: string;
  type: InboxItemType;
  actorId: string;
  // A última vez que o assunto teve novidade.
  at: string;
  // Quantos se juntaram ("comentou 3 vezes", "viu 4 episódios").
  count: number;
  // Chegou depois da última vez que a pessoa abriu a tela.
  isNew: boolean;
  series: { id: string; nome: string; posterPath: string | null } | null;
  season: number | null;
  episode: number | null;
  // O recado, ou o comentário mais recente do assunto. Null quando é spoiler (`hidden`).
  text: string | null;
  emoji: string | null;
  // Comentário ou reação num episódio que você ainda não viu: aparece que existe, sem o
  // conteúdo (a mesma regra do resto do app).
  hidden: boolean;
  invite: InviteDto | null;
}

// Quem está na dupla agora. Avisos de quem saiu do grupo deixam de aparecer.
async function groupMemberIds(userId: string): Promise<string[]> {
  const membership = await prisma.membroDoGrupo.findUnique({
    where: { usuarioId: userId },
    select: { grupo: { select: { membros: { select: { usuarioId: true } } } } },
  });
  return membership?.grupo.membros.map((member) => member.usuarioId) ?? [];
}

async function seenAt(userId: string): Promise<Date | null> {
  const user = await prisma.usuario.findUnique({
    where: { id: userId },
    select: { avisosVistosEm: true },
  });
  return user?.avisosVistosEm ?? null;
}

// O mesmo episódio de uma série, de uma pessoa.
function contentKey(seriesId: string, season: number, episode: number, userId: string): string {
  return `${seriesId}:${episodeKey(season, episode)}:${userId}`;
}

export async function listInbox(userId: string, now: Date): Promise<InboxItemDto[]> {
  const members = await groupMemberIds(userId);
  if (members.length === 0) return [];

  await prisma.aviso.deleteMany({
    where: { usuarioId: userId, atualizadoEm: { lt: new Date(now.getTime() - RETENTION_MS) } },
  });

  const [lastSeen, rows] = await Promise.all([
    seenAt(userId),
    prisma.aviso.findMany({
      where: { usuarioId: userId, autorId: { in: members } },
      orderBy: { atualizadoEm: 'desc' },
      take: LIMIT,
      include: {
        serieAcompanhada: { select: { id: true, nome: true, posterPath: true } },
        convite: { include: inviteInclude },
      },
    }),
  ]);

  // Comentário e reação são lidos agora, não guardados no aviso: um comentário apagado
  // some, a reação trocada aparece a nova, e o spoiler segue o que você já viu.
  const episodeRows = rows.flatMap((row) =>
    (row.tipo === TipoAviso.COMENTARIO || row.tipo === TipoAviso.REACAO) &&
    row.serieAcompanhadaId &&
    row.temporada !== null &&
    row.episodio !== null
      ? [
          {
            tipo: row.tipo,
            where: {
              serieAcompanhadaId: row.serieAcompanhadaId,
              temporada: row.temporada,
              episodio: row.episodio,
              usuarioId: row.autorId,
            },
          },
        ]
      : [],
  );
  const commentsWhere = episodeRows
    .filter((row) => row.tipo === TipoAviso.COMENTARIO)
    .map((row) => row.where);
  const reactionsWhere = episodeRows
    .filter((row) => row.tipo === TipoAviso.REACAO)
    .map((row) => row.where);
  const seriesIds = [...new Set(episodeRows.map((row) => row.where.serieAcompanhadaId))];

  const [watched, comments, reactions, invites] = await Promise.all([
    seriesIds.length > 0
      ? prisma.progressoEpisodio.findMany({
          where: { usuarioId: userId, serieAcompanhadaId: { in: seriesIds } },
          select: { serieAcompanhadaId: true, temporada: true, episodio: true },
        })
      : [],
    commentsWhere.length > 0
      ? prisma.comentarioEpisodio.findMany({
          where: { OR: commentsWhere },
          orderBy: { criadoEm: 'desc' },
          select: {
            serieAcompanhadaId: true,
            temporada: true,
            episodio: true,
            usuarioId: true,
            texto: true,
          },
        })
      : [],
    reactionsWhere.length > 0
      ? prisma.reacaoEpisodio.findMany({
          where: { OR: reactionsWhere },
          select: {
            serieAcompanhadaId: true,
            temporada: true,
            episodio: true,
            usuarioId: true,
            emoji: true,
          },
        })
      : [],
    toInviteDtos(
      rows.flatMap((row) => (row.convite ? [row.convite] : [])),
      now,
    ),
  ]);

  const watchedKeys = new Set(
    watched.map((row) => `${row.serieAcompanhadaId}:${episodeKey(row.temporada, row.episodio)}`),
  );
  // O mais recente de cada (a busca já vem do mais novo para o mais antigo).
  const latestComment = new Map<string, string>();
  for (const comment of comments) {
    const key = contentKey(
      comment.serieAcompanhadaId,
      comment.temporada,
      comment.episodio,
      comment.usuarioId,
    );
    if (!latestComment.has(key)) latestComment.set(key, comment.texto);
  }
  const reactionOf = new Map(
    reactions.map((reaction) => [
      contentKey(
        reaction.serieAcompanhadaId,
        reaction.temporada,
        reaction.episodio,
        reaction.usuarioId,
      ),
      reaction.emoji,
    ]),
  );
  const inviteOf = new Map(invites.map((invite) => [invite.id, invite]));

  return rows.flatMap((row): InboxItemDto[] => {
    let text = row.texto;
    let emoji: string | null = null;
    let hidden = false;

    if (row.tipo === TipoAviso.COMENTARIO || row.tipo === TipoAviso.REACAO) {
      if (!row.serieAcompanhadaId || row.temporada === null || row.episodio === null) return [];
      const key = contentKey(row.serieAcompanhadaId, row.temporada, row.episodio, row.autorId);
      const content =
        row.tipo === TipoAviso.COMENTARIO ? latestComment.get(key) : reactionOf.get(key);
      // Apagado depois do aviso: o aviso some junto.
      if (content === undefined) return [];
      hidden =
        row.autorId !== userId &&
        !watchedKeys.has(`${row.serieAcompanhadaId}:${episodeKey(row.temporada, row.episodio)}`);
      text = row.tipo === TipoAviso.COMENTARIO && !hidden ? content : null;
      emoji = row.tipo === TipoAviso.REACAO && !hidden ? content : null;
    }

    const invite = row.conviteId ? (inviteOf.get(row.conviteId) ?? null) : null;
    if ((row.tipo === TipoAviso.CONVITE || row.tipo === TipoAviso.RESPOSTA_CONVITE) && !invite) {
      return [];
    }

    return [
      {
        id: row.id,
        type: TYPE_OF[row.tipo],
        actorId: row.autorId,
        at: row.atualizadoEm.toISOString(),
        count: row.quantidade,
        isNew: !lastSeen || row.atualizadoEm > lastSeen,
        series: row.serieAcompanhada,
        season: row.temporada,
        episode: row.episodio,
        text,
        emoji,
        hidden,
        invite,
      },
    ];
  });
}

// Quantos avisos chegaram desde a última vez que a pessoa abriu a tela (o pontinho no ícone
// e o número no ícone do app instalado).
export async function countUnseen(userId: string, now = new Date()): Promise<number> {
  const [members, lastSeen] = await Promise.all([groupMemberIds(userId), seenAt(userId)]);
  if (members.length === 0) return 0;
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const since = lastSeen && lastSeen > cutoff ? lastSeen : cutoff;
  return prisma.aviso.count({
    where: { usuarioId: userId, autorId: { in: members }, atualizadoEm: { gt: since } },
  });
}

export async function markInboxSeen(userId: string, now: Date): Promise<void> {
  await prisma.usuario.update({ where: { id: userId }, data: { avisosVistosEm: now } });
}
