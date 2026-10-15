-- Avisos no Telegram: a conversa de cada usuário com o bot e os códigos que ligam a conta.
-- Colunas novas opcionais ou com padrão: nenhuma linha existente muda.

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "telegram_chat_id" TEXT,
ADD COLUMN "telegram_username" TEXT,
ADD COLUMN "avisos_telegram" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "codigos_telegram" (
    "codigo" TEXT NOT NULL,
    "usuario_id" UUID NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "codigos_telegram_pkey" PRIMARY KEY ("codigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_telegram_chat_id_key" ON "usuarios"("telegram_chat_id");

-- AddForeignKey
ALTER TABLE "codigos_telegram" ADD CONSTRAINT "codigos_telegram_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Segue o mesmo motivo das outras tabelas: bloqueia acesso via chave anon/authenticated do Supabase.
ALTER TABLE "codigos_telegram" ENABLE ROW LEVEL SECURITY;
