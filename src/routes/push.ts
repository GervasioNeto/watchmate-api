import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { authenticate } from '../middleware/auth';
import { parseSubscription, removeSubscription, saveSubscription } from '../push/subscriptions';
import { isPushAvailable, vapidPublicKey } from '../push/webPush';

const router = Router();

// A chave com que o app inscreve o aparelho. `publicKey: null`: a API está sem push, e o app
// esconde a opção (como o Telegram sem bot).
router.get('/push/public-key', (_req, res) => {
  res.json({ publicKey: vapidPublicKey });
});

// Liga os avisos neste aparelho: o app manda a inscrição que o navegador criou. Mandar de
// novo a mesma é seguro (o app faz isso ao abrir, para a API nunca ficar com uma antiga).
router.post(
  '/me/push-subscriptions',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!isPushAvailable()) {
      res.status(503).json({ error: 'Avisos por push indisponíveis' });
      return;
    }
    const subscription = parseSubscription(req.body);
    if (!subscription) {
      res.status(400).json({ error: 'Inscrição de push inválida' });
      return;
    }
    await saveSubscription(req.user!.id, subscription);
    res.status(204).end();
  }),
);

// Desliga os avisos neste aparelho. Só apaga se o aparelho for de quem pediu.
router.delete(
  '/me/push-subscriptions',
  authenticate,
  asyncHandler(async (req, res) => {
    const { endpoint } = (req.body ?? {}) as { endpoint?: unknown };
    if (typeof endpoint !== 'string' || endpoint.length === 0) {
      res.status(400).json({ error: 'endpoint é obrigatório' });
      return;
    }
    await removeSubscription(req.user!.id, endpoint);
    res.status(204).end();
  }),
);

export default router;
