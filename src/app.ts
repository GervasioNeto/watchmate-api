import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import prisma from './lib/prisma';
import groupsRouter from './routes/groups';
import meRouter from './routes/me';
import seriesRouter from './routes/series';
import telegramRouter from './routes/telegram';

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Para o monitor externo (UptimeRobot): além de acordar a API, faz uma leitura de verdade
// no banco, o que mantém o projeto do Supabase ativo (ele pausa depois de dias sem uso).
// Fica separada do /health para uma queda do banco não derrubar a checagem da API.
app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    await prisma.grupo.findFirst({ select: { id: true } });
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(503).json({ status: 'error' });
  }
});

app.use(meRouter);
app.use(groupsRouter);
app.use(seriesRouter);
app.use(telegramRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

export default app;
