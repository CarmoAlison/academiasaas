-- =====================================================================
-- Migração 025 — Catraca: permissão de leitura nas fotos do cadastro facial
--   O envio de arquivos do Supabase precisa de permissão de LEITURA na pasta
--   além da de gravação (a 024 só tinha gravação). Sem ela, enviar a foto do
--   rosto dava "Você não tem permissão para esta ação".
--   Leitura só para quem pode cadastrar rosto naquela academia e para o
--   Super Admin. A catraca recebe a foto pelo servidor (chave de serviço).
-- Requer a 024. Pode ser executada mais de uma vez.
-- =====================================================================

drop policy if exists catraca_faces_select on storage.objects;
create policy catraca_faces_select on storage.objects for select to authenticated
  using (bucket_id = 'catraca-faces'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and ((storage.foldername(name))[1]::uuid in (select public.academies_with_permission('catraca.biometria'))
         or public.super_can('academias')));

notify pgrst, 'reload schema';
