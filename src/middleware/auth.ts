import { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { asyncHandler } from '../lib/asyncHandler';
import prisma from '../lib/prisma';

const supabaseUrl = process.env.SUPABASE_URL;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL não configurada');
}

const jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
const issuer = `${supabaseUrl}/auth/v1`;

export interface AuthenticatedUser {
  id: string;
  email: string;
}

async function authenticateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação ausente' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  let user: AuthenticatedUser;

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: 'authenticated',
    });

    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }

    user = { id: payload.sub, email: payload.email };
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
    return;
  }

  // Garante que existe uma linha em "usuarios" espelhando o usuário do
  // Supabase Auth antes de seguir, já que outras tabelas referenciam
  // usuarios.id via foreign key.
  await prisma.usuario.upsert({
    where: { id: user.id },
    update: {},
    create: { id: user.id, email: user.email },
  });

  req.user = user;
  next();
}

export const authenticate = asyncHandler(authenticateHandler);
