import { InlineKeyboard } from 'grammy';
import { appLink, isUnreachable, telegramBot } from '../../telegram/client';
import { pauseUser } from '../../telegram/linking';
import type { Notification, NotificationChannel } from '../types';

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
  async send(recipient, notification) {
    if (!telegramBot || !recipient.avisosTelegram || !recipient.telegramChatId) return;
    try {
      await telegramBot.api.sendMessage(recipient.telegramChatId, toHtml(notification), {
        parse_mode: 'HTML',
        reply_markup: toKeyboard(notification),
      });
    } catch (err) {
      // A pessoa bloqueou o bot: os avisos dela se desligam, e o switch do app mostra isso.
      if (isUnreachable(err)) {
        await pauseUser(recipient.id);
        return;
      }
      throw err;
    }
  },
};
