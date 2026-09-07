import express, { Request, Response } from 'express';
import meRouter from './routes/me';

const app = express();

app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use(meRouter);

export default app;
