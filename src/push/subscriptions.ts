import webpush, { WebPushError } from 'web-push';
import prisma from '../lib/prisma';
import { vapidPublicKey } from './webPush';

// A inscrição como o navegador entrega (PushSubscription.toJSON()).
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// O que o service worker do app recebe e mostra (ver public/sw.js no watchmate-web).
export interface PushMessage {
  title: string;
  body: string;
  // A tela do app que o toque no aviso abre.
  path: string;
  // Avisos com a mesma tag se substituem no celular em vez de empilhar.
  tag: string;
  image: string | null;
  // Substituir um aviso da mesma tag toca de novo (sem isso, troca em silêncio).
  renotify: boolean;
  // Botões no aviso (o Android mostra até dois; o iPhone, nenhum). Cada um abre `path`.
  actions: Array<{ action: string; title: string; path: string }>;
  // Avisos novos em "Entre vocês", para o número no ícone do app instalado. Null: não muda.
  badge: number | null;
}

// Só os serviços de push dos navegadores: a API manda requisições para o endpoint guardado,
// e um endereço qualquer viraria um jeito de usar o servidor contra outros sites.
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge no Android, Samsung Internet, Opera, Brave
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari e apps instalados no iPhone
  'notify.windows.com', // Edge no Windows
];

// Base64 de URL, como o navegador entrega as chaves do aparelho.
const KEY_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;
const MAX_ENDPOINT_LENGTH = 1024;
const MAX_KEY_LENGTH = 256;

// Um aviso que não chega em um dia já não interessa (o par já abriu o app e viu).
const TTL_SECONDS = 24 * 60 * 60;

function isPushServiceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      PUSH_SERVICE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    );
  } catch {
    return false;
  }
}

function isKey(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_KEY_LENGTH && KEY_PATTERN.test(value);
}

// Confere o corpo de POST /me/push-subscriptions. Null se não for uma inscrição válida.
export function parseSubscription(body: unknown): PushSubscriptionInput | null {
  const { endpoint, keys } = (body ?? {}) as { endpoint?: unknown; keys?: Record<string, unknown> };
  if (
    typeof endpoint !== 'string' ||
    endpoint.length > MAX_ENDPOINT_LENGTH ||
    !isPushServiceUrl(endpoint)
  ) {
    return null;
  }
  if (!keys || !isKey(keys.p256dh) || !isKey(keys.auth)) return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

// Guarda (ou atualiza) o aparelho. Se outra conta entrar no mesmo navegador e ligar os
// avisos, o aparelho passa a ser dela: um aparelho, uma pessoa.
export async function saveSubscription(userId: string, input: PushSubscriptionInput) {
  if (!vapidPublicKey) return;
  const data = {
    usuarioId: userId,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    chaveVapid: vapidPublicKey,
  };
  await prisma.inscricaoPush.upsert({
    where: { endpoint: input.endpoint },
    create: { endpoint: input.endpoint, ...data },
    update: data,
  });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await prisma.inscricaoPush.deleteMany({ where: { endpoint, usuarioId: userId } });
}

// Manda para todos os aparelhos da pessoa inscritos com a chave deste ambiente. Aparelho que
// cancelou ou cuja inscrição expirou (404/410) sai da lista; outros erros sobem para o log.
export async function sendToUser(userId: string, message: PushMessage): Promise<void> {
  if (!vapidPublicKey) return;
  const subscriptions = await prisma.inscricaoPush.findMany({
    where: { usuarioId: userId, chaveVapid: vapidPublicKey },
  });
  const payload = JSON.stringify(message);

  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          // `high`: chega na hora, mesmo com o celular em economia de bateria.
          { TTL: TTL_SECONDS, urgency: 'high' },
        );
      } catch (err) {
        if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
          await prisma.inscricaoPush.deleteMany({ where: { id: subscription.id } });
          return;
        }
        throw err;
      }
    }),
  );

  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => (failure as PromiseRejectedResult).reason),
      `${failures.length} de ${subscriptions.length} aparelhos não receberam o push`,
    );
  }
}
