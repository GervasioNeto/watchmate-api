-- DropIndex
DROP INDEX "membros_do_grupo_grupo_id_usuario_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "membros_do_grupo_usuario_id_key" ON "membros_do_grupo"("usuario_id");
