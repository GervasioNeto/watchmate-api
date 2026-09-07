import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/me', authenticate, async (req, res) => {
  const usuarioToken = req.usuario!;

  const usuario = await prisma.usuario.upsert({
    where: { id: usuarioToken.id },
    update: {},
    create: { id: usuarioToken.id, email: usuarioToken.email },
  });

  res.json(usuario);
});

export default router;
