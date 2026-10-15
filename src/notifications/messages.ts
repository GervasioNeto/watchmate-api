import { getWatchedEpisodeKeys, isSpoilerFor } from '../lib/progress';
import prisma from '../lib/prisma';
import type { Notification, NotificationEvent } from './types';

const TMDB_BACKDROP_URL = 'https://image.tmdb.org/t/p/w780';
// O conteúdo de um push tem limite de tamanho: comentário longo vai cortado (o inteiro está
// no app, a um toque).
const MAX_QUOTE_LENGTH = 160;

// Como a pessoa aparece no aviso: o primeiro nome, ou o começo do e-mail.
export function firstName(user: { nome: string | null; email: string }): string {
  return user.nome?.trim().split(/\s+/)[0] || user.email.split('@')[0] || 'Seu par';
}

function quote(text: string): string {
  const cut =
    text.length > MAX_QUOTE_LENGTH ? `${text.slice(0, MAX_QUOTE_LENGTH - 1).trimEnd()}…` : text;
  return `“${cut}”`;
}

// No mesmo formato do app: "T1 · E5".
function episodeLabel(season: number, episode: number): string {
  return `T${season} · E${episode}`;
}

interface EpisodeEvent {
  actorId: string;
  seriesId: string;
  season: number;
  episode: number;
}

// O que o par fez num episódio que você ainda não viu fica escondido no aviso, como no app
// (a mesma regra de lib/progress.ts).
async function isSpoilerForRecipient(recipientId: string, event: EpisodeEvent) {
  const watched = await getWatchedEpisodeKeys(event.seriesId, recipientId, event.season);
  return isSpoilerFor(recipientId, watched, {
    usuarioId: event.actorId,
    temporada: event.season,
    episodio: event.episode,
  });
}

// Monta o aviso de um evento para quem vai receber (comentários e reações dependem do que a
// pessoa já viu). Null se a série sumiu nesse meio-tempo.
export async function describeEvent(
  event: NotificationEvent,
  actorName: string,
  recipientId: string,
): Promise<Notification | null> {
  const actor = { text: actorName, strong: true };

  if (event.type === 'note-left') {
    return {
      parts: [{ text: '💬 ' }, actor, { text: ` deixou um recado: ${quote(event.note)}` }],
      title: `💬 ${actorName} deixou um recado`,
      body: event.note,
      thread: `note:${event.actorId}`,
      imageUrl: null,
      link: { label: 'Ver no WatchMate', path: '/my-list' },
    };
  }

  const series = await prisma.serieAcompanhada.findUnique({
    where: { id: event.seriesId },
    select: { nome: true, backdropPath: true },
  });
  if (!series) return null;

  const seriesName = { text: series.nome, strong: true };
  const common = {
    link: { label: 'Ver no WatchMate', path: `/series/${event.seriesId}` },
    imageUrl: series.backdropPath ? `${TMDB_BACKDROP_URL}${series.backdropPath}` : null,
  };

  switch (event.type) {
    case 'series-added':
      return {
        ...common,
        parts: [
          { text: '🍿 ' },
          actor,
          { text: ' adicionou ' },
          seriesName,
          { text: ' à lista de vocês.' },
        ],
        title: `🍿 ${actorName} adicionou uma série`,
        body: `${series.nome} entrou na lista de vocês.`,
        thread: `series-added:${event.seriesId}`,
      };

    case 'episode-watched': {
      const episode = episodeLabel(event.season, event.episode);
      return {
        ...common,
        parts: [
          { text: '👀 ' },
          actor,
          { text: ` viu o ${episode} de ` },
          seriesName,
          { text: '.' },
        ],
        title: `👀 ${actorName} viu um episódio`,
        body: `${series.nome} · ${episode}`,
        thread: `progress:${event.seriesId}`,
      };
    }

    case 'season-finished':
      return {
        ...common,
        parts: [
          { text: '👀 ' },
          actor,
          { text: ` terminou a temporada ${event.season} de ` },
          seriesName,
          { text: '.' },
        ],
        title: `👀 ${actorName} terminou uma temporada`,
        body: `${series.nome} · temporada ${event.season}`,
        thread: `progress:${event.seriesId}`,
      };

    // 🙈 quando o conteúdo fica escondido: o aviso conta que tem algo lá, sem dizer o quê.
    case 'episode-commented': {
      const episode = episodeLabel(event.season, event.episode);
      const hidden = await isSpoilerForRecipient(recipientId, event);
      return {
        ...common,
        parts: [
          { text: hidden ? '🙈 ' : '💬 ' },
          actor,
          { text: ` comentou o ${episode} de ` },
          seriesName,
          { text: hidden ? '. Assista para ver.' : `: ${quote(event.comment)}` },
        ],
        title: `${hidden ? '🙈' : '💬'} ${actorName} comentou o ${episode}`,
        body: hidden
          ? `${series.nome} · Assista ao episódio para ver o comentário.`
          : `${series.nome}: ${quote(event.comment)}`,
        thread: `comments:${event.seriesId}:${event.season}:${event.episode}`,
      };
    }

    case 'episode-reacted': {
      const episode = episodeLabel(event.season, event.episode);
      const hidden = await isSpoilerForRecipient(recipientId, event);
      return {
        ...common,
        parts: [
          { text: hidden ? '🙈 ' : `${event.emoji} ` },
          actor,
          { text: ` reagiu ao ${episode} de ` },
          seriesName,
          { text: hidden ? '. Assista para ver.' : '.' },
        ],
        title: `${hidden ? '🙈' : event.emoji} ${actorName} reagiu ao ${episode}`,
        body: hidden ? `${series.nome} · Assista ao episódio para ver a reação.` : series.nome,
        // Trocar de reação substitui o aviso anterior, em vez de mandar outro.
        thread: `reaction:${event.seriesId}:${event.season}:${event.episode}:${event.actorId}`,
      };
    }
  }
}
