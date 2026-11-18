// Datas ditas em palavras no fuso de quem vai ler (o servidor roda em UTC). É o que os pushes
// usam: "hoje às 21h", "amanhã à meia-noite", "17 de dez. às 20h".

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

// Dias de calendário de `from` até `to` naquele fuso: amanhã é 1, ontem é -1.
export function calendarDaysBetween(from: Date, to: Date, timeZone: string): number {
  return Math.round(
    (Date.parse(calendarDay(to, timeZone)) - Date.parse(calendarDay(from, timeZone))) /
      (24 * 60 * 60 * 1000),
  );
}

// "às 21h", "às 21h30", "à 1h", "à meia-noite", "ao meio-dia".
export function atTime(date: Date, timeZone: string): string {
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

export function weekday(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, weekday: 'long' })
    .format(date)
    .replace('-feira', '');
}

// "17 de dez."
export function dayAndMonth(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, day: 'numeric', month: 'short' }).format(
    date,
  );
}
