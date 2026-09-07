import { randomInt } from 'crypto';

// Sem caracteres ambíguos (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
