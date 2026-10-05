-- =====================================================================
-- Migração 014 — Planos do SaaS: Básico, Mult e Business + adicionais,
-- ciclo anual com desconto e ofertas de lançamento
--   • saas_plans: slug, recursos, limite de unidades, % de desconto no anual, destaque, ordem
--     (Starter/Pro existentes viram Básico/Mult; valores e academias vinculadas são mantidos)
--   • saas_addons + academy_addons: adicionais fixos (ex.: "Pagamentos online"), preço travado
--     na contratação
--   • saas_offers: oferta com % de desconto, duração em meses, nº de vagas e região (UF/cidade)
--   • academies: ciclo (mensal | anual), início do ciclo, UF/cidade, oferta aplicada e validade
--   • saas_invoices: ciclo e detalhamento (itens) da cobrança
--   • academy_price(): composição do preço; set_academy_subscription(): troca plano/ciclo/
--     adicionais/oferta e recalcula a fatura pendente do mês; faturas mensais ou anuais
--   • Limite de unidades por plano
-- Requer a 011. Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Planos
-- ---------------------------------------------------------------------
alter table public.saas_plans add column if not exists slug text;
alter table public.saas_plans add column if not exists recursos text[] not null default '{}';
alter table public.saas_plans add column if not exists limite_unidades integer;
alter table public.saas_plans add column if not exists desconto_anual_pct numeric(5,2) not null default 15;
alter table public.saas_plans add column if not exists destaque boolean not null default false;
alter table public.saas_plans add column if not exists ordem integer not null default 0;
alter table public.saas_plans drop constraint if exists saas_plans_desconto_check;
alter table public.saas_plans add constraint saas_plans_desconto_check check (desconto_anual_pct between 0 and 90);
create unique index if not exists saas_plans_slug_uk on public.saas_plans (slug) where slug is not null and deleted_at is null;

-- planos antigos ganham os novos nomes (preço e academias vinculadas continuam iguais)
update public.saas_plans set nome = 'Básico', slug = 'basico'
 where slug is null and nome = 'Starter' and not exists (select 1 from public.saas_plans where slug = 'basico');
update public.saas_plans set nome = 'Mult', slug = 'mult'
 where slug is null and nome = 'Pro' and not exists (select 1 from public.saas_plans where slug = 'mult');
update public.saas_plans set slug = 'business'
 where slug is null and nome = 'Business' and not exists (select 1 from public.saas_plans where slug = 'business');

insert into public.saas_plans (nome, slug, descricao, valor, limite_alunos)
select v.nome, v.slug, v.descricao, v.valor, v.limite
  from (values
    ('Básico',   'basico',   'Para academias com uma unidade',          149.90, 100),
    ('Mult',     'mult',     'Para academias com mais de uma unidade',  299.90, 500),
    ('Business', 'business', 'Redes e academias grandes, sem limites',  599.90, null::integer)
  ) as v(nome, slug, descricao, valor, limite)
 where not exists (select 1 from public.saas_plans p where p.slug = v.slug and p.deleted_at is null);

update public.saas_plans set ordem = 1, limite_unidades = coalesce(limite_unidades, 1),
       recursos = case when recursos = '{}' then array['Alunos, treinos e aulas', 'Financeiro e recibos', 'Check-in por QR Code', 'Suporte por chamado'] else recursos end
 where slug = 'basico';
update public.saas_plans set ordem = 2, destaque = true, limite_unidades = coalesce(limite_unidades, 5),
       recursos = case when recursos = '{}' then array['Tudo do Básico', 'Relatórios completos', 'Contrato digital', 'WhatsApp em 1 clique'] else recursos end
 where slug = 'mult';
update public.saas_plans set ordem = 3,
       recursos = case when recursos = '{}' then array['Tudo do Mult', 'Atendimento prioritário', 'Identidade visual própria'] else recursos end
 where slug = 'business';

-- ---------------------------------------------------------------------
-- Adicionais
-- ---------------------------------------------------------------------
create table if not exists public.saas_addons (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  nome       text not null,
  descricao  text,
  valor      numeric(12,2) not null default 0 check (valor >= 0),
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.saas_addons (slug, nome, descricao, valor)
values ('pagamentos_online', 'Pagamentos online', 'Cobrança por Pix, boleto e cartão com baixa automática das mensalidades', 49.90)
on conflict (slug) do nothing;

create table if not exists public.academy_addons (
  academy_id uuid not null references public.academies(id) on delete cascade,
  addon_id   uuid not null references public.saas_addons(id),
  valor      numeric(12,2) not null,           -- preço travado na contratação
  created_at timestamptz not null default now(),
  primary key (academy_id, addon_id)
);

-- ---------------------------------------------------------------------
-- Ofertas
-- ---------------------------------------------------------------------
create table if not exists public.saas_offers (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  descricao        text,
  desconto_pct     numeric(5,2) not null check (desconto_pct > 0 and desconto_pct <= 100),
  meses            integer check (meses is null or meses between 1 and 60), -- null = enquanto durar a assinatura
  limite_academias integer check (limite_academias is null or limite_academias > 0),
  uf               char(2),
  cidade           text,
  valido_ate       date,
  ativo            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Academias e faturas
-- ---------------------------------------------------------------------
alter table public.academies add column if not exists ciclo text not null default 'mensal';
alter table public.academies add column if not exists ciclo_inicio date;
alter table public.academies add column if not exists uf char(2);
alter table public.academies add column if not exists cidade text;
alter table public.academies add column if not exists offer_id uuid references public.saas_offers(id) on delete set null;
alter table public.academies add column if not exists oferta_ate date;
alter table public.academies drop constraint if exists academies_ciclo_check;
alter table public.academies add constraint academies_ciclo_check check (ciclo in ('mensal', 'anual'));
create index if not exists academies_offer_idx on public.academies (offer_id) where offer_id is not null;

alter table public.saas_invoices add column if not exists ciclo text not null default 'mensal';
alter table public.saas_invoices add column if not exists detalhes jsonb;

-- ---------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------
alter table public.saas_addons enable row level security;
alter table public.academy_addons enable row level security;
alter table public.saas_offers enable row level security;

drop policy if exists saas_addons_select on public.saas_addons;
create policy saas_addons_select on public.saas_addons for select to authenticated using (true);
drop policy if exists saas_addons_write on public.saas_addons;
create policy saas_addons_write on public.saas_addons for all to authenticated
  using ((select public.super_can('financeiro'))) with check ((select public.super_can('financeiro')));

drop policy if exists academy_addons_select on public.academy_addons;
create policy academy_addons_select on public.academy_addons for select to authenticated
  using ((select public.is_super_admin()) or academy_id in (select public.my_member_academies()));
-- inclusão/remoção só por set_academy_subscription()

drop policy if exists saas_offers_select on public.saas_offers;
create policy saas_offers_select on public.saas_offers for select to authenticated
  using ((select public.is_super_admin()) or id in (select offer_id from public.academies where id in (select public.my_admin_academies())));
drop policy if exists saas_offers_write on public.saas_offers;
create policy saas_offers_write on public.saas_offers for all to authenticated
  using ((select public.super_can('financeiro'))) with check ((select public.super_can('financeiro')));

grant select on public.saas_addons, public.academy_addons, public.saas_offers to authenticated;
grant insert, update, delete on public.saas_addons, public.saas_offers to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['saas_addons', 'saas_offers'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
  foreach t in array array['saas_addons', 'saas_offers', 'academy_addons'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Preço
-- ---------------------------------------------------------------------
/**
 * Composição da cobrança de uma academia numa competência:
 *   plano × meses do ciclo − desconto anual − desconto da oferta (se vigente) + adicionais × meses
 */
create or replace function public._academy_price(p_academy uuid, p_competencia date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_a       public.academies;
  v_p       public.saas_plans;
  v_o       public.saas_offers;
  v_comp    date := date_trunc('month', coalesce(p_competencia, public._today()))::date;
  v_meses   integer;
  v_bruto   numeric;
  v_anual   numeric := 0;
  v_oferta  numeric := 0;
  v_cobertos integer := 0;
  v_add     numeric := 0;
  v_itens   jsonb;
  v_total   numeric;
begin
  select * into v_a from public.academies where id = p_academy;
  select * into v_p from public.saas_plans where id = v_a.saas_plan_id;
  if v_a.id is null or v_p.id is null then
    return null;
  end if;
  v_meses := case when v_a.ciclo = 'anual' then 12 else 1 end;
  v_bruto := round(v_p.valor * v_meses, 2);
  if v_meses = 12 then
    v_anual := round(v_bruto * v_p.desconto_anual_pct / 100, 2);
  end if;
  if v_a.offer_id is not null and (v_a.oferta_ate is null or v_comp <= v_a.oferta_ate) then
    select * into v_o from public.saas_offers where id = v_a.offer_id;
    if v_o.id is not null then
      -- meses do período cobrado que ainda estão dentro da oferta (anual: ex. 3 de 12)
      v_cobertos := case when v_a.oferta_ate is null then v_meses
        else least(v_meses, greatest(0,
               (extract(year from age(v_a.oferta_ate + 1, v_comp)) * 12 + extract(month from age(v_a.oferta_ate + 1, v_comp)))::int))
        end;
      v_oferta := round((v_bruto - v_anual) / v_meses * v_cobertos * v_o.desconto_pct / 100, 2);
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('nome', ad.nome, 'slug', ad.slug, 'valor_mensal', aa.valor,
                                               'valor', round(aa.valor * v_meses, 2)) order by ad.nome), '[]'::jsonb),
         coalesce(round(sum(aa.valor) * v_meses, 2), 0)
    into v_itens, v_add
    from public.academy_addons aa join public.saas_addons ad on ad.id = aa.addon_id
   where aa.academy_id = p_academy;

  v_total := greatest(v_bruto - v_anual - v_oferta + v_add, 0);
  return jsonb_build_object(
    'plano', v_p.nome,
    'plano_id', v_p.id,
    'ciclo', v_a.ciclo,
    'meses', v_meses,
    'valor_mensal_plano', v_p.valor,
    'plano_bruto', v_bruto,
    'desconto_anual_pct', case when v_meses = 12 then v_p.desconto_anual_pct else 0 end,
    'desconto_anual', v_anual,
    'oferta', case when v_o.id is not null then v_o.nome end,
    'oferta_pct', coalesce(v_o.desconto_pct, 0),
    'oferta_ate', v_a.oferta_ate,
    'oferta_meses', v_cobertos,
    'desconto_oferta', v_oferta,
    'adicionais', v_itens,
    'adicionais_total', v_add,
    'total', v_total,
    'mensal_equivalente', round(v_total / v_meses, 2)
  );
end $$;
revoke execute on function public._academy_price(uuid, date) from public, anon, authenticated;

/** Preço atual (Super Admin ou Admin da própria academia) */
create or replace function public.academy_price(p_academy uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_super_admin() or public.is_academy_admin(p_academy)) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return public._academy_price(p_academy);
end $$;

/** A academia tem o adicional? (para liberar recursos pagos) */
create or replace function public.academy_has_addon(p_academy uuid, p_slug text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.academy_addons aa join public.saas_addons ad on ad.id = aa.addon_id
                  where aa.academy_id = p_academy and ad.slug = p_slug);
$$;

-- ---------------------------------------------------------------------
-- Assinatura da academia
-- ---------------------------------------------------------------------
/**
 * Define plano, ciclo, adicionais e oferta. Valida vagas/validade/região da oferta e
 * recalcula a fatura pendente do mês atual.
 */
create or replace function public.set_academy_subscription(
  p_academy uuid, p_plan uuid, p_ciclo text, p_addons uuid[] default '{}', p_offer uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_a      public.academies;
  v_o      public.saas_offers;
  v_usadas integer;
  v_comp   date := date_trunc('month', public._today())::date;
  v_price  jsonb;
begin
  if not (public.super_can('academias') or public.super_can('financeiro')) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into v_a from public.academies where id = p_academy and deleted_at is null for update;
  if v_a.id is null then
    raise exception 'Academia não encontrada';
  end if;
  if p_ciclo not in ('mensal', 'anual') then
    raise exception 'Ciclo inválido';
  end if;
  if not exists (select 1 from public.saas_plans where id = p_plan and deleted_at is null) then
    raise exception 'Plano inválido';
  end if;

  -- oferta: só valida quando é nova para esta academia
  if p_offer is not null and p_offer is distinct from v_a.offer_id then
    select * into v_o from public.saas_offers where id = p_offer for update;
    if v_o.id is null or not v_o.ativo then
      raise exception 'Oferta indisponível';
    end if;
    if v_o.valido_ate is not null and v_o.valido_ate < public._today() then
      raise exception 'A oferta "%" encerrou em %', v_o.nome, to_char(v_o.valido_ate, 'DD/MM/YYYY');
    end if;
    if v_o.uf is not null and upper(coalesce(v_a.uf, '')) <> upper(v_o.uf) then
      raise exception 'A oferta "%" vale só para academias de %. Informe a UF da academia.', v_o.nome, v_o.uf;
    end if;
    if v_o.cidade is not null and lower(coalesce(v_a.cidade, '')) <> lower(v_o.cidade) then
      raise exception 'A oferta "%" vale só para academias de %.', v_o.nome, v_o.cidade;
    end if;
    if v_o.limite_academias is not null then
      select count(*) into v_usadas from public.academies where offer_id = v_o.id and deleted_at is null and id <> p_academy;
      if v_usadas >= v_o.limite_academias then
        raise exception 'As vagas da oferta "%" (%) já foram preenchidas', v_o.nome, v_o.limite_academias;
      end if;
    end if;
  end if;

  update public.academies set
    saas_plan_id = p_plan,
    ciclo_inicio = case when ciclo is distinct from p_ciclo or ciclo_inicio is null then v_comp else ciclo_inicio end,
    ciclo = p_ciclo,
    offer_id = p_offer,
    oferta_ate = case
      when p_offer is null then null
      when p_offer is distinct from offer_id then
        case when v_o.meses is null then null else (v_comp + make_interval(months => v_o.meses))::date - 1 end
      else oferta_ate end
  where id = p_academy;

  delete from public.academy_addons where academy_id = p_academy and not (addon_id = any (coalesce(p_addons, '{}')));
  insert into public.academy_addons (academy_id, addon_id, valor)
  select p_academy, ad.id, ad.valor from public.saas_addons ad
   where ad.id = any (coalesce(p_addons, '{}')) and ad.ativo
  on conflict (academy_id, addon_id) do nothing;

  -- fatura do mês ainda em aberto acompanha a mudança
  v_price := public._academy_price(p_academy, v_comp);
  update public.saas_invoices
     set valor = (v_price ->> 'total')::numeric, saas_plan_id = p_plan, ciclo = p_ciclo, detalhes = v_price
   where academy_id = p_academy and competencia = v_comp and status = 'pendente';

  return v_price;
end $$;

-- ---------------------------------------------------------------------
-- Faturas: mensal todo mês; anual uma vez por ano (no mês de início do ciclo)
-- ---------------------------------------------------------------------
create or replace function public.generate_saas_invoices(p_competencia date default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_comp  date := date_trunc('month', coalesce(p_competencia, public._today()))::date;
  v_count integer := 0;
  r       record;
  v_price jsonb;
begin
  if not public.super_can('financeiro') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  for r in
    select a.id, a.saas_plan_id, a.ciclo, coalesce(a.ciclo_inicio, date_trunc('month', a.created_at)::date) inicio
      from public.academies a
     where a.deleted_at is null and a.status = 'ativa' and a.saas_plan_id is not null
       and not exists (select 1 from public.saas_invoices i where i.academy_id = a.id and i.competencia = v_comp)
  loop
    if r.ciclo = 'anual' and extract(month from r.inicio) <> extract(month from v_comp) then
      continue; -- anual: só no mês de aniversário do ciclo
    end if;
    v_price := public._academy_price(r.id, v_comp);
    insert into public.saas_invoices (academy_id, saas_plan_id, valor, competencia, vencimento, ciclo, detalhes)
    values (r.id, r.saas_plan_id, (v_price ->> 'total')::numeric, v_comp, v_comp + 9, r.ciclo, v_price)
    on conflict (academy_id, competencia) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Primeira fatura da academia já com a composição do preço
create or replace function public._create_academy(
  p_nome text, p_cnpj text, p_saas_plan_id uuid,
  p_admin_nome text, p_admin_cpf text, p_admin_telefone text default null,
  p_unidade_nome text default 'Unidade Principal'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_academy uuid;
  v_role    uuid;
  v_price   jsonb;
begin
  insert into public.academies (nome, cnpj, saas_plan_id, ciclo_inicio)
  values (p_nome, nullif(p_cnpj, ''), p_saas_plan_id, date_trunc('month', public._today())::date)
  returning id into v_academy;

  insert into public.units (academy_id, nome)
  values (v_academy, coalesce(nullif(p_unidade_nome, ''), 'Unidade Principal'));

  select id into v_role from public.roles where academy_id = v_academy and slug = 'admin';
  perform public._create_member(v_academy, p_admin_nome, p_admin_cpf, p_admin_telefone, null, v_role);

  v_price := public._academy_price(v_academy);
  if v_price is not null then
    insert into public.saas_invoices (academy_id, saas_plan_id, valor, competencia, vencimento, ciclo, detalhes)
    values (v_academy, p_saas_plan_id, (v_price ->> 'total')::numeric, date_trunc('month', public._today())::date,
            public._today() + 10, 'mensal', v_price);
  end if;
  return v_academy;
end $$;

-- ---------------------------------------------------------------------
-- Limite de unidades do plano
-- ---------------------------------------------------------------------
create or replace function public.check_unit_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_limite integer;
  v_plano  text;
begin
  if new.deleted_at is not null or public.is_super_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null then
    return new;
  end if;
  select sp.limite_unidades, sp.nome into v_limite, v_plano
    from public.academies a join public.saas_plans sp on sp.id = a.saas_plan_id where a.id = new.academy_id;
  if v_limite is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('unidades:' || new.academy_id::text));
  if (select count(*) from public.units where academy_id = new.academy_id and deleted_at is null and id <> new.id) >= v_limite then
    raise exception 'O plano % permite até % unidade(s). Fale com o suporte para mudar de plano.', v_plano, v_limite
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists units_limit on public.units;
create trigger units_limit before insert or update of deleted_at on public.units
  for each row execute function public.check_unit_limit();

-- ---------------------------------------------------------------------
-- Dashboard: MRR considera ciclo, descontos e adicionais
-- ---------------------------------------------------------------------
create or replace function public.super_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', public._today())::date;
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total', (select count(*) from public.academies where deleted_at is null),
    'ativas', (select count(*) from public.academies where deleted_at is null and status = 'ativa'),
    'mrr', (select coalesce(sum((public._academy_price(a.id) ->> 'mensal_equivalente')::numeric), 0)
              from public.academies a
             where a.deleted_at is null and a.status = 'ativa' and a.saas_plan_id is not null),
    'inadimplentes', (select count(distinct academy_id) from public.saas_invoices
                       where status = 'pendente' and vencimento < public._today()),
    'total_alunos', (select count(*) from public.students where deleted_at is null and status = 'ativo'),
    'crescimento', (
      select jsonb_agg(jsonb_build_object(
        'mes', to_char(m, 'YYYY-MM'),
        'novas', (select count(*) from public.academies
                   where deleted_at is null and created_at >= m and created_at < m + interval '1 month'),
        'total', (select count(*) from public.academies
                   where deleted_at is null and created_at < m + interval '1 month')
      ) order by m)
      from generate_series(v_mes - interval '11 months', v_mes, interval '1 month') m
    )
  );
end $$;

notify pgrst, 'reload schema';
