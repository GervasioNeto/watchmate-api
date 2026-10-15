-- Avisos por push: os aparelhos que aceitaram receber (ver src/push). Tabela nova, nenhuma
-- linha existente muda.

-- CreateTable
CREATE TABLE "inscricoes_push" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "chave_vapid" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inscricoes_push_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inscricoes_push_endpoint_key" ON "inscricoes_push"("endpoint");

-- CreateIndex
CREATE INDEX "inscricoes_push_usuario_id_idx" ON "inscricoes_push"("usuario_id");

-- AddForeignKey
ALTER TABLE "inscricoes_push" ADD CONSTRAINT "inscricoes_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Segue o mesmo motivo das outras tabelas: bloqueia acesso via chave anon/authenticated do Supabase.
ALTER TABLE "inscricoes_push" ENABLE ROW LEVEL SECURITY;
