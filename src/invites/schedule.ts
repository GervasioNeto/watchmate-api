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

// Um fuso do banco de fusos (IANA), como o navegador entrega: "America/Sao_Paulo".
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// O dia do calendário naquele fuso, como "2026-10-21".
function calendarDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000));
}

// "às 21h", "às 21h30", "à 1h", "à meia-noite", "ao meio-dia".
function atTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';

  if (minute === '00' && hour === 0) return 'à meia-noite';
  if (minute === '00' && hour === 12) return 'ao meio-dia';
  const time = minute === '00' ? `${hour}h` : `${hour}h${minute}`;
  return `${hour <= 1 ? 'à' : 'às'} ${time}`;
}

// Quando é a sessão, no fuso de quem chamou: "agora", "hoje às 21h", "amanhã às 20h30",
// "sábado às 21h". É o que o push diz; o app mostra no fuso do próprio celular.
export function describeInviteTime(at: Date | null, timeZone: string, now: Date): string {
  if (!at) return 'agora';
  const days = daysBetween(calendarDay(now, timeZone), calendarDay(at, timeZone));
  const time = atTime(at, timeZone);
  if (days === 0) return `hoje ${time}`;
  if (days === 1) return `amanhã ${time}`;
  if (days === -1) return `ontem ${time}`;
  const weekday = new Intl.DateTimeFormat('pt-BR', { timeZone, weekday: 'long' })
    .format(at)
    .replace('-feira', '');
  return `${weekday} ${time}`;
}
