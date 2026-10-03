-- =====================================================================
-- Migração 013 — Chamados em tempo real
--   Publica support_tickets e support_messages no Supabase Realtime: mensagens novas
--   e mudanças de status chegam na hora para a academia e para o suporte.
--   O Realtime respeita a RLS (cada um só recebe o que já podia ler).
-- Requer a 011. Pode ser executada mais de uma vez.
-- =====================================================================

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['support_tickets', 'support_messages'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
