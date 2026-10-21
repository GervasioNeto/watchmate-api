import { PrismaClient } from '@prisma/client';

// Os campos do Telegram ficam fora de toda consulta por padrão: várias rotas devolvem o
// usuário inteiro (inclusive o do par, em /me), e o id da conversa no Telegram não deve
// sair por elas. Quem precisa deles (src/telegram, src/notifications) pede com `select`.
// `avisosVistosEm` vai junto pelo mesmo motivo: é da pessoa, não do par (ver src/inbox).
const prisma = new PrismaClient({
  omit: {
    usuario: {
      telegramChatId: true,
      telegramUsername: true,
      avisosTelegram: true,
      avisosVistosEm: true,
    },
  },
});

export default prisma;
