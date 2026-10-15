-- Documentação do schema do banco de dados do WatchMate.
--
-- Gerado a partir de prisma/schema.prisma com:
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
--
-- Este arquivo é só para referência/leitura. As migrations reais ficam em
-- prisma/migrations/ e são aplicadas via `npx prisma migrate dev` /
-- `npx prisma migrate deploy` — não rode este arquivo diretamente.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ModoAcompanhamento" AS ENUM ('JUNTOS', 'SEPARADOS');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT,
    "avatar_estilo" TEXT,
    "avatar_semente" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupos" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL DEFAULT 'Nosso Grupo',
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
    "recado" TEXT,
    "recado_em" TIMESTAMP(3),

    CONSTRAINT "membros_do_grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "series_acompanhadas" (
    "id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "modo" "ModoAcompanhamento" NOT NULL DEFAULT 'JUNTOS',
    "tmdb_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "poster_path" TEXT,
    "temporadas" JSONB NOT NULL,
    "sinopse" TEXT,
    "nota_media" DOUBLE PRECISION,
    "status" TEXT,
    "backdrop_path" TEXT,
    "generos" TEXT[],
    "primeira_exibicao_em" TIMESTAMP(3),
    "idioma_original" TEXT,
    "nome_original" TEXT,
    "english_name" TEXT,
    "adicionado_por" UUID,
    "adicionado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "series_acompanhadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progresso_episodios" (
    "id" UUID NOT NULL,
    "serie_acompanhada_id" UUID NOT NULL,
    "temporada" INTEGER NOT NULL,
    "episodio" INTEGER NOT NULL,
    "usuario_id" UUID NOT NULL,
    "assistido_em" TIMESTAMP(3) NOT NULL,
    "marcado_por" UUID,
    "juntos" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "progresso_episodios_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "grupos_codigo_convite_key" ON "grupos"("codigo_convite");

-- CreateIndex
CREATE UNIQUE INDEX "membros_do_grupo_usuario_id_key" ON "membros_do_grupo"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "series_acompanhadas_grupo_id_tmdb_id_key" ON "series_acompanhadas"("grupo_id", "tmdb_id");

-- CreateIndex
CREATE UNIQUE INDEX "progresso_episodios_serie_acompanhada_id_usuario_id_tempora_key" ON "progresso_episodios"("serie_acompanhada_id", "usuario_id", "temporada", "episodio");

-- CreateIndex
CREATE UNIQUE INDEX "reacoes_episodio_serie_acompanhada_id_temporada_episodio_us_key" ON "reacoes_episodio"("serie_acompanhada_id", "temporada", "episodio", "usuario_id");

-- AddForeignKey
ALTER TABLE "membros_do_grupo" ADD CONSTRAINT "membros_do_grupo_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_do_grupo" ADD CONSTRAINT "membros_do_grupo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_acompanhadas" ADD CONSTRAINT "series_acompanhadas_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_acompanhadas" ADD CONSTRAINT "series_acompanhadas_adicionado_por_fkey" FOREIGN KEY ("adicionado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progresso_episodios" ADD CONSTRAINT "progresso_episodios_serie_acompanhada_id_fkey" FOREIGN KEY ("serie_acompanhada_id") REFERENCES "series_acompanhadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progresso_episodios" ADD CONSTRAINT "progresso_episodios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progresso_episodios" ADD CONSTRAINT "progresso_episodios_marcado_por_fkey" FOREIGN KEY ("marcado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reacoes_episodio" ADD CONSTRAINT "reacoes_episodio_serie_acompanhada_id_fkey" FOREIGN KEY ("serie_acompanhada_id") REFERENCES "series_acompanhadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reacoes_episodio" ADD CONSTRAINT "reacoes_episodio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_episodio" ADD CONSTRAINT "comentarios_episodio_serie_acompanhada_id_fkey" FOREIGN KEY ("serie_acompanhada_id") REFERENCES "series_acompanhadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_episodio" ADD CONSTRAINT "comentarios_episodio_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

