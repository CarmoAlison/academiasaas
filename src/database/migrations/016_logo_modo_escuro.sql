-- =====================================================================
-- Migração 016 — Logo da academia para o modo escuro
--   academy_settings.logo_url      → logo usada no modo claro (já existia)
--   academy_settings.logo_url_dark → logo usada no modo escuro (nova)
--   Com logo enviada, o menu mostra só a logo (sem o nome e o ícone padrão).
--   As logos do painel Super Admin ficam em saas_settings.dados (logo_claro/logo_escuro).
-- Requer a 010. Pode ser executada mais de uma vez.
-- =====================================================================

alter table public.academy_settings add column if not exists logo_url_dark text;

notify pgrst, 'reload schema';
