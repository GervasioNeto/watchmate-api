import { atTime, calendarDaysBetween, weekday } from '../lib/zonedTime';

// Os horários de um convite (ver ConviteSessao no schema).

// O convite vale até 3h depois da hora marcada (ou de quando foi feito, se é "agora"):
// depois disso a sessão já passou, e ele sai do topo da lista.
export const INVITE_TTL_MS = 3 * 60 * 60 * 1000;
// No máximo para daqui a 2 dias: o convite é "hoje à noite", não uma agenda.
const MAX_AHEAD_MS = 48 * 60 * 60 * 1000;
// Folga para o relógio do celular um pouco diferente do relógio do servidor.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export function inviteExpiresAt(at: Date | null, createdAt: Date): Date {
  return new Date((at ?? createdAt).getTime() + INVITE_TTL_MS);
}

// O horário que o app mandou: null é "agora"; senão, uma data ISO de agora até 2 dias.
// undefined: inválido.
export function parseInviteTime(value: unknown, now: Date): Date | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const ahead = date.getTime() - now.getTime();
  if (ahead < -CLOCK_SKEW_MS || ahead > MAX_AHEAD_MS) return undefined;
  return date;
}

// Quando é a sessão, no fuso de quem chamou: "agora", "hoje às 21h", "amanhã às 20h30",
// "sábado às 21h". É o que o push diz; o app mostra no fuso do próprio celular.
export function describeInviteTime(at: Date | null, timeZone: string, now: Date): string {
  if (!at) return 'agora';
  const days = calendarDaysBetween(now, at, timeZone);
  const time = atTime(at, timeZone);
  if (days === 0) return `hoje ${time}`;
  if (days === 1) return `amanhã ${time}`;
  if (days === -1) return `ontem ${time}`;
  return `${weekday(at, timeZone)} ${time}`;
}
