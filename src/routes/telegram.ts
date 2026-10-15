import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { authenticate } from '../middleware/auth';
import { telegramWebhook } from '../telegram/bot';
import { isTelegramAvailable } from '../telegram/client';
import { getTelegramState, turnOff, turnOn } from '../telegram/linking';

const router = Router();

// O switch "Avisos no Telegram" do perfil (os estados estão em telegram/linking.ts).
router.get(
  '/me/telegram',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await getTelegramState(req.user!.id));
  }),
);

// Ligar: com a conta já ligada, religa na hora; senão devolve o link (linkUrl) que o app
// abre para a pessoa tocar em "Iniciar" no Telegram.
router.post(
  '/me/telegram',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!isTelegramAvailable()) {
      res.status(503).json({ error: 'Avisos no Telegram indisponíveis' });
      return;
    }
    res.json(await turnOn(req.user!.id));
  }),
);

router.delete(
  '/me/telegram',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await turnOff(req.user!.id));
  }),
);

if (telegramWebhook) {
  router.post('/telegram/webhook', telegramWebhook);
}

export default router;
