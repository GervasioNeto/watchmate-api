-- Presentes: a data de início do namoro na dupla (grupos.juntos_desde), os presentes
-- (presentes) e os vales dentro deles (vales_presente). Só uma coluna opcional e tabelas
-- novas, sem enum novo: nenhuma linha existente muda, e a versão anterior da API continua
-- funcionando com o banco migrado.

-- AlterTable
ALTER TABLE "grupos" ADD COLUMN     "juntos_desde" DATE;

-- CreateTable
CREATE TABLE "presentes" (
    "id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "de_usuario_id" UUID NOT NULL,
    "para_usuario_id" UUID NOT NULL,
    "ocasiao" TEXT NOT NULL,
    "embrulho" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "entregar_em" TIMESTAMP(3) NOT NULL,
    "chave_vapid" TEXT,
    "avisado_em" TIMESTAMP(3),
    "aberto_em" TIMESTAMP(3),
    "reacao" TEXT,
    "reagido_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vales_presente" (
    "id" UUID NOT NULL,
    "presente_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "emoji" TEXT,
    "ordem" INTEGER NOT NULL,
    "usado_em" TIMESTAMP(3),

    CONSTRAINT "vales_presente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "presentes_para_usuario_id_entregar_em_idx" ON "presentes"("para_usuario_id", "entregar_em");

-- CreateIndex
CREATE INDEX "presentes_de_usuario_id_criado_em_idx" ON "presentes"("de_usuario_id", "criado_em");

-- CreateIndex
CREATE INDEX "presentes_entregar_em_idx" ON "presentes"("entregar_em");

-- CreateIndex
CREATE INDEX "vales_presente_presente_id_idx" ON "vales_presente"("presente_id");

-- AddForeignKey
ALTER TABLE "presentes" ADD CONSTRAINT "presentes_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presentes" ADD CONSTRAINT "presentes_de_usuario_id_fkey" FOREIGN KEY ("de_usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presentes" ADD CONSTRAINT "presentes_para_usuario_id_fkey" FOREIGN KEY ("para_usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vales_presente" ADD CONSTRAINT "vales_presente_presente_id_fkey" FOREIGN KEY ("presente_id") REFERENCES "presentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Segue o mesmo motivo das outras tabelas: bloqueia acesso via chave anon/authenticated do Supabase.
ALTER TABLE "presentes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vales_presente" ENABLE ROW LEVEL SECURITY;
