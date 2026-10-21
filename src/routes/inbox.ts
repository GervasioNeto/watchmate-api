import { Router } from 'express';
import { countUnseen, listInbox, markInboxSeen } from '../inbox/read';
import { asyncHandler } from '../lib/asyncHandler';
import { authenticate } from '../middleware/auth';

const router = Router();

// "Entre vocês": os avisos dos últimos 30 dias, do mais recente para o mais antigo.
router.get(
  '/me/inbox',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ items: await listInbox(req.user!.id, new Date()) });
  }),
);

// Só a contagem, para o pontinho no ícone: leve o bastante para o app buscar sempre que
// volta para a tela.
router.get(
  '/me/inbox/unseen',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ unseen: await countUnseen(req.user!.id) });
  }),
);

// A pessoa abriu a tela: o que chegou até agora deixa de ser novo.
router.post(
  '/me/inbox/seen',
  authenticate,
  asyncHandler(async (req, res) => {
    await markInboxSeen(req.user!.id, new Date());
    res.status(204).end();
  }),
);

export default router;
