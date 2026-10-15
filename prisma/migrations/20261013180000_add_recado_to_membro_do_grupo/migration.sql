-- Recado curto que cada membro deixa para o par. Colunas opcionais: nenhuma linha
-- existente muda.

-- AlterTable
ALTER TABLE "membros_do_grupo" ADD COLUMN "recado" TEXT,
ADD COLUMN "recado_em" TIMESTAMP(3);
