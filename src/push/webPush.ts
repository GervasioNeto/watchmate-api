import webpush from 'web-push';

// Avisos por push (Web Push com chaves VAPID). Sem as três variáveis, a API funciona
// normalmente, só sem push: o app esconde a opção. Cada ambiente que roda ao mesmo tempo
// (sua máquina, develop, main) usa o seu par de chaves (ver InscricaoPush.chaveVapid).
function configure(): string | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return publicKey;
  } catch (err) {
    // Chave mal copiada ou contato fora do formato: a API sobe mesmo assim, sem push.
    console.error('Configuração VAPID inválida: avisos por push desligados', err);
    return null;
  }
}

// A chave que o app usa para inscrever o aparelho. Null: a API está sem push.
export const vapidPublicKey = configure();

export function isPushAvailable(): boolean {
  return vapidPublicKey !== null;
}
