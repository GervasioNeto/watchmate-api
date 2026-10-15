-- Último episódio exibido, próximo agendado e quando o snapshot do TMDB foi renovado.
-- Colunas opcionais: nenhuma linha existente muda. A lista preenche cada série na
-- próxima vez que for aberta.

-- AlterTable
ALTER TABLE "series_acompanhadas" ADD COLUMN "ultimo_episodio_exibido" JSONB,
ADD COLUMN "proximo_episodio" JSONB,
ADD COLUMN "atualizado_tmdb_em" TIMESTAMP(3);
