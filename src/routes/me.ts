import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.usuario.findUniqueOrThrow({ where: { id: req.user!.id } });
    res.json(user);
  }),
);

export default router;
