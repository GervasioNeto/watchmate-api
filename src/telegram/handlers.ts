import type { Bot } from 'grammy';
import { linkChat, pauseByChat } from './linking';

const WELCOME =
  'Oi! Eu sou o bot do WatchMate 🍿\n' +
  'Para receber avisos aqui, ligue "Avisos no Telegram" no seu perfil do WatchMate.';

const EXPIRED =
  'Esse link não vale mais. Abra o seu perfil no WatchMate e ligue os avisos de novo.';

const HELP =
  'Por enquanto eu só mando avisos: série nova na lista de vocês e episódio que seu par viu.\n' +
  'Para parar de receber, mande /parar.';

// Por enquanto o bot só conversa no privado: liga a conta e deixa pausar os avisos.
export function registerTelegramHandlers(bot: Bot): void {
  const privateChat = bot.chatType('private');

  // /start <código>: o link que o switch do app abre. Sem código, o bot só se apresenta.
  privateChat.command('start', async (ctx) => {
    const codigo = ctx.match.trim();
    if (!codigo) {
      await ctx.reply(WELCOME);
      return;
    }

    const user = await linkChat(codigo, String(ctx.chat.id), ctx.from?.username ?? null);
    if (!user) {
      await ctx.reply(EXPIRED);
      return;
    }

    const name = user.nome?.trim().split(/\s+/)[0];
    await ctx.reply(
      `Pronto${name ? `, ${name}` : ''}! ✅\n` +
        'Daqui pra frente você recebe aqui os avisos do WatchMate: série nova na lista de ' +
        'vocês e episódio que seu par viu.\n' +
        'Para parar, mande /parar ou desligue no seu perfil.',
    );
  });

  privateChat.command('parar', async (ctx) => {
    const paused = await pauseByChat(String(ctx.chat.id));
    await ctx.reply(
      paused
        ? 'Avisos pausados. Para voltar, ligue "Avisos no Telegram" no seu perfil do WatchMate.'
        : 'Você não tem avisos ligados por aqui.',
    );
  });

  privateChat.on('message', (ctx) => ctx.reply(HELP));

  // Um erro num comando só vai para o log: o bot continua respondendo os próximos.
  bot.catch((err) => console.error('Erro no bot do Telegram', err.error));
}
