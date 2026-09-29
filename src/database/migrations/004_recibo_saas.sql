-- =====================================================================
-- Migração 004 — Recibo das faturas do SaaS (Super Admin → academia)
--   • saas_invoices: forma_pagamento, recibo_numero (sequencial global), recebido_por
--   • RPC get_saas_receipt(invoice_id): Super Admin ou Admin da academia pagadora
--   • Personalização do recibo SaaS fica em saas_settings.dados -> 'recibo'
--   • Storage academy-assets: Super Admin pode enviar arquivos (pasta saas/)
-- Requer as migrações 002 e 003. Pode ser executada mais de uma vez.
-- =====================================================================

alter table public.saas_invoices add column if not exists forma_pagamento text;
alter table public.saas_invoices add column if not exists recibo_numero integer;
alter table public.saas_invoices add column if not exists recebido_por text;
create unique index if not exists saas_invoices_recibo_uk on public.saas_invoices (recibo_numero)
  where recibo_numero is not null;

-- ---------------------------------------------------------------------
-- Numeração do recibo ao quitar a fatura + quem deu a baixa
-- ---------------------------------------------------------------------
create or replace function public.saas_invoice_receipt()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pago' then
    if new.pago_em is null then
      new.pago_em := now();
    end if;
    if tg_op = 'INSERT' or old.status is distinct from 'pago' then
      new.recebido_por := coalesce(public._user_nome(null), new.recebido_por);
    end if;
    if new.recibo_numero is null then
      perform pg_advisory_xact_lock(hashtext('recibo:saas'));
      select coalesce(max(recibo_numero), 0) + 1 into new.recibo_numero from public.saas_invoices;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists saas_invoices_receipt on public.saas_invoices;
create trigger saas_invoices_receipt
  before insert or update on public.saas_invoices
  for each row execute function public.saas_invoice_receipt();

-- ---------------------------------------------------------------------
-- Dados do recibo da fatura SaaS (mesmo formato de get_receipt)
--   emissor  = empresa do SaaS (saas_settings.dados)
--   pagador  = academia
-- ---------------------------------------------------------------------
create or replace function public.get_saas_receipt(p_invoice_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_inv public.saas_invoices;
  v_ac  public.academies;
  v_cfg jsonb;
begin
  select * into v_inv from public.saas_invoices where id = p_invoice_id;
  if v_inv.id is null then
    raise exception 'Fatura não encontrada';
  end if;
  if not (public.is_super_admin() or public.is_academy_admin(v_inv.academy_id)) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if v_inv.status <> 'pago' then
    raise exception 'O recibo fica disponível após a confirmação do pagamento';
  end if;

  select * into v_ac from public.academies where id = v_inv.academy_id;
  select coalesce(dados, '{}'::jsonb) into v_cfg from public.saas_settings where id = 1;
  v_cfg := coalesce(v_cfg, '{}'::jsonb);

  return jsonb_build_object(
    'pagamento', jsonb_build_object(
      'id', v_inv.id, 'numero', v_inv.recibo_numero, 'descricao', 'Assinatura do sistema',
      'valor', v_inv.valor, 'vencimento', v_inv.vencimento, 'competencia', v_inv.competencia,
      'pago_em', v_inv.pago_em, 'forma_pagamento', v_inv.forma_pagamento, 'recebido_por', v_inv.recebido_por
    ),
    'plano', (select jsonb_build_object('nome', nome) from public.saas_plans where id = v_inv.saas_plan_id),
    'aluno', jsonb_build_object('nome', v_ac.nome, 'cnpj', v_ac.cnpj),
    'academia', jsonb_build_object(
      'nome', coalesce(nullif(v_cfg ->> 'nome', ''), 'Academia SaaS'),
      'cnpj', nullif(regexp_replace(coalesce(v_cfg ->> 'cnpj', ''), '\D', '', 'g'), ''),
      'email', nullif(v_cfg ->> 'email_suporte', ''),
      'telefone', nullif(regexp_replace(coalesce(v_cfg ->> 'telefone', ''), '\D', '', 'g'), ''),
      'logo_url', null
    ),
    'unidade', jsonb_build_object(
      'endereco', nullif(v_cfg ->> 'endereco', ''), 'cidade', nullif(v_cfg ->> 'cidade', ''),
      'estado', nullif(v_cfg ->> 'estado', ''), 'cep', nullif(regexp_replace(coalesce(v_cfg ->> 'cep', ''), '\D', '', 'g'), ''),
      'telefone', null
    ),
    'config', v_cfg -> 'recibo'
  );
end $$;

-- ---------------------------------------------------------------------
-- Storage: Super Admin gerencia academy-assets (logo/assinatura do recibo SaaS em saas/)
-- ---------------------------------------------------------------------
drop policy if exists academy_assets_super_all on storage.objects;
create policy academy_assets_super_all on storage.objects for all to authenticated
  using (bucket_id = 'academy-assets' and public.is_super_admin())
  with check (bucket_id = 'academy-assets' and public.is_super_admin());

-- Numera faturas já quitadas (ordem de pagamento)
with base as (select coalesce(max(recibo_numero), 0) mx from public.saas_invoices),
x as (
  select i.id, base.mx + row_number() over (order by i.pago_em nulls last, i.created_at) n
    from public.saas_invoices i cross join base
   where i.status = 'pago' and i.recibo_numero is null
)
update public.saas_invoices i set recibo_numero = x.n from x where i.id = x.id;

notify pgrst, 'reload schema';
