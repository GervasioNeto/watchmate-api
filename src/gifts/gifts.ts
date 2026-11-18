import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { atTime, calendarDaysBetween, dayAndMonth, weekday } from '../lib/zonedTime';
import { isGiftOccasion, isGiftWrap, type GiftOccasion, type GiftWrap } from './catalog';

export interface GiftVoucherDto {
  id: string;
  text: string;
  emoji: string | null;
  usedAt: string | null;
}

// O presente como o app recebe. Agendado, ele já aparece para quem vai receber, embrulhado e
// trancado até `deliverAt` (`delivered: false`), como presente debaixo da árvore: dá para ver
// que existe e quando abre, mas a carta e os vales só chegam na hora (antes, `message` é null
// e `vouchers` vem vazio para essa pessoa). Quem deu vê tudo, sempre.
export interface GiftDto {
  id: string;
  fromId: string;
  toId: string;
  occasion: GiftOccasion;
  wrap: GiftWrap;
  message: string | null;
  deliverAt: string;
  // Já pode abrir.
  delivered: boolean;
  openedAt: string | null;
  reaction: string | null;
  reactedAt: string | null;
  vouchers: GiftVoucherDto[];
  createdAt: string;
}

export const giftInclude = {
  vales: { orderBy: { ordem: 'asc' } },
} satisfies Prisma.PresenteInclude;

export type GiftWithVouchers = Prisma.PresenteGetPayload<{ include: typeof giftInclude }>;

export function toGiftDto(gift: GiftWithVouchers, now: Date, viewerId: string): GiftDto {
  const delivered = gift.entregarEm <= now;
  // Trancado, para quem vai receber: o que tem dentro fica para a hora de abrir.
  const sealed = !delivered && gift.paraUsuarioId === viewerId;
  return {
    id: gift.id,
    fromId: gift.deUsuarioId,
    toId: gift.paraUsuarioId,
    // Um valor que esta versão não conhece (de uma versão mais nova) vira o mais genérico.
    occasion: isGiftOccasion(gift.ocasiao) ? gift.ocasiao : 'just-because',
    wrap: isGiftWrap(gift.embrulho) ? gift.embrulho : 'passion',
    message: sealed ? null : gift.mensagem,
    deliverAt: gift.entregarEm.toISOString(),
    delivered,
    openedAt: gift.abertoEm?.toISOString() ?? null,
    reaction: gift.reacao,
    reactedAt: gift.reagidoEm?.toISOString() ?? null,
    vouchers: (sealed ? [] : gift.vales).map((voucher) => ({
      id: voucher.id,
      text: voucher.texto,
      emoji: voucher.emoji,
      usedAt: voucher.usadoEm?.toISOString() ?? null,
    })),
    createdAt: gift.criadoEm.toISOString(),
  };
}

// Os presentes da pessoa na dupla de agora, recebidos (inclusive os trancados) e dados, do
// que abre por último para o que abriu primeiro.
export async function listGifts(userId: string, groupId: string, now: Date) {
  const [received, sent] = await Promise.all([
    prisma.presente.findMany({
      where: { grupoId: groupId, paraUsuarioId: userId },
      orderBy: { entregarEm: 'desc' },
      include: giftInclude,
    }),
    prisma.presente.findMany({
      where: { grupoId: groupId, deUsuarioId: userId },
      orderBy: { entregarEm: 'desc' },
      include: giftInclude,
    }),
  ]);
  return {
    received: received.map((gift) => toGiftDto(gift, now, userId)),
    sent: sent.map((gift) => toGiftDto(gift, now, userId)),
  };
}

// O presente, se ele é da dupla de quem pediu e foi essa pessoa que deu ou recebeu. Null em
// qualquer outro caso.
export async function findGroupGift(giftId: string, userId: string, groupId: string) {
  const gift = await prisma.presente.findUnique({ where: { id: giftId }, include: giftInclude });
  if (!gift || gift.grupoId !== groupId) return null;
  return gift.deUsuarioId === userId || gift.paraUsuarioId === userId ? gift : null;
}

// Quando o presente abre, no fuso de quem deu: "hoje às 21h", "amanhã à meia-noite",
// "sábado às 20h", "dia 17 de dez. à meia-noite". É o que o push do presente trancado diz.
export function describeOpening(at: Date, timeZone: string, now: Date): string {
  const days = calendarDaysBetween(now, at, timeZone);
  const time = atTime(at, timeZone);
  if (days <= 0) return `hoje ${time}`;
  if (days === 1) return `amanhã ${time}`;
  if (days < 7) return `${weekday(at, timeZone)} ${time}`;
  return `dia ${dayAndMonth(at, timeZone)} ${time}`;
}
