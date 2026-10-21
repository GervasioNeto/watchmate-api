import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { getUserGroupId } from '../lib/groupMembership';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { notify } from '../notifications/notify';
import {
  answerInvite,
  cancelInvite,
  createInvite,
  findActiveInvite,
  inviteInclude,
  isLive,
  toInviteDto,
} from '../invites/invites';
import { isInvitePhrase } from '../invites/phrases';
import { isTimeZone, parseInviteTime } from '../invites/schedule';

const router = Router();

// Um convite por vez a cada tanto: o push toca no celular do par, e tocar "Bora?" várias
// vezes seguidas não pode virar um alarme.
const COOLDOWN_MS = 30 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isEpisodeNumber(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;
}

// O convite do momento da dupla (o ingresso no topo da lista), ou null.
router.get(
  '/invites/active',
  authenticate,
  asyncHandler(async (req, res) => {
    const groupId = await getUserGroupId(req.user!.id);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }
    res.json(await findActiveInvite(groupId, new Date()));
  }),
);

// "Bora?": chama o par para ver um episódio, agora (`at: null`) ou num horário. Substitui o
// convite anterior da dupla, se houver.
router.post(
  '/invites',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();
    const { seriesId, season, episode, at, timeZone, phrase } = (req.body ?? {}) as Record<
      string,
      unknown
    >;

    if (typeof seriesId !== 'string' || !UUID_PATTERN.test(seriesId)) {
      res.status(400).json({ error: 'seriesId inválido' });
      return;
    }
    if (!isEpisodeNumber(season, 1000) || !isEpisodeNumber(episode, 10000)) {
      res.status(400).json({ error: 'season e episode devem ser inteiros positivos' });
      return;
    }
    const time = parseInviteTime(at, now);
    if (time === undefined) {
      res.status(400).json({ error: 'at deve ser null (agora) ou um horário dos próximos 2 dias' });
      return;
    }
    if (!isTimeZone(timeZone)) {
      res.status(400).json({ error: 'timeZone inválido' });
      return;
    }
    if (phrase !== undefined && phrase !== null && !isInvitePhrase(phrase)) {
      res.status(400).json({ error: 'phrase deve ser uma das frases do app' });
      return;
    }

    const groupId = await getUserGroupId(userId);
    if (!groupId) {
      res.status(404).json({ error: 'Você não faz parte de nenhum grupo' });
      return;
    }

    const [series, partner, recent] = await Promise.all([
      prisma.serieAcompanhada.findUnique({ where: { id: seriesId }, select: { grupoId: true } }),
      prisma.membroDoGrupo.findFirst({
        where: { grupoId: groupId, usuarioId: { not: userId } },
        select: { usuarioId: true },
      }),
      prisma.conviteSessao.findFirst({
        where: { deUsuarioId: userId, criadoEm: { gt: new Date(now.getTime() - COOLDOWN_MS) } },
        select: { id: true },
      }),
    ]);

    if (!series || series.grupoId !== groupId) {
      res.status(404).json({ error: 'Série não encontrada' });
      return;
    }
    if (!partner) {
      res.status(409).json({ error: 'Seu par ainda não entrou no grupo' });
      return;
    }
    if (recent) {
      res.status(429).json({ error: 'Você acabou de chamar. Espere um pouquinho.' });
      return;
    }

    const invite = await createInvite(
      {
        groupId,
        seriesId,
        season,
        episode,
        fromId: userId,
        toId: partner.usuarioId,
        at: time,
        timeZone,
        phrase: isInvitePhrase(phrase) ? phrase : null,
      },
      now,
    );

    res.status(201).json(await toInviteDto(invite, now));
    void notify({ type: 'invite-sent', actorId: userId, inviteId: invite.id });
  }),
);

// Carrega o convite se ele é da dupla de quem pediu. Null: não existe para essa pessoa.
async function findGroupInvite(inviteId: string, userId: string) {
  if (!UUID_PATTERN.test(inviteId)) return null;
  const [groupId, invite] = await Promise.all([
    getUserGroupId(userId),
    prisma.conviteSessao.findUnique({ where: { id: inviteId }, include: inviteInclude }),
  ]);
  return invite && groupId && invite.grupoId === groupId ? invite : null;
}

// Responde um convite que chegou: `answer: 'accept'` (com `at` para outro horário, ou sem,
// no combinado) ou `'decline'`. Já respondido ou fora do prazo: 409 com o convite como está.
router.post(
  '/invites/:inviteId/answer',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();
    const { answer, at } = (req.body ?? {}) as { answer?: unknown; at?: unknown };

    if (answer !== 'accept' && answer !== 'decline') {
      res.status(400).json({ error: "answer deve ser 'accept' ou 'decline'" });
      return;
    }
    const time = at === undefined ? undefined : parseInviteTime(at, now);
    if (at !== undefined && time === undefined) {
      res.status(400).json({ error: 'at deve ser null (agora) ou um horário dos próximos 2 dias' });
      return;
    }

    const invite = await findGroupInvite(req.params.inviteId, userId);
    if (!invite) {
      res.status(404).json({ error: 'Convite não encontrado' });
      return;
    }
    if (invite.paraUsuarioId !== userId) {
      res.status(403).json({ error: 'Só quem foi chamado responde o convite' });
      return;
    }
    if (invite.status !== 'PENDENTE' || !isLive(invite, now)) {
      res.status(409).json({
        error: 'Esse convite não espera mais resposta',
        invite: await toInviteDto(invite, now),
      });
      return;
    }

    const answered = await answerInvite(
      invite,
      answer === 'accept' ? { accept: true, at: time } : { accept: false },
      now,
    );
    res.json(await toInviteDto(answered, now));
    void notify({ type: 'invite-answered', actorId: userId, inviteId: invite.id });
  }),
);

// Desfaz um convite que ainda vale: quem chamou cancela o seu (esperando ou aceito); quem
// foi chamado só desiste depois de aceitar (antes disso, ele recusa).
router.post(
  '/invites/:inviteId/cancel',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();

    const invite = await findGroupInvite(req.params.inviteId, userId);
    if (!invite) {
      res.status(404).json({ error: 'Convite não encontrado' });
      return;
    }
    const isSender = invite.deUsuarioId === userId;
    const isRecipient = invite.paraUsuarioId === userId;
    if (!isSender && !(isRecipient && invite.status === 'ACEITO')) {
      res.status(403).json({ error: 'Você não pode cancelar esse convite' });
      return;
    }
    if (!isLive(invite, now)) {
      res.status(409).json({
        error: 'Esse convite já não vale mais',
        invite: await toInviteDto(invite, now),
      });
      return;
    }

    const canceled = await cancelInvite(invite);
    res.json(await toInviteDto(canceled, now));
    void notify({ type: 'invite-canceled', actorId: userId, inviteId: invite.id });
  }),
);

export default router;
