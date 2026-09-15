-- Habilita Row Level Security nas tabelas da aplicação.
-- Nenhuma policy é criada: o acesso via chave anon/authenticated do Supabase
-- fica bloqueado por padrão, enquanto a API (conectada via DATABASE_URL como
-- owner das tabelas) continua funcionando normalmente, já que RLS não se
-- aplica ao dono da tabela.
ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grupos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membros_do_grupo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "series_acompanhadas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "progresso_episodios" ENABLE ROW LEVEL SECURITY;
