import { InlineKeyboard } from 'grammy';
import { appLink, hasBlockedBot, isUnreachable, telegramBot } from '../../telegram/client';
import { pauseUser } from '../../telegram/linking';
import type { Notification, NotificationChannel, NotificationEventType } from '../types';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Negrito nos destaques; tudo passa pelo escape, porque nomes vêm das pessoas e do TMDB.
function toHtml(notification: Notification): string {
  return notification.parts
    .map((part) => (part.strong ? `<b>${escapeHtml(part.text)}</b>` : escapeHtml(part.text)))
    .join('');
}

// O botão que abre o app, quando há um endereço público para ele (ver appLink).
function toKeyboard({ link }: Notification): InlineKeyboard | undefined {
  const url = appLink(link.path);
  return url ? new InlineKeyboard().url(link.label, url) : undefined;
}

export const telegramChannel: NotificationChannel = {
  // Só o andamento da lista. Recados, comentários e reações ficam para o push do app: são
  // conversa entre vocês dois, e no Telegram virariam um bot falando demais.
  events: new Set<NotificationEventType>(['series-added', 'episode-watched', 'season-finished']),
  async send(recipient, notification) {
    if (!telegramBot || !recipient.avisosTelegram || !recipient.telegramChatId) return;
    try {
      await telegramBot.api.sendMessage(recipient.telegramChatId, toHtml(notification), {
        parse_mode: 'HTML',
        reply_markup: toKeyboard(notification),
      });
    } catch (err) {
      // A pessoa bloqueou o bot: os avisos dela se desligam, e o switch do app mostra isso.
      if (hasBlockedBot(err)) {
        await pauseUser(recipient.id);
        return;
      }
      // Este bot nunca falou com ela (ex.: o bot de testes, com o mesmo banco da produção):
      // pula o aviso sem mexer nos avisos dela, que valem para o outro bot.
      if (isUnreachable(err)) return;
      throw err;
    }
  },
};
