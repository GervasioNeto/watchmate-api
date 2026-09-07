import { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const supabaseUrl = process.env.SUPABASE_URL;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL não configurada');
}

const jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
const issuer = `${supabaseUrl}/auth/v1`;

export interface UsuarioAutenticado {
  id: string;
  email: string;
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação ausente' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: 'authenticated',
    });

    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }

    req.usuario = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}
