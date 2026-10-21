-- "Bora?" e "Entre vocês": os convites para ver um episódio juntos (convites_sessao), os
-- avisos guardados no app (avisos) e a última vez que cada um abriu os avisos
-- (usuarios.avisos_vistos_em). Só tabelas e uma coluna opcional novas: nenhuma linha
-- existente muda, e a versão anterior da API continua funcionando com o banco migrado.

-- CreateEnum
CREATE TYPE "StatusConvite" AS ENUM ('PENDENTE', 'ACEITO', 'RECUSADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoAviso" AS ENUM ('CONVITE', 'RESPOSTA_CONVITE', 'RECADO', 'COMENTARIO', 'REACAO', 'SERIE_ADICIONADA', 'EPISODIO_VISTO', 'TEMPORADA_TERMINADA');

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "avisos_vistos_em" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "convites_sessao" (
    "id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "serie_acompanhada_id" UUID NOT NULL,
    "temporada" INTEGER NOT NULL,
    "episodio" INTEGER NOT NULL,
    "de_usuario_id" UUID NOT NULL,
    "para_usuario_id" UUID NOT NULL,
    "horario" TIMESTAMP(3),
    "fuso_horario" TEXT NOT NULL,
    "frase" TEXT,
    "status" "StatusConvite" NOT NULL DEFAULT 'PENDENTE',
    "remarcado" BOOLEAN NOT NULL DEFAULT false,
    "respondido_em" TIMESTAMP(3),
    "expira_em" TIMESTAMP(3) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convites_sessao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avisos" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "autor_id" UUID NOT NULL,
    "tipo" "TipoAviso" NOT NULL,
    "assunto" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "serie_acompanhada_id" UUID,
    "temporada" INTEGER,
    "episodio" INTEGER,
    "convite_id" UUID,
    "texto" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "convites_sessao_grupo_id_criado_em_idx" ON "convites_sessao"("grupo_id", "criado_em");

-- CreateIndex
CREATE INDEX "avisos_usuario_id_atualizado_em_idx" ON "avisos"("usuario_id", "atualizado_em");

-- AddForeignKey
ALTER TABLE "convites_sessao" ADD CONSTRAINT "convites_sessao_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convites_sessao" ADD CONSTRAINT "convites_sessao_serie_acompanhada_id_fkey" FOREIGN KEY ("serie_acompanhada_id") REFERENCES "series_acompanhadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convites_sessao" ADD CONSTRAINT "convites_sessao_de_usuario_id_fkey" FOREIGN KEY ("de_usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convites_sessao" ADD CONSTRAINT "convites_sessao_para_usuario_id_fkey" FOREIGN KEY ("para_usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_serie_acompanhada_id_fkey" FOREIGN KEY ("serie_acompanhada_id") REFERENCES "series_acompanhadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_convite_id_fkey" FOREIGN KEY ("convite_id") REFERENCES "convites_sessao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Segue o mesmo motivo das outras tabelas: bloqueia acesso via chave anon/authenticated do Supabase.
ALTER TABLE "convites_sessao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "avisos" ENABLE ROW LEVEL SECURITY;
