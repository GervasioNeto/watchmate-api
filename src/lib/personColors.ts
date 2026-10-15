// A paleta de cores de pessoa: cada membro escolhe a sua (PATCH /groups/me/color).
// Os ids precisam ser os mesmos de PERSON_COLORS no app (watchmate-web,
// src/lib/personTone.ts): a API só guarda o id, quem desenha a cor é o app.
export const PERSON_COLOR_IDS = [
  'raspberry',
  'bubblegum',
  'cotton',
  'magenta',
  'lilac',
  'violet',
  'indigo',
  'blue',
  'sky',
  'turquoise',
  'mint',
  'green',
  'lime',
  'lemon',
  'amber',
] as const;

export type PersonColor = (typeof PERSON_COLOR_IDS)[number];

// As cores com que cada um começa, pela ordem de entrada no grupo: roxo para quem cria,
// âmbar para quem entra depois (as cores que o app sempre usou).
const DEFAULT_COLORS: readonly PersonColor[] = ['violet', 'amber'];

export function isPersonColor(value: unknown): value is PersonColor {
  return typeof value === 'string' && (PERSON_COLOR_IDS as readonly string[]).includes(value);
}

// A cor de quem está entrando: a primeira padrão que ninguém do grupo usa; se as duas
// estiverem tomadas (o par escolheu âmbar, por exemplo), a primeira livre da paleta.
// Membros sem cor (criados por uma API anterior) não ocupam nenhuma.
export function pickFreeColor(taken: Array<string | null>): PersonColor {
  const free = (color: PersonColor) => !taken.includes(color);
  return DEFAULT_COLORS.find(free) ?? PERSON_COLOR_IDS.find(free) ?? DEFAULT_COLORS[0];
}
