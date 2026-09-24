-- AlterTable
ALTER TABLE "series_acompanhadas" ADD COLUMN "adicionado_por" UUID;

-- AddForeignKey
ALTER TABLE "series_acompanhadas" ADD CONSTRAINT "series_acompanhadas_adicionado_por_fkey" FOREIGN KEY ("adicionado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
