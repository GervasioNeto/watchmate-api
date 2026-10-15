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

// O Telegram recusou falar com a pessoa (403). Os motivos:
// - ela bloqueou o bot, ou apagou a conta;
// - ela nunca tocou em "Iniciar" NESTE bot ("bot can't initiate conversation"). Acontece
//   quando um bot diferente usa o mesmo banco: o bot de testes da sua máquina tentando
//   falar com quem só conectou o bot de produção.
export function isUnreachable(err: unknown): boolean {
  return err instanceof GrammyError && err.error_code === 403;
}

// Só bloqueio ou conta apagada: aí, sim, é a pessoa que não recebe mais.
export function hasBlockedBot(err: unknown): boolean {
  return isUnreachable(err) && /blocked|deactivated/i.test((err as GrammyError).description);
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
