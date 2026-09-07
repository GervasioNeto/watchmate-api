-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupos" (
    "id" UUID NOT NULL,
    "codigo_convite" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membros_do_grupo" (
    "id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "entrou_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membros_do_grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "series_acompanhadas" (
    "id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "tmdb_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "poster_path" TEXT,
    "adicionado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "series_acompanhadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progresso_episodios" (
    "id" UUID NOT NULL,
    "serie_acompanhada_id" UUID NOT NULL,
    "temporada" INTEGER NOT NULL,
    "episodio" INTEGER NOT NULL,
    "assistido_em" TIMESTAMP(3),
    "marcado_por" UUID,

    CONSTRAINT "progresso_episodios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "grupos_codigo_convite_key" ON "grupos"("codigo_convite");

-- CreateIndex
CREATE UNIQUE INDEX "membros_do_grupo_grupo_id_usuario_id_key" ON "membros_do_grupo"("grupo_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "series_acompanhadas_grupo_id_tmdb_id_key" ON "series_acompanhadas"("grupo_id", "tmdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "progresso_episodios_serie_acompanhada_id_temporada_episodio_key" ON "progresso_episodios"("serie_acompanhada_id", "temporada", "episodio");

-- AddForeignKey
ALTER TABLE "membros_do_grupo" ADD CONSTRAINT "membros_do_grupo_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_do_grupo" ADD CONSTRAINT "membros_do_grupo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_acompanhadas" ADD CONSTRAINT "series_acompanhadas_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progresso_episodios" ADD CONSTRAINT "progresso_episodios_serie_acompanhada_id_fkey" FOREIGN KEY ("serie_acompanhada_id") REFERENCES "series_acompanhadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progresso_episodios" ADD CONSTRAINT "progresso_episodios_marcado_por_fkey" FOREIGN KEY ("marcado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
