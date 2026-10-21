// As frases prontas que o convite pode levar. Só estas: o convite é um toque rápido, não
// uma mensagem (para conversar, tem o recado e os comentários). A lista do app é a mesma
// (ver src/lib/invites.ts no watchmate-web).
export const INVITE_PHRASES = [
  'Pipoca pronta 🍿',
  'Tô no sofá te esperando 🛋️',
  'Não vale ver sem mim 👀',
  'Preciso saber o que acontece 😭',
  'Só mais um, prometo',
] as const;

export function isInvitePhrase(value: unknown): value is (typeof INVITE_PHRASES)[number] {
  return typeof value === 'string' && (INVITE_PHRASES as readonly string[]).includes(value);
}
