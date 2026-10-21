import { Prisma, StatusConvite } from '@prisma/client';
import prisma from '../lib/prisma';
import { inviteExpiresAt } from './schedule';

// O convite como o app recebe. `status` já considera a hora: passou de `expiresAt` sem a
// sessão acontecer, é "expired" (o banco não guarda isso, ver StatusConvite).
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'canceled' | 'expired';

export interface InviteDto {
  id: string;
  series: { id: string; nome: string; posterPath: string | null; backdropPath: string | null };
  season: number;
  episode: number;
  fromId: string;
  toId: string;
  // A hora da sessão; null é "agora".
  at: string | null;
  phrase: string | null;
  status: InviteStatus;
  // Aceito em outro horário ("topo, mas às 22h"): `at` já é o novo.
  rescheduled: boolean;
  // Os dois viram o episódio depois do convite: a sessão aconteceu.
  fulfilled: boolean;
  createdAt: string;
  answeredAt: string | null;
  expiresAt: string;
}

export const inviteInclude = {
  serieAcompanhada: { select: { id: true, nome: true, posterPath: true, backdropPath: true } },
} satisfies Prisma.ConviteSessaoInclude;

export type InviteWithSeries = Prisma.ConviteSessaoGetPayload<{ include: typeof inviteInclude }>;

// Um convite "vivo" ainda pode virar sessão: esperando resposta ou aceito.
const LIVE_STATUSES: StatusConvite[] = [StatusConvite.PENDENTE, StatusConvite.ACEITO];

// A sessão aconteceu: os dois viram o episódio, e pelo menos um viu depois do convite (quem
// estava à frente já tinha visto antes). Uma consulta só para todos os convites.
async function findFulfilled(invites: InviteWithSeries[]): Promise<Set<string>> {
  const live = invites.filter((invite) => LIVE_STATUSES.includes(invite.status));
  if (live.length === 0) return new Set();

  const rows = await prisma.progressoEpisodio.findMany({
    where: {
      OR: live.map((invite) => ({
        serieAcompanhadaId: invite.serieAcompanhadaId,
        temporada: invite.temporada,
        episodio: invite.episodio,
        usuarioId: { in: [invite.deUsuarioId, invite.paraUsuarioId] },
      })),
    },
    select: {
      serieAcompanhadaId: true,
      temporada: true,
      episodio: true,
      usuarioId: true,
      assistidoEm: true,
    },
  });

  const fulfilled = new Set<string>();
  for (const invite of live) {
    const watched = rows.filter(
      (row) =>
        row.serieAcompanhadaId === invite.serieAcompanhadaId &&
        row.temporada === invite.temporada &&
        row.episodio === invite.episodio,
    );
    const from = watched.find((row) => row.usuarioId === invite.deUsuarioId);
    const to = watched.find((row) => row.usuarioId === invite.paraUsuarioId);
    if (from && to && (from.assistidoEm >= invite.criadoEm || to.assistidoEm >= invite.criadoEm)) {
      fulfilled.add(invite.id);
    }
  }
  return fulfilled;
}

function statusOf(invite: InviteWithSeries, fulfilled: boolean, now: Date): InviteStatus {
  if (invite.status === StatusConvite.RECUSADO) return 'declined';
  if (invite.status === StatusConvite.CANCELADO) return 'canceled';
  if (!fulfilled && invite.expiraEm <= now) return 'expired';
  return invite.status === StatusConvite.ACEITO ? 'accepted' : 'pending';
}

export async function toInviteDtos(invites: InviteWithSeries[], now: Date): Promise<InviteDto[]> {
  const fulfilled = await findFulfilled(invites);
  return invites.map((invite) => ({
    id: invite.id,
    series: invite.serieAcompanhada,
    season: invite.temporada,
    episode: invite.episodio,
    fromId: invite.deUsuarioId,
    toId: invite.paraUsuarioId,
    at: invite.horario?.toISOString() ?? null,
    phrase: invite.frase,
    status: statusOf(invite, fulfilled.has(invite.id), now),
    rescheduled: invite.remarcado,
    fulfilled: fulfilled.has(invite.id),
    createdAt: invite.criadoEm.toISOString(),
    answeredAt: invite.respondidoEm?.toISOString() ?? null,
    expiresAt: invite.expiraEm.toISOString(),
  }));
}

export async function toInviteDto(invite: InviteWithSeries, now: Date): Promise<InviteDto> {
  const [dto] = await toInviteDtos([invite], now);
  return dto;
}

// O convite do momento da dupla: o mais recente que ainda vale e cuja sessão não aconteceu.
// É ele que aparece no topo da lista e na página da série. Null: nenhum.
export async function findActiveInvite(groupId: string, now: Date): Promise<InviteDto | null> {
  const invite = await prisma.conviteSessao.findFirst({
    where: { grupoId: groupId, status: { in: LIVE_STATUSES }, expiraEm: { gt: now } },
    orderBy: { criadoEm: 'desc' },
    include: inviteInclude,
  });
  if (!invite) return null;
  const dto = await toInviteDto(invite, now);
  return dto.fulfilled ? null : dto;
}

// Antes de um convite novo: os vivos da dupla saem (um novo substitui o anterior, dos dois
// lados), e os de mais de 30 dias são apagados, como os avisos.
export async function retireInvites(groupId: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.conviteSessao.updateMany({
      where: { grupoId: groupId, status: { in: LIVE_STATUSES }, expiraEm: { gt: now } },
      data: { status: StatusConvite.CANCELADO },
    }),
    prisma.conviteSessao.deleteMany({ where: { grupoId: groupId, criadoEm: { lt: cutoff } } }),
  ]);
}

export interface CreateInviteInput {
  groupId: string;
  seriesId: string;
  season: number;
  episode: number;
  fromId: string;
  toId: string;
  at: Date | null;
  timeZone: string;
  phrase: string | null;
}

export async function createInvite(input: CreateInviteInput, now: Date) {
  await retireInvites(input.groupId, now);
  return prisma.conviteSessao.create({
    data: {
      grupoId: input.groupId,
      serieAcompanhadaId: input.seriesId,
      temporada: input.season,
      episodio: input.episode,
      deUsuarioId: input.fromId,
      paraUsuarioId: input.toId,
      horario: input.at,
      fusoHorario: input.timeZone,
      frase: input.phrase,
      expiraEm: inviteExpiresAt(input.at, now),
      criadoEm: now,
    },
    include: inviteInclude,
  });
}

// Aceitar (no horário do convite ou em outro) ou recusar. Quem chama confere que o convite é
// para quem responde e que ainda espera resposta.
export async function answerInvite(
  invite: InviteWithSeries,
  answer: { accept: true; at: Date | null | undefined } | { accept: false },
  now: Date,
) {
  if (!answer.accept) {
    return prisma.conviteSessao.update({
      where: { id: invite.id },
      data: { status: StatusConvite.RECUSADO, respondidoEm: now },
      include: inviteInclude,
    });
  }

  // `at` ausente: no horário combinado. Um horário novo só conta como remarcado se mudou.
  const at = answer.at === undefined ? invite.horario : answer.at;
  const rescheduled = (at?.getTime() ?? null) !== (invite.horario?.getTime() ?? null);
  return prisma.conviteSessao.update({
    where: { id: invite.id },
    data: {
      status: StatusConvite.ACEITO,
      horario: at,
      remarcado: rescheduled,
      respondidoEm: now,
      // "Agora" aceito mais tarde ainda é agora: vale a partir da resposta.
      expiraEm: inviteExpiresAt(at, at === null ? now : invite.criadoEm),
    },
    include: inviteInclude,
  });
}

export async function cancelInvite(invite: InviteWithSeries) {
  return prisma.conviteSessao.update({
    where: { id: invite.id },
    data: { status: StatusConvite.CANCELADO },
    include: inviteInclude,
  });
}

// Ainda dá para responder ou cancelar: vivo e dentro do prazo.
export function isLive(invite: InviteWithSeries, now: Date): boolean {
  return LIVE_STATUSES.includes(invite.status) && invite.expiraEm > now;
}
