import { isGiftOccasion, isGiftWrap, type GiftOccasion, type GiftWrap } from '../gifts/catalog';
import prisma from '../lib/prisma';

// O presente, resumido, dentro de um aviso de "Entre vocês".
export interface InboxGift {
  id: string;
  occasion: GiftOccasion;
  wrap: GiftWrap;
  openedAt: string | null;
  reaction: string | null;
  // Quando abre. Trancado (agendado, a hora ainda não chegou): `locked`.
  opensAt: string;
  locked: boolean;
}

export interface GiftInboxEvent {
  // Único na lista, mesmo com vários avisos do mesmo presente.
  id: string;
  type: 'gift' | 'gift-opened' | 'voucher-used';
  actorId: string;
  at: Date;
  gift: InboxGift;
  // O vale usado ("Vale uma maratona com pipoca") e o emoji dele, ou a reação ao presente.
  text: string | null;
  emoji: string | null;
}

function summary(
  gift: {
    id: string;
    ocasiao: string;
    embrulho: string;
    entregarEm: Date;
    abertoEm: Date | null;
    reacao: string | null;
  },
  now: Date,
): InboxGift {
  return {
    id: gift.id,
    occasion: isGiftOccasion(gift.ocasiao) ? gift.ocasiao : 'just-because',
    wrap: isGiftWrap(gift.embrulho) ? gift.embrulho : 'passion',
    openedAt: gift.abertoEm?.toISOString() ?? null,
    reaction: gift.reacao,
    opensAt: gift.entregarEm.toISOString(),
    locked: gift.entregarEm > now,
  };
}

// Os presentes não viram aviso guardado: saem direto da tabela de presentes, com a hora de
// cada coisa que aconteceu (assim nenhum tipo novo de aviso entra no banco, que é o mesmo para
// as versões da API rodando juntas). Desde `since`:
// - chegou um presente para você: na hora em que foi dado (trancado, se for agendado) e de
//   novo quando ele destranca, que sobe o mesmo aviso como novo;
// - o seu foi aberto (ou ganhou reação, que sobe o mesmo aviso);
// - usaram um vale do seu presente.
export async function listGiftInboxEvents(
  userId: string,
  members: string[],
  since: Date,
  now: Date,
): Promise<GiftInboxEvent[]> {
  const [received, sent] = await Promise.all([
    prisma.presente.findMany({
      where: {
        paraUsuarioId: userId,
        deUsuarioId: { in: members },
        OR: [{ criadoEm: { gt: since } }, { entregarEm: { gt: since, lte: now } }],
      },
      select: {
        id: true,
        deUsuarioId: true,
        ocasiao: true,
        embrulho: true,
        criadoEm: true,
        entregarEm: true,
        abertoEm: true,
        reacao: true,
      },
    }),
    prisma.presente.findMany({
      where: {
        deUsuarioId: userId,
        paraUsuarioId: { in: members },
        OR: [
          { abertoEm: { gt: since } },
          { reagidoEm: { gt: since } },
          { vales: { some: { usadoEm: { gt: since } } } },
        ],
      },
      select: {
        id: true,
        paraUsuarioId: true,
        ocasiao: true,
        embrulho: true,
        entregarEm: true,
        abertoEm: true,
        reacao: true,
        reagidoEm: true,
        vales: {
          where: { usadoEm: { gt: since } },
          select: { id: true, texto: true, emoji: true, usadoEm: true },
        },
      },
    }),
  ]);

  const events: GiftInboxEvent[] = received.flatMap((gift) => {
    // Trancado: o aviso é de quando foi dado. Destrancado: de quando destrancou.
    const at = gift.entregarEm <= now ? gift.entregarEm : gift.criadoEm;
    if (at <= since) return [];
    return [
      {
        id: `gift:${gift.id}`,
        type: 'gift',
        actorId: gift.deUsuarioId,
        at,
        gift: summary(gift, now),
        text: null,
        emoji: null,
      },
    ];
  });

  for (const gift of sent) {
    const openedAt = [gift.abertoEm, gift.reagidoEm]
      .filter((date): date is Date => date !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (gift.abertoEm && openedAt && openedAt > since) {
      events.push({
        id: `gift-opened:${gift.id}`,
        type: 'gift-opened',
        actorId: gift.paraUsuarioId,
        at: openedAt,
        gift: summary(gift, now),
        text: null,
        emoji: gift.reacao,
      });
    }
    for (const voucher of gift.vales) {
      if (!voucher.usadoEm) continue;
      events.push({
        id: `voucher:${voucher.id}`,
        type: 'voucher-used',
        actorId: gift.paraUsuarioId,
        at: voucher.usadoEm,
        gift: summary(gift, now),
        text: voucher.texto,
        emoji: voucher.emoji,
      });
    }
  }
  return events;
}
