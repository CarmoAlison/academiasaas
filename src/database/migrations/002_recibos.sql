-- =====================================================================
-- Migração 002 — Recibos personalizados
-- Para bancos criados antes desta funcionalidade (instalações novas já
-- recebem tudo via schema/functions/rls/triggers.sql). Idempotente.
--   • payments.recibo_numero (sequencial por academia) e payments.recebido_por
--   • receipt_settings: personalização do recibo por academia
--   • bucket academy-assets (logo do recibo)
--   • RPC get_receipt(payment_id)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------
alter table public.payments add column if not exists recibo_numero integer;
alter table public.payments add column if not exists recebido_por text;
create unique index if not exists payments_recibo_uk on public.payments (academy_id, recibo_numero)
  where recibo_numero is not null;

create table if not exists public.receipt_settings (
  academy_id        uuid primary key references public.academies(id) on delete cascade,
  logo_url          text,
  cor               text not null default '#006EB8' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  estilo            text not null default 'moderno' check (estilo in ('moderno', 'classico')),
  titulo            text not null default 'Recibo de pagamento',
  mensagem          text default 'Obrigado por treinar conosco!',
  rodape            text,
  cidade            text,
  exibir_cnpj       boolean not null default true,
  exibir_endereco   boolean not null default true,
  exibir_contato    boolean not null default true,
  exibir_assinatura boolean not null default true,
  exibir_selo       boolean not null default true,
  assinatura_nome   text,
  assinatura_cargo  text default 'Responsável financeiro',
  updated_at        timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('academy-assets', 'academy-assets', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Função: dados completos do recibo (aluno dono do pagamento ou financeiro.ver)
-- ---------------------------------------------------------------------
create or replace function public.get_receipt(p_payment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_pay     public.payments;
  v_student public.students;
  v_unit    public.units;
begin
  select * into v_pay from public.payments where id = p_payment_id and deleted_at is null;
  if v_pay.id is null then
    raise exception 'Pagamento não encontrado';
  end if;

  if not (
    public.has_permission(v_pay.academy_id, 'financeiro.ver')
    or (public.is_member(v_pay.academy_id) and v_pay.student_id in (select public.my_student_ids()))
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if v_pay.status <> 'pago' then
    raise exception 'O recibo fica disponível após a confirmação do pagamento';
  end if;

  select * into v_student from public.students where id = v_pay.student_id;
  select * into v_unit from public.units where id = v_student.unit_id;
  if v_unit.id is null then
    select * into v_unit from public.units
     where academy_id = v_pay.academy_id and deleted_at is null
     order by ativo desc, created_at limit 1;
  end if;

  return jsonb_build_object(
    'pagamento', jsonb_build_object(
      'id', v_pay.id, 'numero', v_pay.recibo_numero, 'descricao', v_pay.descricao, 'valor', v_pay.valor,
      'vencimento', v_pay.vencimento, 'pago_em', v_pay.pago_em, 'forma_pagamento', v_pay.forma_pagamento,
      'recebido_por', v_pay.recebido_por
    ),
    'plano', (select jsonb_build_object('nome', nome, 'duracao_meses', duracao_meses) from public.plans where id = v_pay.plan_id),
    'aluno', (select jsonb_build_object('nome', nome, 'cpf', cpf, 'email', email_contato, 'telefone', telefone)
                from public.profiles where id = v_student.profile_id),
    'academia', (select jsonb_build_object('nome', nome, 'cnpj', cnpj, 'email', email, 'telefone', telefone, 'logo_url', logo_url)
                   from public.academies where id = v_pay.academy_id),
    'unidade', case when v_unit.id is null then null else jsonb_build_object(
      'nome', v_unit.nome, 'endereco', v_unit.endereco, 'cidade', v_unit.cidade, 'estado', v_unit.estado,
      'cep', v_unit.cep, 'telefone', v_unit.telefone) end,
    'config', (select to_jsonb(r) - 'academy_id' from public.receipt_settings r where r.academy_id = v_pay.academy_id)
  );
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.receipt_settings enable row level security;

drop policy if exists receipt_settings_select on public.receipt_settings;
create policy receipt_settings_select on public.receipt_settings for select to authenticated
  using (public.is_member(academy_id) or public.is_super_admin());

drop policy if exists receipt_settings_insert on public.receipt_settings;
create policy receipt_settings_insert on public.receipt_settings for insert to authenticated
  with check (public.has_permission(academy_id, 'financeiro.editar'));

drop policy if exists receipt_settings_update on public.receipt_settings;
create policy receipt_settings_update on public.receipt_settings for update to authenticated
  using (public.has_permission(academy_id, 'financeiro.editar'))
  with check (public.has_permission(academy_id, 'financeiro.editar'));

-- Storage: academy-assets/{academy_id}/arquivo
drop policy if exists academy_assets_public_read on storage.objects;
create policy academy_assets_public_read on storage.objects for select
  using (bucket_id = 'academy-assets');

drop policy if exists academy_assets_insert on storage.objects;
create policy academy_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'academy-assets'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'financeiro.editar'));

drop policy if exists academy_assets_update on storage.objects;
create policy academy_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'academy-assets'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'financeiro.editar'));

drop policy if exists academy_assets_delete on storage.objects;
create policy academy_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'academy-assets'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'financeiro.editar'));

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- Numeração sequencial do recibo (por academia) + quem recebeu
create or replace function public.payment_receipt()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pago' then
    if new.pago_em is null then
      new.pago_em := now();
    end if;
    if tg_op = 'INSERT' or old.status is distinct from 'pago' then
      new.recebido_por := coalesce(public._user_nome(new.academy_id), new.recebido_por);
    end if;
    if new.recibo_numero is null then
      perform pg_advisory_xact_lock(hashtext('recibo:' || new.academy_id::text));
      select coalesce(max(recibo_numero), 0) + 1 into new.recibo_numero
        from public.payments where academy_id = new.academy_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists payments_receipt on public.payments;
create trigger payments_receipt
  before insert or update on public.payments
  for each row execute function public.payment_receipt();

drop trigger if exists receipt_settings_updated_at on public.receipt_settings;
create trigger receipt_settings_updated_at before update on public.receipt_settings
  for each row execute function public.set_updated_at();

drop trigger if exists receipt_settings_audit on public.receipt_settings;
create trigger receipt_settings_audit after insert or update or delete on public.receipt_settings
  for each row execute function public.audit_trigger();

-- Numera pagamentos já quitados (ordem de pagamento)
with m as (
  select academy_id, coalesce(max(recibo_numero), 0) mx from public.payments group by academy_id
), x as (
  select p.id, m.mx + row_number() over (partition by p.academy_id order by p.pago_em nulls last, p.created_at) n
    from public.payments p join m using (academy_id)
   where p.status = 'pago' and p.recibo_numero is null
)
update public.payments p set recibo_numero = x.n from x where p.id = x.id;

notify pgrst, 'reload schema';
