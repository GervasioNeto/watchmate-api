import { TipoAviso } from '@prisma/client';
import prisma from '../lib/prisma';
import type { NotificationEvent } from '../notifications/types';

// Avisos do mesmo assunto, do mesmo autor, dentro desta janela viram um só: três
// comentários seguidos no mesmo episódio são "comentou 3 vezes", não três linhas.
const MERGE_WINDOW_MS = 6 * 60 * 60 * 1000;

interface InboxEntry {
  tipo: TipoAviso;
  assunto: string;
  // Juntar soma (comentários, episódios vistos) ou só troca pelo mais recente (a reação
  // trocada, o recado novo).
  counts: boolean;
  data: {
    serieAcompanhadaId?: string;
    temporada?: number;
    episodio?: number;
    conviteId?: string;
    texto?: string;
  };
}

// Como cada evento fica guardado. Cancelar um convite não vira aviso: o convite que já
// está lá passa a aparecer como cancelado.
function toEntry(event: NotificationEvent): InboxEntry | null {
  switch (event.type) {
    case 'series-added':
      return {
        tipo: TipoAviso.SERIE_ADICIONADA,
        assunto: `series-added:${event.seriesId}`,
        counts: false,
        data: { serieAcompanhadaId: event.seriesId },
      };
    case 'episode-watched':
      return {
        tipo: TipoAviso.EPISODIO_VISTO,
        assunto: `watched:${event.seriesId}`,
        counts: true,
        data: {
          serieAcompanhadaId: event.seriesId,
          temporada: event.season,
          episodio: event.episode,
        },
      };
    case 'season-finished':
      return {
        tipo: TipoAviso.TEMPORADA_TERMINADA,
        assunto: `season:${event.seriesId}:${event.season}`,
        counts: false,
        data: { serieAcompanhadaId: event.seriesId, temporada: event.season },
      };
    case 'note-left':
      return {
        tipo: TipoAviso.RECADO,
        assunto: 'note',
        counts: false,
        data: { texto: event.note },
      };
    case 'episode-commented':
      return {
        tipo: TipoAviso.COMENTARIO,
        assunto: `comments:${event.seriesId}:${event.season}:${event.episode}`,
        counts: true,
        data: {
          serieAcompanhadaId: event.seriesId,
          temporada: event.season,
          episodio: event.episode,
        },
      };
    case 'episode-reacted':
      return {
        tipo: TipoAviso.REACAO,
        assunto: `reaction:${event.seriesId}:${event.season}:${event.episode}`,
        counts: false,
        data: {
          serieAcompanhadaId: event.seriesId,
          temporada: event.season,
          episodio: event.episode,
        },
      };
    case 'invite-sent':
      return {
        tipo: TipoAviso.CONVITE,
        assunto: `invite:${event.inviteId}`,
        counts: false,
        data: { conviteId: event.inviteId },
      };
    case 'invite-answered':
      return {
        tipo: TipoAviso.RESPOSTA_CONVITE,
        assunto: `invite-answer:${event.inviteId}`,
        counts: false,
        data: { conviteId: event.inviteId },
      };
    case 'invite-canceled':
      return null;
  }
}

// Guarda o aviso para quem recebe (ou junta com um recente do mesmo assunto, que sobe para o
// topo como novo). Vem antes do push: o aviso fica no app mesmo que o push não chegue.
export async function recordInboxItem(
  event: NotificationEvent,
  recipientId: string,
  now = new Date(),
): Promise<void> {
  const entry = toEntry(event);
  if (!entry) return;

  const recent = await prisma.aviso.findFirst({
    where: {
      usuarioId: recipientId,
      autorId: event.actorId,
      assunto: entry.assunto,
      atualizadoEm: { gt: new Date(now.getTime() - MERGE_WINDOW_MS) },
    },
    orderBy: { atualizadoEm: 'desc' },
    select: { id: true },
  });

  if (recent) {
    await prisma.aviso.update({
      where: { id: recent.id },
      data: {
        ...entry.data,
        atualizadoEm: now,
        ...(entry.counts ? { quantidade: { increment: 1 } } : {}),
      },
    });
    return;
  }

  await prisma.aviso.create({
    data: {
      usuarioId: recipientId,
      autorId: event.actorId,
      tipo: entry.tipo,
      assunto: entry.assunto,
      ...entry.data,
      criadoEm: now,
      atualizadoEm: now,
    },
  });
}
