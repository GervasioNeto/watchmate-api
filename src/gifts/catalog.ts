// O que um presente pode ter. A lista do app é a mesma (ver src/lib/gifts.ts no
// watchmate-web): cada ocasião tem o seu título na hora de abrir, e cada embrulho, as cores.

export const GIFT_OCCASIONS = ['anniversary', 'valentines', 'just-because'] as const;
export type GiftOccasion = (typeof GIFT_OCCASIONS)[number];

export const GIFT_WRAPS = ['passion', 'flame', 'night'] as const;
export type GiftWrap = (typeof GIFT_WRAPS)[number];

// Como quem recebeu responde ao presente, depois de abrir.
export const GIFT_REACTIONS = ['❤️', '🥹', '😍', '😭', '🫶'] as const;

// O título do presente: é o que o aviso de "abriu" repete para quem deu.
export const OCCASION_HEADLINES: Record<GiftOccasion, string> = {
  anniversary: 'Feliz aniversário de namoro',
  valentines: 'Feliz Dia dos Namorados',
  'just-because': 'Um presentinho pra você',
};

export const MESSAGE_MAX_LENGTH = 600;
export const VOUCHER_TEXT_MAX_LENGTH = 60;
// Um emoji pode ter vários caracteres (o 🫶🏽 tem 4): o limite é folgado, só não deixa texto.
const VOUCHER_EMOJI_MAX_LENGTH = 16;
export const MAX_VOUCHERS = 3;
// Dá para deixar o presente pronto com bastante antecedência (o próximo aniversário).
export const MAX_SCHEDULE_AHEAD_MS = 400 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export function isGiftOccasion(value: unknown): value is GiftOccasion {
  return typeof value === 'string' && (GIFT_OCCASIONS as readonly string[]).includes(value);
}

export function isGiftWrap(value: unknown): value is GiftWrap {
  return typeof value === 'string' && (GIFT_WRAPS as readonly string[]).includes(value);
}

export function isGiftReaction(value: unknown): value is (typeof GIFT_REACTIONS)[number] {
  return typeof value === 'string' && (GIFT_REACTIONS as readonly string[]).includes(value);
}

export interface VoucherInput {
  text: string;
  emoji: string | null;
}

// Os vales que o app mandou: até três, cada um com um texto curto e um emoji opcional.
// Null: inválido.
export function parseVouchers(value: unknown): VoucherInput[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_VOUCHERS) return null;
  const vouchers: VoucherInput[] = [];
  for (const item of value) {
    const { text, emoji } = (item ?? {}) as { text?: unknown; emoji?: unknown };
    if (typeof text !== 'string') return null;
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (trimmed.length === 0 || trimmed.length > VOUCHER_TEXT_MAX_LENGTH) return null;
    if (emoji !== undefined && emoji !== null) {
      if (typeof emoji !== 'string' || emoji.length === 0) return null;
      if (emoji.length > VOUCHER_EMOJI_MAX_LENGTH || /[\p{L}\p{N}]/u.test(emoji)) return null;
    }
    vouchers.push({ text: trimmed, emoji: typeof emoji === 'string' ? emoji : null });
  }
  return vouchers;
}

// Quando entregar: null é agora; senão, uma data de agora até uns 13 meses. undefined: inválido.
export function parseDeliverAt(value: unknown, now: Date): Date | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const ahead = date.getTime() - now.getTime();
  if (ahead < -CLOCK_SKEW_MS || ahead > MAX_SCHEDULE_AHEAD_MS) return undefined;
  return date;
}
