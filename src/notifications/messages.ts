import { isGiftOccasion, OCCASION_HEADLINES } from '../gifts/catalog';
import { describeOpening, giftInclude } from '../gifts/gifts';
import { inviteInclude } from '../invites/invites';
import { describeInviteTime } from '../invites/schedule';
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

type InviteEvent = Extract<
  NotificationEvent,
  { type: 'invite-sent' | 'invite-answered' | 'invite-canceled' }
>;

function backdropUrl(path: string | null): string | null {
  return path ? `${TMDB_BACKDROP_URL}${path}` : null;
}

// Os avisos do "Bora?". Todos usam o mesmo assunto ("invite"): um convite novo, a resposta
// ou o cancelamento substituem o aviso anterior no celular, em vez de empilhar convites
// velhos. Tocar abre o convite em "Entre vocês", onde ele sempre pode ser respondido.
async function describeInvite(
  event: InviteEvent,
  actorName: string,
  now: Date,
): Promise<Notification | null> {
  const invite = await prisma.conviteSessao.findUnique({
    where: { id: event.inviteId },
    include: inviteInclude,
  });
  if (!invite) return null;

  const actor = { text: actorName, strong: true };
  const seriesName = invite.serieAcompanhada.nome;
  const episode = episodeLabel(invite.temporada, invite.episodio);
  const when = describeInviteTime(invite.horario, invite.fusoHorario, now);
  const path = `/inbox?invite=${invite.id}`;
  const common = {
    thread: 'invite',
    imageUrl: backdropUrl(invite.serieAcompanhada.backdropPath),
    link: { label: 'Abrir o convite', path },
  };

  if (event.type === 'invite-sent') {
    const isNow = invite.horario === null;
    // A frase vai numa linha só dela, embaixo.
    const phrase = invite.frase ? `\n${quote(invite.frase)}` : '';
    return {
      ...common,
      parts: [
        { text: '🍿 ' },
        actor,
        { text: ` te chamou pro sofá ${isNow ? 'agora' : when}: ` },
        { text: seriesName, strong: true },
        { text: `, ${episode}.` },
      ],
      title: `🍿 ${actorName} te chamou pro sofá${isNow ? ' agora' : ''}`,
      body: `${isNow ? `${seriesName} · ${episode}` : `${seriesName} · ${when} · ${episode}`}${phrase}`,
      renotify: true,
      actions: [
        { id: 'accept', label: 'Bora!', path: `${path}&answer=accept` },
        { id: 'decline', label: 'Hoje não', path: `${path}&answer=decline` },
      ],
    };
  }

  if (event.type === 'invite-canceled') {
    return {
      ...common,
      parts: [actor, { text: ' cancelou o convite de ' }, { text: seriesName, strong: true }],
      title: `${actorName} cancelou o convite`,
      body: invite.horario === null ? seriesName : `${seriesName} · ${when}`,
      // Só troca o convite que estava no celular, sem tocar de novo.
      renotify: false,
    };
  }

  if (invite.status === 'RECUSADO') {
    return {
      ...common,
      parts: [
        { text: '😴 Hoje não rola pra ' },
        actor,
        { text: `: ${seriesName} fica pra próxima.` },
      ],
      title: `😴 Hoje não rola pra ${actorName}`,
      body: `${seriesName} fica pra próxima.`,
      renotify: true,
    };
  }

  if (invite.remarcado) {
    return {
      ...common,
      parts: [
        { text: '⏰ ' },
        actor,
        { text: ` topou, mas ${when}: ` },
        { text: seriesName, strong: true },
      ],
      title: `⏰ ${actorName} topou, mas ${when}`,
      body: `${seriesName} · ${episode}`,
      renotify: true,
    };
  }

  return {
    ...common,
    parts: [{ text: '🛋️ ' }, actor, { text: ' topou! ' }, { text: seriesName, strong: true }],
    title: `🛋️ ${actorName} topou!`,
    body:
      invite.horario === null
        ? `${seriesName} · ${episode}`
        : `${seriesName} · ${when} · ${episode}`,
    renotify: true,
  };
}

type GiftEvent = Extract<
  NotificationEvent,
  { type: 'gift-sent' | 'gift-delivered' | 'gift-opened' | 'gift-reacted' | 'voucher-used' }
>;

// Um presente agendado (trancado até a hora) e não um entregue na hora de criar.
const SCHEDULED_AFTER_MS = 60 * 1000;

// Os avisos dos presentes. Os de quem recebe nunca contam o que tem dentro (é surpresa): só que
// tem presente, quando ele abre e quando destrancou. Os outros vão para quem deu: abriu,
// reagiu, usou um vale.
async function describeGift(event: GiftEvent, actorName: string): Promise<Notification | null> {
  const gift = await prisma.presente.findUnique({
    where: { id: event.giftId },
    include: giftInclude,
  });
  if (!gift) return null;

  const actor = { text: actorName, strong: true };
  const headline = OCCASION_HEADLINES[isGiftOccasion(gift.ocasiao) ? gift.ocasiao : 'just-because'];
  const giftPath = `/couple?gift=${gift.id}`;

  switch (event.type) {
    case 'gift-sent':
      return {
        parts: [
          { text: '🎁 ' },
          actor,
          { text: ' deixou um presente pra você. Abre ' },
          { text: describeOpening(gift.entregarEm, event.timeZone, new Date()) },
        ],
        title: `🎁 ${actorName} deixou um presente pra você`,
        body: `Abre ${describeOpening(gift.entregarEm, event.timeZone, new Date())}. Até lá, fica fechadinho 🔒`,
        thread: 'gift',
        imageUrl: null,
        link: { label: 'Ver o presente', path: `/couple?gift=${gift.id}` },
        renotify: true,
      };
    case 'gift-delivered':
      // Agendado: o par já sabia do presente, o aviso é que destrancou.
      if (gift.entregarEm.getTime() - gift.criadoEm.getTime() > SCHEDULED_AFTER_MS) {
        return {
          parts: [
            { text: '🎁 Chegou a hora! O presente de ' },
            actor,
            { text: ' já pode ser aberto.' },
          ],
          title: '🎁 Chegou a hora!',
          body: `O presente de ${actorName} já pode ser aberto 💝`,
          thread: 'gift',
          imageUrl: null,
          link: { label: 'Abrir o presente', path: '/my-list' },
          renotify: true,
        };
      }
      return {
        parts: [{ text: '🎁 ' }, actor, { text: ' deixou um presente pra você.' }],
        title: `🎁 ${actorName} deixou um presente pra você`,
        body: 'Abra o WatchMate pra descobrir 💝',
        thread: 'gift',
        imageUrl: null,
        // O presente abre sozinho quando o app abre, em qualquer tela.
        link: { label: 'Abrir o presente', path: '/my-list' },
        renotify: true,
      };
    case 'gift-opened':
      return {
        parts: [{ text: '🥹 ' }, actor, { text: ' abriu seu presente.' }],
        title: `🥹 ${actorName} abriu seu presente`,
        body: `${headline} 💝`,
        thread: `gift:${gift.id}`,
        imageUrl: null,
        link: { label: 'Ver o presente', path: giftPath },
        renotify: true,
      };
    case 'gift-reacted':
      return {
        parts: [{ text: `${gift.reacao ?? '❤️'} ` }, actor, { text: ' reagiu ao seu presente.' }],
        title: `${gift.reacao ?? '❤️'} ${actorName} reagiu ao seu presente`,
        body: `${headline} 💝`,
        thread: `gift:${gift.id}`,
        imageUrl: null,
        link: { label: 'Ver o presente', path: giftPath },
        renotify: true,
      };
    case 'voucher-used': {
      const voucher = gift.vales.find((item) => item.id === event.voucherId);
      if (!voucher) return null;
      const label = `${voucher.emoji ? `${voucher.emoji} ` : ''}${voucher.texto}`;
      return {
        parts: [{ text: '🎟️ ' }, actor, { text: ` quer usar um vale: ${label}` }],
        title: `🎟️ ${actorName} quer usar um vale`,
        body: `${label}. Hora de cumprir!`,
        thread: `voucher:${voucher.id}`,
        imageUrl: null,
        link: { label: 'Ver o vale', path: giftPath },
        renotify: true,
      };
    }
  }
}

// Monta o aviso de um evento para quem vai receber (comentários e reações dependem do que a
// pessoa já viu). Null se a série sumiu nesse meio-tempo.
export async function describeEvent(
  event: NotificationEvent,
  actorName: string,
  recipientId: string,
): Promise<Notification | null> {
  const actor = { text: actorName, strong: true };

  if (
    event.type === 'invite-sent' ||
    event.type === 'invite-answered' ||
    event.type === 'invite-canceled'
  ) {
    return describeInvite(event, actorName, new Date());
  }

  if (
    event.type === 'gift-sent' ||
    event.type === 'gift-delivered' ||
    event.type === 'gift-opened' ||
    event.type === 'gift-reacted' ||
    event.type === 'voucher-used'
  ) {
    return describeGift(event, actorName);
  }

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
    imageUrl: backdropUrl(series.backdropPath),
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
