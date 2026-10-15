-- =====================================================================
-- Migração 029 — Contrato do SaaS com a academia (assinatura eletrônica)
--   • Super Admin → Contrato: título, texto com variáveis, estilo, cor,
--     logo e assinatura do contrato (saas_settings.dados -> 'contrato').
--   • Página da academia → aba Contrato: gerar, ver, baixar PDF e cancelar.
--   • O Admin da academia assina eletronicamente pelo painel dele
--     (data, hora, IP, navegador e código de verificação SHA-256).
--   • Variáveis: {academia} {cnpj} {endereco} {plano} {valor} {ciclo}
--                {empresa} {empresa_cnpj} {cidade} {data}
-- Requer a 028. Pode ser executada mais de uma vez.
-- =====================================================================

create table if not exists public.saas_contracts (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id) on delete cascade,
  titulo            text not null,
  conteudo          text not null,
  hash              text not null,
  status            text not null default 'pendente' check (status in ('pendente', 'aceito', 'cancelado')),
  criado_por        uuid default auth.uid() references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  aceito_em         timestamptz,
  aceite_por        uuid references auth.users(id) on delete set null,
  aceite_ip         text,
  aceite_user_agent text,
  aceite_nome       text,
  aceite_cpf        text
);
create index if not exists saas_contracts_academy_idx on public.saas_contracts (academy_id, created_at desc);
alter table public.saas_contracts enable row level security;

-- leitura: Super Admin ou Admin da própria academia; escrita só pelas funções
drop policy if exists saas_contracts_select on public.saas_contracts;
create policy saas_contracts_select on public.saas_contracts for select to authenticated
  using ((select public.is_super_admin()) or public.is_academy_admin(academy_id));
revoke all on public.saas_contracts from anon, authenticated;
grant select on public.saas_contracts to authenticated;

drop trigger if exists saas_contracts_audit on public.saas_contracts;
create trigger saas_contracts_audit after insert or update or delete on public.saas_contracts
  for each row execute function public.audit_trigger();

/** Modelo padrão (usado enquanto o Super Admin não escreve o seu) */
create or replace function public.default_saas_contract_text()
returns text language sql immutable as $$
  select E'CONTRATO DE LICENÇA DE USO DE SOFTWARE\n\n'
    || E'CONTRATADA: {empresa}, CNPJ {empresa_cnpj}.\n'
    || E'CONTRATANTE: {academia}, CNPJ {cnpj}, {endereco}.\n\n'
    || E'1. OBJETO. A CONTRATADA concede à CONTRATANTE o direito de uso, não exclusivo e intransferível, do sistema de gestão de academias, acessado pela internet, no plano {plano}, com os módulos e limites desse plano.\n\n'
    || E'2. VALOR E PAGAMENTO. Pelo uso do sistema a CONTRATANTE pagará {valor}, com cobrança {ciclo}, por meio das faturas disponíveis no painel da academia. O atraso no pagamento pode levar à suspensão do acesso até a regularização.\n\n'
    || E'3. VIGÊNCIA. Este contrato vale a partir de {data}, por prazo indeterminado, e pode ser encerrado por qualquer das partes a qualquer momento, sem multa, com aviso prévio de 30 dias.\n\n'
    || E'4. OBRIGAÇÕES DA CONTRATADA. Manter o sistema disponível, com cópias de segurança dos dados, corrigir falhas e prestar suporte pelos canais do sistema.\n\n'
    || E'5. OBRIGAÇÕES DA CONTRATANTE. Usar o sistema de acordo com a lei, manter as senhas de acesso em sigilo, cadastrar dados corretos e obter dos seus alunos as autorizações exigidas pela LGPD.\n\n'
    || E'6. PROTEÇÃO DE DADOS (LGPD). A CONTRATANTE é a controladora dos dados dos seus alunos e colaboradores; a CONTRATADA atua como operadora e só trata esses dados para prestar o serviço, conforme as instruções da CONTRATANTE, sem vendê-los ou cedê-los a terceiros. Ao fim do contrato, os dados podem ser exportados pela CONTRATANTE e depois são eliminados, salvo obrigação legal de guarda.\n\n'
    || E'7. RESPONSABILIDADE. A CONTRATADA não responde por danos causados por mau uso do sistema, por falhas na internet da CONTRATANTE ou por informações cadastradas incorretamente.\n\n'
    || E'8. ACEITE ELETRÔNICO. O aceite deste contrato pelo administrador da CONTRATANTE, com login pessoal no painel da academia, tem a mesma validade da assinatura, ficando registrados data, hora, endereço IP e código de verificação.\n\n'
    || E'9. FORO. Fica eleito o foro da comarca de {cidade} para resolver questões deste contrato.\n\n'
    || '{cidade}, {data}.';
$$;

/** Valor em reais (R$ 1.234,56) */
create or replace function public._moeda(p_valor numeric)
returns text language sql immutable as $$
  select case when p_valor is null then '—'
              else 'R$ ' || translate(to_char(p_valor, 'FM999,999,990.00'), ',.', '.,') end;
$$;

/** Texto do contrato do SaaS com os dados da academia (variáveis entre chaves) */
create or replace function public._render_saas_contract(p_academy uuid, out titulo text, out conteudo text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_a     public.academies;
  v_cfg   jsonb;
  v_ct    jsonb;
  v_preco jsonb;
  v_end   text;
  v_cid   text;
begin
  select * into v_a from public.academies where id = p_academy;
  select coalesce(dados, '{}'::jsonb) into v_cfg from public.saas_settings where id = 1;
  v_cfg := coalesce(v_cfg, '{}'::jsonb);
  v_ct := coalesce(v_cfg -> 'contrato', '{}'::jsonb);
  v_preco := public._academy_price(p_academy);

  v_end := nullif(concat_ws(', ', nullif(trim(v_a.endereco), ''), nullif(trim(v_a.bairro), ''),
                            nullif(concat_ws('/', nullif(trim(v_a.cidade), ''), nullif(trim(v_a.uf), '')), '')), '');
  v_cid := coalesce(nullif(trim(v_cfg ->> 'cidade'), ''), nullif(trim(v_a.cidade), ''), '—');

  titulo := coalesce(nullif(trim(v_ct ->> 'titulo'), ''), 'Contrato de licença de uso do sistema');
  conteudo := coalesce(nullif(trim(v_ct ->> 'texto'), ''), public.default_saas_contract_text());
  conteudo := replace(conteudo, '{academia}', v_a.nome);
  conteudo := replace(conteudo, '{cnpj}', coalesce(regexp_replace(v_a.cnpj, '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5'), '—'));
  conteudo := replace(conteudo, '{endereco}', coalesce(v_end, 'endereço não informado'));
  conteudo := replace(conteudo, '{plano}', coalesce(v_preco ->> 'plano', 'contratado'));
  conteudo := replace(conteudo, '{valor}',
    case when v_preco is null then '—'
         when v_preco ->> 'ciclo' = 'anual' then public._moeda((v_preco ->> 'total')::numeric) || ' por ano'
         else public._moeda((v_preco ->> 'total')::numeric) || ' por mês' end);
  conteudo := replace(conteudo, '{ciclo}', case when v_preco ->> 'ciclo' = 'anual' then 'anual' else 'mensal' end);
  conteudo := replace(conteudo, '{empresa}', coalesce(nullif(trim(v_cfg ->> 'nome'), ''), 'Academia SaaS'));
  conteudo := replace(conteudo, '{empresa_cnpj}',
    coalesce(regexp_replace(nullif(regexp_replace(coalesce(v_cfg ->> 'cnpj', ''), '\D', '', 'g'), ''),
                            '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5'), '—'));
  conteudo := replace(conteudo, '{cidade}', v_cid);
  conteudo := replace(conteudo, '{data}', to_char(public._today(), 'DD/MM/YYYY'));
end $$;
revoke execute on function public._render_saas_contract(uuid) from public, anon, authenticated;

/** Gera (ou reenvia) o contrato para o Admin da academia assinar. O pendente anterior é cancelado. */
create or replace function public.issue_saas_contract(p_academy uuid)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_r  record;
  v_id uuid;
begin
  if not public.super_can('academias') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.academies where id = p_academy and deleted_at is null) then
    raise exception 'Academia não encontrada';
  end if;
  perform pg_advisory_xact_lock(hashtext('contrato-saas:' || p_academy::text));
  select * into v_r from public._render_saas_contract(p_academy);
  update public.saas_contracts set status = 'cancelado' where academy_id = p_academy and status = 'pendente';
  insert into public.saas_contracts (academy_id, titulo, conteudo, hash)
  values (p_academy, v_r.titulo, v_r.conteudo, encode(digest(v_r.titulo || E'\n' || v_r.conteudo, 'sha256'), 'hex'))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.cancel_saas_contract(p_contract uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c public.saas_contracts;
begin
  if not public.super_can('academias') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into v_c from public.saas_contracts where id = p_contract for update;
  if v_c.id is null then
    raise exception 'Contrato não encontrado';
  end if;
  if v_c.status <> 'pendente' then
    raise exception 'Só contratos aguardando assinatura podem ser cancelados';
  end if;
  update public.saas_contracts set status = 'cancelado' where id = p_contract;
end $$;

/** Assinatura eletrônica pelo Admin da academia: confere a integridade do texto e registra quem, quando, IP e navegador */
create or replace function public.accept_saas_contract(p_contract uuid, p_user_agent text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_c    public.saas_contracts;
  v_nome text;
  v_cpf  text;
begin
  select * into v_c from public.saas_contracts where id = p_contract for update;
  if v_c.id is null or not public.is_academy_admin(v_c.academy_id) then
    raise exception 'Contrato não encontrado' using errcode = '42501';
  end if;
  if v_c.status <> 'pendente' then
    raise exception 'Este contrato não está mais disponível para assinatura';
  end if;
  if v_c.hash <> encode(digest(v_c.titulo || E'\n' || v_c.conteudo, 'sha256'), 'hex') then
    raise exception 'Falha na verificação do contrato. Peça ao suporte para reenviá-lo.';
  end if;
  select p.nome, p.cpf into v_nome, v_cpf
    from public.profiles p
   where p.user_id = auth.uid() and p.academy_id = v_c.academy_id and p.deleted_at is null
   limit 1;
  if v_nome is null then
    select coalesce(raw_user_meta_data ->> 'nome', email) into v_nome from auth.users where id = auth.uid();
  end if;

  update public.saas_contracts
     set status = 'aceito', aceito_em = now(), aceite_por = auth.uid(), aceite_ip = public._client_ip(),
         aceite_user_agent = left(p_user_agent, 500), aceite_nome = v_nome, aceite_cpf = v_cpf
   where id = p_contract;
  return jsonb_build_object('aceito_em', now(), 'hash', v_c.hash);
end $$;

/** Dados completos para tela/PDF (mesmo formato do contrato do aluno: emissor = empresa do SaaS) */
create or replace function public.get_saas_contract(p_contract uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_c   public.saas_contracts;
  v_a   public.academies;
  v_cfg jsonb;
begin
  select * into v_c from public.saas_contracts where id = p_contract;
  if v_c.id is null or not (public.is_super_admin() or public.is_academy_admin(v_c.academy_id)) then
    raise exception 'Contrato não encontrado' using errcode = '42501';
  end if;
  select * into v_a from public.academies where id = v_c.academy_id;
  select coalesce(dados, '{}'::jsonb) into v_cfg from public.saas_settings where id = 1;
  v_cfg := coalesce(v_cfg, '{}'::jsonb);

  return jsonb_build_object(
    'tipo', 'saas',
    'contrato', to_jsonb(v_c) - 'aceite_user_agent' - 'aceite_por',
    'contratante', jsonb_build_object('nome', v_a.nome, 'cnpj', v_a.cnpj),
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
    'config', v_cfg -> 'contrato'
  );
end $$;

notify pgrst, 'reload schema';
