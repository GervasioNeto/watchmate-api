-- A cor de cada pessoa na dupla, escolhida numa paleta (ver src/lib/personColors.ts).
-- Quem já está num grupo fica com a cor que o app já mostrava: roxo para quem entrou
-- primeiro (normalmente quem criou) e âmbar para quem entrou depois, na mesma ordem que
-- o app usava (entrada no grupo, com o id do usuário desempatando).

-- AlterTable
ALTER TABLE "membros_do_grupo" ADD COLUMN "cor" TEXT;

UPDATE "membros_do_grupo" AS membro
SET "cor" = CASE ordem.posicao
  WHEN 1 THEN 'violet'
  WHEN 2 THEN 'amber'
  -- O app não deixa um grupo passar de dois; se algum passou, cada extra ganha uma cor
  -- própria para o índice único abaixo não falhar (o app cai na cor padrão).
  ELSE 'extra-' || ordem.posicao
END
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "grupo_id" ORDER BY "entrou_em", "usuario_id") AS posicao
  FROM "membros_do_grupo"
) AS ordem
WHERE membro."id" = ordem."id";

-- A coluna fica opcional: enquanto a API antiga ainda estiver no ar (ela cria membros
-- sem saber da cor), entrar num grupo continua funcionando. A API nova sempre preenche,
-- e o índice único ignora membros sem cor.

-- CreateIndex
CREATE UNIQUE INDEX "membros_do_grupo_grupo_id_cor_key" ON "membros_do_grupo"("grupo_id", "cor");
