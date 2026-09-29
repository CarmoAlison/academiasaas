-- =====================================================================
-- Migração 003 — Assinatura no recibo
-- Modo da assinatura acima da linha:
--   'linha'   → só a linha, com nome e cargo abaixo (padrão)
--   'imagem'  → imagem PNG da assinatura (assinatura_url) acima da linha
--   'cursiva' → nome (assinatura_nome) em letra cursiva acima da linha
-- Requer a migração 002. Pode ser executada mais de uma vez.
-- =====================================================================

alter table public.receipt_settings add column if not exists assinatura_modo text not null default 'linha';
alter table public.receipt_settings add column if not exists assinatura_url text;

alter table public.receipt_settings drop constraint if exists receipt_settings_assinatura_modo_check;
alter table public.receipt_settings add constraint receipt_settings_assinatura_modo_check
  check (assinatura_modo in ('linha', 'imagem', 'cursiva'));

notify pgrst, 'reload schema';
