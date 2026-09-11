import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import groupsRouter from './routes/groups';
import meRouter from './routes/me';
import seriesRouter from './routes/series';

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use(meRouter);
app.use(groupsRouter);
app.use(seriesRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

export default app;
