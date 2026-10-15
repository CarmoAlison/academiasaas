-- =====================================================================
-- Migração 030 — Logo completa no lugar do nome (recibo e contrato)
--   • Opção "Logo completa no lugar do nome" na personalização do recibo
--     da academia (vale também para o contrato do aluno, que usa o mesmo
--     visual). No Super Admin (recibo e contrato do SaaS) a opção fica em
--     saas_settings.dados e não precisa de coluna.
-- Requer a 029. Pode ser executada mais de uma vez.
-- =====================================================================
alter table public.receipt_settings add column if not exists logo_completa boolean not null default false;

notify pgrst, 'reload schema';
