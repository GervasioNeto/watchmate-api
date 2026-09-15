-- AlterTable
ALTER TABLE "series_acompanhadas"
  ADD COLUMN "sinopse" TEXT,
  ADD COLUMN "nota_media" DOUBLE PRECISION,
  ADD COLUMN "status" TEXT,
  ADD COLUMN "backdrop_path" TEXT,
  ADD COLUMN "generos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "primeira_exibicao_em" TIMESTAMP(3),
  ADD COLUMN "idioma_original" TEXT,
  ADD COLUMN "nome_original" TEXT;
