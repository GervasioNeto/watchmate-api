import { Bot, GrammyError } from 'grammy';

const token = process.env.TELEGRAM_BOT_TOKEN;

// O bot só existe com token. Sem ele, a API funciona normalmente, só sem avisos no
// Telegram (ex.: a develop publicada antes de ter um bot próprio).
export const telegramBot = token ? new Bot(token) : null;

// Usuário do bot, sem @, para montar o link t.me/<bot>?start=<código>.
export const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') || null;

export function isTelegramAvailable(): boolean {
  return telegramBot !== null && botUsername !== null;
}

// A pessoa bloqueou o bot (ou apagou a conta): o Telegram não deixa mais falar com ela.
export function isUnreachable(err: unknown): boolean {
  return err instanceof GrammyError && err.error_code === 403;
}

// Endereço público do app, para os botões "Ver no WatchMate". Sem um endereço público,
// esses botões ficam de fora: o Telegram não abre localhost.
const appUrl = (process.env.APP_URL || process.env.FRONTEND_URL?.split(',')[0] || '')
  .trim()
  .replace(/\/+$/, '');
const isPublicAppUrl = /^https:\/\//.test(appUrl) && !/localhost|127\.0\.0\.1/.test(appUrl);

export function appLink(path: string): string | null {
  return isPublicAppUrl ? `${appUrl}${path}` : null;
}
