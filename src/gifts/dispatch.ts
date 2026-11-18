import prisma from '../lib/prisma';
import { notify } from '../notifications/notify';
import { vapidPublicKey } from '../push/webPush';

// De quanto em quanto tempo a API olha se chegou a hora de algum presente. A surpresa em si
// não depende disto: o app procura presentes entregues sempre que abre. Isto é só o push
// "deixou um presente pra você", na hora marcada (a meia-noite do aniversário).
const DISPATCH_INTERVAL_MS = 60 * 1000;
const BATCH = 20;

// Manda o push dos presentes que chegaram na hora e ainda não foram avisados. Só os criados
// neste ambiente (pela chave VAPID): o banco é um só para a sua máquina, a develop e a main,
// e cada ambiente só alcança os aparelhos inscritos com a própria chave. Já aberto não
// precisa de aviso. "Pegar" o presente marcando `avisadoEm` antes de avisar garante um aviso
// só, mesmo com duas instâncias rodando juntas.
export async function dispatchDueGifts(now = new Date()): Promise<void> {
  if (!vapidPublicKey) return;
  const due = await prisma.presente.findMany({
    where: {
      entregarEm: { lte: now },
      avisadoEm: null,
      abertoEm: null,
      chaveVapid: vapidPublicKey,
    },
    orderBy: { entregarEm: 'asc' },
    take: BATCH,
    select: { id: true, deUsuarioId: true },
  });

  for (const gift of due) {
    const claimed = await prisma.presente.updateMany({
      where: { id: gift.id, avisadoEm: null },
      data: { avisadoEm: now },
    });
    if (claimed.count === 1) {
      await notify({ type: 'gift-delivered', actorId: gift.deUsuarioId, giftId: gift.id });
    }
  }
}

// Liga o relógio dos presentes junto com o servidor (ver server.ts). Um erro numa rodada vai
// para o log e a próxima tenta de novo.
export function startGiftDispatcher(): void {
  const run = () =>
    dispatchDueGifts().catch((err) => console.error('Não foi possível entregar presentes', err));
  void run();
  setInterval(run, DISPATCH_INTERVAL_MS).unref();
}
