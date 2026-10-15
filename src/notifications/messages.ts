import prisma from '../lib/prisma';
import type { Notification, NotificationEvent } from './types';

// Como a pessoa aparece no aviso: o primeiro nome, ou o começo do e-mail.
export function firstName(user: { nome: string | null; email: string }): string {
  return user.nome?.trim().split(/\s+/)[0] || user.email.split('@')[0] || 'Seu par';
}

// Monta o aviso de um evento. Null se a série sumiu nesse meio-tempo. Episódios no mesmo
// formato do app ("T1 · E5").
export async function describeEvent(
  event: NotificationEvent,
  actorName: string,
): Promise<Notification | null> {
  const series = await prisma.serieAcompanhada.findUnique({
    where: { id: event.seriesId },
    select: { nome: true },
  });
  if (!series) return null;

  const link = { label: 'Ver no WatchMate', path: `/series/${event.seriesId}` };
  const actor = { text: actorName, strong: true };
  const seriesName = { text: series.nome, strong: true };

  switch (event.type) {
    case 'series-added':
      return {
        parts: [
          { text: '🍿 ' },
          actor,
          { text: ' adicionou ' },
          seriesName,
          { text: ' à lista de vocês.' },
        ],
        link,
      };
    case 'episode-watched':
      return {
        parts: [
          { text: '👀 ' },
          actor,
          { text: ` viu o T${event.season} · E${event.episode} de ` },
          seriesName,
          { text: '.' },
        ],
        link,
      };
    case 'season-finished':
      return {
        parts: [
          { text: '👀 ' },
          actor,
          { text: ` terminou a temporada ${event.season} de ` },
          seriesName,
          { text: '.' },
        ],
        link,
      };
  }
}
