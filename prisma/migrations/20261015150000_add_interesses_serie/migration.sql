-- "Quero ver": cada membro marca as séries da fila que quer começar.

-- CreateTable
CREATE TABLE "interesses_serie" (
    "id" UUID NOT NULL,
    "serie_acompanhada_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interesses_serie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interesses_serie_serie_acompanhada_id_usuario_id_key" ON "interesses_serie"("serie_acompanhada_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "interesses_serie" ADD CONSTRAINT "interesses_serie_serie_acompanhada_id_fkey" FOREIGN KEY ("serie_acompanhada_id") REFERENCES "series_acompanhadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interesses_serie" ADD CONSTRAINT "interesses_serie_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Segue o mesmo motivo das outras tabelas: bloqueia acesso via chave anon/authenticated do Supabase.
ALTER TABLE "interesses_serie" ENABLE ROW LEVEL SECURITY;
