import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { isUuid } from '../lib/ids';
import { isTimeZone } from '../lib/zonedTime';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { notify } from '../notifications/notify';
import { vapidPublicKey } from '../push/webPush';
import {
  isGiftOccasion,
  isGiftReaction,
  isGiftWrap,
  MESSAGE_MAX_LENGTH,
  parseDeliverAt,
  parseVouchers,
} from '../gifts/catalog';
import { findGroupGift, giftInclude, listGifts, toGiftDto } from '../gifts/gifts';

const router = Router();

// Folga contra um botão apertado sem parar: ninguém dá mais que isso de presentes num dia.
const DAILY_LIMIT = 20;

// A dupla de quem pediu e o par. Null: a pessoa não está num grupo.
async function coupleOf(userId: string) {
  const membership = await prisma.membroDoGrupo.findUnique({
    where: { usuarioId: userId },
    select: {
      grupo: { select: { id: true, membros: { select: { usuarioId: true } } } },
    },
  });
  if (!membership) return null;
  const { grupo } = membership;
  return {
    groupId: grupo.id,
    partnerId: grupo.membros.find((member) => member.usuarioId !== userId)?.usuarioId ?? null,
  };
}

// Os presentes da pessoa: os recebidos (já entregues) e os dados (inclusive os agendados).
router.get(
  '/gifts',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const couple = await coupleOf(userId);
    if (!couple) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }
    res.json(await listGifts(userId, couple.groupId, new Date()));
  }),
);

// Dá um presente para o par: entregue agora (`deliverAt: null`) ou numa hora marcada. Agendado,
// ele já aparece para o par na hora, trancado até `deliverAt`. `timeZone` (o fuso do celular)
// só serve para o push dizer "abre amanhã à meia-noite" na hora de vocês.
router.post(
  '/gifts',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();
    const { occasion, wrap, message, deliverAt, vouchers, timeZone } = (req.body ?? {}) as Record<
      string,
      unknown
    >;

    if (!isGiftOccasion(occasion)) {
      res.status(400).json({ error: 'occasion inválida' });
      return;
    }
    if (!isGiftWrap(wrap)) {
      res.status(400).json({ error: 'wrap inválido' });
      return;
    }
    const text = typeof message === 'string' ? message.trim() : '';
    if (text.length === 0 || text.length > MESSAGE_MAX_LENGTH) {
      res
        .status(400)
        .json({ error: `message deve ter entre 1 e ${MESSAGE_MAX_LENGTH} caracteres` });
      return;
    }
    const at = parseDeliverAt(deliverAt, now);
    if (at === undefined) {
      res
        .status(400)
        .json({ error: 'deliverAt deve ser null (agora) ou uma data dos próximos meses' });
      return;
    }
    const parsedVouchers = parseVouchers(vouchers);
    if (!parsedVouchers) {
      res.status(400).json({ error: 'vouchers inválidos: até 3, com texto curto' });
      return;
    }

    const couple = await coupleOf(userId);
    if (!couple) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }
    if (!couple.partnerId) {
      res.status(409).json({ error: 'Seu par ainda não entrou no grupo' });
      return;
    }
    const today = await prisma.presente.count({
      where: { deUsuarioId: userId, criadoEm: { gt: new Date(now.getTime() - 24 * 3600e3) } },
    });
    if (today >= DAILY_LIMIT) {
      res.status(429).json({ error: 'Muitos presentes por hoje. Guarde um pra amanhã!' });
      return;
    }

    const gift = await prisma.presente.create({
      data: {
        grupoId: couple.groupId,
        deUsuarioId: userId,
        paraUsuarioId: couple.partnerId,
        ocasiao: occasion,
        embrulho: wrap,
        mensagem: text,
        entregarEm: at ?? now,
        chaveVapid: vapidPublicKey,
        criadoEm: now,
        vales: {
          create: parsedVouchers.map((voucher, index) => ({
            texto: voucher.text,
            emoji: voucher.emoji,
            ordem: index,
          })),
        },
      },
      include: giftInclude,
    });

    res.status(201).json(toGiftDto(gift, now, userId));

    // Agendado: o par fica sabendo agora que tem presente (trancado); o relógio de entregas
    // avisa de novo quando ele destrancar.
    if (gift.entregarEm > now) {
      void notify({
        type: 'gift-sent',
        actorId: userId,
        giftId: gift.id,
        timeZone: isTimeZone(timeZone) ? timeZone : 'America/Sao_Paulo',
      });
      return;
    }

    // Entregue agora: o aviso sai já (marcado antes, como no relógio de entregas).
    {
      const claimed = await prisma.presente.updateMany({
        where: { id: gift.id, avisadoEm: null },
        data: { avisadoEm: now },
      });
      if (claimed.count === 1) {
        void notify({ type: 'gift-delivered', actorId: userId, giftId: gift.id });
      }
    }
  }),
);

// Desfaz um presente que ainda está trancado (o par vê ele sumir). Aberto para abrir, ele já
// é de quem recebeu.
router.delete(
  '/gifts/:giftId',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();
    const couple = await coupleOf(userId);
    const gift =
      couple && isUuid(req.params.giftId)
        ? await findGroupGift(req.params.giftId, userId, couple.groupId)
        : null;
    if (!gift || gift.deUsuarioId !== userId) {
      res.status(404).json({ error: 'Presente não encontrado' });
      return;
    }
    if (gift.entregarEm <= now) {
      res.status(409).json({ error: 'Esse presente já foi entregue' });
      return;
    }
    await prisma.presente.delete({ where: { id: gift.id } });
    res.status(204).end();
  }),
);

// O presente que veio para quem pediu (trancado ou não), ou null.
async function receivedGift(giftId: string, userId: string) {
  const couple = await coupleOf(userId);
  if (!couple || !isUuid(giftId)) return null;
  const gift = await findGroupGift(giftId, userId, couple.groupId);
  return gift && gift.paraUsuarioId === userId ? gift : null;
}

// Abriu o presente. Na primeira vez, quem deu fica sabendo ("abriu seu presente").
router.post(
  '/gifts/:giftId/open',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();
    const gift = await receivedGift(req.params.giftId, userId);
    if (!gift) {
      res.status(404).json({ error: 'Presente não encontrado' });
      return;
    }
    if (gift.entregarEm > now) {
      res.status(409).json({
        error: 'Esse presente ainda está trancado',
        deliverAt: gift.entregarEm.toISOString(),
      });
      return;
    }
    if (gift.abertoEm) {
      res.json(toGiftDto(gift, now, userId));
      return;
    }

    // Aberto antes do push da entrega sair: ele não sai mais.
    const opened = await prisma.presente.update({
      where: { id: gift.id },
      data: { abertoEm: now, avisadoEm: gift.avisadoEm ?? now },
      include: giftInclude,
    });
    res.json(toGiftDto(opened, now, userId));
    void notify({ type: 'gift-opened', actorId: userId, giftId: gift.id });
  }),
);

// Responde o presente com um emoji (dá para trocar). Quem deu recebe a reação.
router.post(
  '/gifts/:giftId/react',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();
    const { emoji } = (req.body ?? {}) as { emoji?: unknown };
    if (!isGiftReaction(emoji)) {
      res.status(400).json({ error: 'emoji deve ser uma das reações do app' });
      return;
    }
    const gift = await receivedGift(req.params.giftId, userId);
    if (!gift) {
      res.status(404).json({ error: 'Presente não encontrado' });
      return;
    }
    if (!gift.abertoEm) {
      res.status(409).json({ error: 'Abra o presente antes de reagir' });
      return;
    }
    if (gift.reacao === emoji) {
      res.json(toGiftDto(gift, now, userId));
      return;
    }

    const reacted = await prisma.presente.update({
      where: { id: gift.id },
      data: { reacao: emoji, reagidoEm: now },
      include: giftInclude,
    });
    res.json(toGiftDto(reacted, now, userId));
    void notify({ type: 'gift-reacted', actorId: userId, giftId: gift.id });
  }),
);

// Usa um vale: quem deu fica sabendo na hora, para cumprir. Um vale vale uma vez.
router.post(
  '/gifts/:giftId/vouchers/:voucherId/use',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();
    const gift = await receivedGift(req.params.giftId, userId);
    const voucher = gift?.vales.find((item) => item.id === req.params.voucherId);
    if (!gift || !voucher) {
      res.status(404).json({ error: 'Vale não encontrado' });
      return;
    }
    if (!gift.abertoEm) {
      res.status(409).json({ error: 'Abra o presente antes de usar o vale' });
      return;
    }
    if (voucher.usadoEm) {
      res.status(409).json({ error: 'Esse vale já foi usado' });
      return;
    }

    const claimed = await prisma.valePresente.updateMany({
      where: { id: voucher.id, usadoEm: null },
      data: { usadoEm: now },
    });
    const updated = await prisma.presente.findUniqueOrThrow({
      where: { id: gift.id },
      include: giftInclude,
    });
    res.json(toGiftDto(updated, now, userId));
    if (claimed.count === 1) {
      void notify({
        type: 'voucher-used',
        actorId: userId,
        giftId: gift.id,
        voucherId: voucher.id,
      });
    }
  }),
);

export default router;
