import { randomBytes } from 'crypto';
import prisma from '../lib/prisma';
import { botUsername, isTelegramAvailable, isUnreachable, telegramBot } from './client';

// Quanto tempo o link de ligação vale depois que a pessoa liga o switch no app.
const LINK_CODE_TTL_MS = 15 * 60 * 1000;

// O switch de "Avisos no Telegram" no perfil:
// - unavailable: a API está sem bot (sem token), então o switch nem aparece;
// - off: nunca ligou (ou desligou a conta);
// - pending: ligou o switch e ainda não tocou em "Iniciar" no Telegram;
// - on: recebendo avisos;
// - paused: a conta está ligada, mas os avisos estão desligados (pelo app, pelo /parar
//   ou porque a pessoa bloqueou o bot).
export type TelegramStatus = 'unavailable' | 'off' | 'pending' | 'on' | 'paused';

export interface TelegramState {
  status: TelegramStatus;
  // O @ da pessoa no Telegram, quando a conta está ligada e ela tem um.
  username: string | null;
  // O @ do bot, sem a arroba (para o app mostrar e abrir a conversa com ele).
  botUsername: string | null;
  // Só enquanto espera o "Iniciar": o link que abre o bot com o código. Volta também no
  // GET, para o app conseguir abrir o Telegram de novo depois de recarregar a página.
  linkUrl?: string;
}

// Ficam fora das consultas por padrão (ver lib/prisma.ts): aqui são pedidos explicitamente.
const TELEGRAM_FIELDS = {
  telegramChatId: true,
  telegramUsername: true,
  avisosTelegram: true,
} as const;

function linkUrlFor(codigo: string): string {
  return `https://t.me/${botUsername}?start=${codigo}`;
}

export async function getTelegramState(userId: string): Promise<TelegramState> {
  if (!isTelegramAvailable()) return { status: 'unavailable', username: null, botUsername: null };

  const user = await prisma.usuario.findUniqueOrThrow({
    where: { id: userId },
    select: TELEGRAM_FIELDS,
  });
  if (user.telegramChatId) {
    return {
      status: user.avisosTelegram ? 'on' : 'paused',
      username: user.telegramUsername,
      botUsername,
    };
  }

  const pendingCode = await prisma.codigoTelegram.findFirst({
    where: { usuarioId: userId, expiraEm: { gt: new Date() } },
    orderBy: { expiraEm: 'desc' },
  });
  return pendingCode
    ? { status: 'pending', username: null, botUsername, linkUrl: linkUrlFor(pendingCode.codigo) }
    : { status: 'off', username: null, botUsername };
}

// Um código novo (os anteriores da pessoa deixam de valer) e o link que leva ao bot com
// ele. Aproveita para limpar os códigos vencidos de todo mundo.
async function createLinkUrl(userId: string): Promise<string> {
  const codigo = randomBytes(16).toString('base64url');
  await prisma.$transaction([
    prisma.codigoTelegram.deleteMany({
      where: { OR: [{ usuarioId: userId }, { expiraEm: { lt: new Date() } }] },
    }),
    prisma.codigoTelegram.create({
      data: { codigo, usuarioId: userId, expiraEm: new Date(Date.now() + LINK_CODE_TTL_MS) },
    }),
  ]);
  return linkUrlFor(codigo);
}

async function unlink(userId: string): Promise<void> {
  await prisma.usuario.update({
    where: { id: userId },
    data: { telegramChatId: null, telegramUsername: null, avisosTelegram: false },
  });
}

// Ligar os avisos pelo app. Com a conta já ligada, só religa, depois de confirmar com uma
// mensagem que o bot ainda consegue falar com a pessoa. Sem conta (ou se ela bloqueou o
// bot), começa a ligação: devolve o link para ela tocar em "Iniciar".
export async function turnOn(userId: string): Promise<TelegramState> {
  const user = await prisma.usuario.findUniqueOrThrow({
    where: { id: userId },
    select: TELEGRAM_FIELDS,
  });

  if (user.telegramChatId && telegramBot) {
    try {
      await telegramBot.api.sendMessage(
        user.telegramChatId,
        '🔔 Avisos do WatchMate ligados de novo.',
      );
      await prisma.usuario.update({ where: { id: userId }, data: { avisosTelegram: true } });
      return { status: 'on', username: user.telegramUsername, botUsername };
    } catch (err) {
      if (!isUnreachable(err)) throw err;
      await unlink(userId);
    }
  }

  return {
    status: 'pending',
    username: null,
    botUsername,
    linkUrl: await createLinkUrl(userId),
  };
}

// Desligar pelo app: a conta continua ligada (religar não precisa passar pelo Telegram de
// novo) e um link ainda não usado deixa de valer.
export async function turnOff(userId: string): Promise<TelegramState> {
  await prisma.$transaction([
    prisma.codigoTelegram.deleteMany({ where: { usuarioId: userId } }),
    prisma.usuario.update({ where: { id: userId }, data: { avisosTelegram: false } }),
  ]);
  return getTelegramState(userId);
}

// O /start com o código: liga a conversa à conta. Uma conta do Telegram fica ligada a um
// usuário só; se já estava em outro, sai de lá. Devolve o nome de quem ligou, ou null se
// o código não vale (não existe, já foi usado ou venceu).
export async function linkChat(
  codigo: string,
  chatId: string,
  username: string | null,
): Promise<{ nome: string | null } | null> {
  const code = await prisma.codigoTelegram.findUnique({ where: { codigo } });
  if (!code || code.expiraEm < new Date()) return null;

  const [, , user] = await prisma.$transaction([
    prisma.codigoTelegram.deleteMany({ where: { usuarioId: code.usuarioId } }),
    prisma.usuario.updateMany({
      where: { telegramChatId: chatId, NOT: { id: code.usuarioId } },
      data: { telegramChatId: null, telegramUsername: null, avisosTelegram: false },
    }),
    prisma.usuario.update({
      where: { id: code.usuarioId },
      data: { telegramChatId: chatId, telegramUsername: username, avisosTelegram: true },
      select: { nome: true },
    }),
  ]);
  return user;
}

export async function findUserByChat(chatId: string): Promise<{ id: string } | null> {
  return prisma.usuario.findUnique({ where: { telegramChatId: chatId }, select: { id: true } });
}

// O /parar: pausa os avisos de quem mandou. Devolve se havia uma conta ligada.
export async function pauseByChat(chatId: string): Promise<boolean> {
  const { count } = await prisma.usuario.updateMany({
    where: { telegramChatId: chatId },
    data: { avisosTelegram: false },
  });
  return count > 0;
}

// O Telegram recusou a mensagem (a pessoa bloqueou o bot): para de tentar.
export async function pauseUser(userId: string): Promise<void> {
  await prisma.usuario.update({ where: { id: userId }, data: { avisosTelegram: false } });
}
