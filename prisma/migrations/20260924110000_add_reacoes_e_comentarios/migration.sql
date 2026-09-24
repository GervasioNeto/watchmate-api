-- CreateTable
CREATE TABLE "reacoes_episodio" (
    "id" UUID NOT NULL,
    "serie_acompanhada_id" UUID NOT NULL,
    "temporada" INTEGER NOT NULL,
    "episodio" INTEGER NOT NULL,
    "usuario_id" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reacoes_episodio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comentarios_episodio" (
    "id" UUID NOT NULL,
    "serie_acompanhada_id" UUID NOT NULL,
    "temporada" INTEGER NOT NULL,
    "episodio" INTEGER NOT NULL,
    "usuario_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_episodio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reacoes_episodio_serie_acompanhada_id_temporada_episodio_u_key" ON "reacoes_episodio"("serie_acompanhada_id", "temporada", "episodio", "usuario_id");

-- AddForeignKey
ALTER TABLE "reacoes_episodio" ADD CONSTRAINT "reacoes_episodio_serie_acompanhada_id_fkey" FOREIGN KEY ("serie_acompanhada_id") REFERENCES "series_acompanhadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reacoes_episodio" ADD CONSTRAINT "reacoes_episodio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_episodio" ADD CONSTRAINT "comentarios_episodio_serie_acompanhada_id_fkey" FOREIGN KEY ("serie_acompanhada_id") REFERENCES "series_acompanhadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_episodio" ADD CONSTRAINT "comentarios_episodio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Segue o mesmo motivo das outras tabelas: bloqueia acesso via chave anon/authenticated do Supabase.
ALTER TABLE "reacoes_episodio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comentarios_episodio" ENABLE ROW LEVEL SECURITY;
