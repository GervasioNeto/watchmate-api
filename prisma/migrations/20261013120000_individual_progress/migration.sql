-- Progresso passa a ser individual: cada membro do grupo tem sua própria linha por
-- episódio assistido. A série ganha um "modo" que define o padrão ao marcar.
--
-- Roda numa transação explícita porque mexe em dados (apaga/duplica linhas) antes de
-- mudar as constraints: se algo falhar no meio, nada fica aplicado pela metade.
BEGIN;

-- CreateEnum
CREATE TYPE "ModoAcompanhamento" AS ENUM ('JUNTOS', 'SEPARADOS');

-- AlterTable
ALTER TABLE "series_acompanhadas" ADD COLUMN "modo" "ModoAcompanhamento" NOT NULL DEFAULT 'JUNTOS';

-- DropIndex
DROP INDEX "progresso_episodios_serie_acompanhada_id_temporada_episodio_key";

-- AlterTable (usuario_id começa nullable para permitir o backfill abaixo)
ALTER TABLE "progresso_episodios" ADD COLUMN "juntos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "usuario_id" UUID;

-- Backfill: antes, "desmarcar" deixava assistido_em = NULL. Agora desmarcar apaga a linha.
DELETE FROM "progresso_episodios" WHERE "assistido_em" IS NULL;

-- Backfill: o progresso antigo era compartilhado, então vira uma linha para cada membro
-- atual do grupo. Em grupos com 2 membros ele conta como assistido juntos.
INSERT INTO "progresso_episodios"
  ("id", "serie_acompanhada_id", "temporada", "episodio", "usuario_id", "assistido_em", "marcado_por", "juntos")
SELECT
  gen_random_uuid(),
  p."serie_acompanhada_id",
  p."temporada",
  p."episodio",
  m."usuario_id",
  p."assistido_em",
  p."marcado_por",
  (SELECT COUNT(*) FROM "membros_do_grupo" mm WHERE mm."grupo_id" = s."grupo_id") > 1
FROM "progresso_episodios" p
JOIN "series_acompanhadas" s ON s."id" = p."serie_acompanhada_id"
JOIN "membros_do_grupo" m ON m."grupo_id" = s."grupo_id"
WHERE p."usuario_id" IS NULL;

DELETE FROM "progresso_episodios" WHERE "usuario_id" IS NULL;

-- AlterTable
ALTER TABLE "progresso_episodios" ALTER COLUMN "usuario_id" SET NOT NULL,
ALTER COLUMN "assistido_em" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "progresso_episodios_serie_acompanhada_id_usuario_id_tempora_key" ON "progresso_episodios"("serie_acompanhada_id", "usuario_id", "temporada", "episodio");

-- AddForeignKey
ALTER TABLE "progresso_episodios" ADD CONSTRAINT "progresso_episodios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
