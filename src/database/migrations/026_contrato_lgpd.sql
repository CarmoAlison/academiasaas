-- =====================================================================
-- Migração 026 — Termo de LGPD no contrato e aceite obrigatório
--   • Todo contrato emitido passa a terminar com o "TERMO DE TRATAMENTO DE
--     DADOS PESSOAIS (LGPD)" — inclusive quando a academia usa texto próprio.
--     Com o módulo Catraca, o termo traz o consentimento específico para o
--     reconhecimento facial (dado biométrico, art. 11 da LGPD).
--   • meu_contrato_pendente(): ao entrar na área do aluno, devolve o contrato
--     que ele precisa aceitar. Se ele ainda não aceitou nenhum contrato com o
--     termo de LGPD (inclusive quem aceitou um contrato antigo), um novo é
--     gerado na hora. A área do aluno fica bloqueada até o aceite.
--   • Vale para academias com o módulo "Contrato digital".
-- Requer a 025. Pode ser executada mais de uma vez.
-- =====================================================================

/** Texto do termo de LGPD (o título é o marcador usado para saber se o aluno já aceitou) */
create or replace function public._termo_lgpd(p_academia text, p_biometria boolean)
returns text language sql immutable as $$
  select E'\n\nTERMO DE TRATAMENTO DE DADOS PESSOAIS (LGPD)\n\n'
    || E'Em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018), o CONTRATANTE declara estar ciente e de acordo com o seguinte:\n\n'
    || E'a) DADOS TRATADOS. ' || p_academia || E' trata nome, CPF, data de nascimento, telefone, e-mail, endereço, dados do plano e de pagamentos, frequência (entradas e check-ins), treinos e informações de saúde informadas pelo CONTRATANTE.\n\n'
    || E'b) FINALIDADES. Os dados são usados para cadastrar e identificar o CONTRATANTE, controlar o acesso à academia, prestar os serviços contratados, montar e acompanhar treinos, realizar cobranças e emitir recibos, enviar comunicações sobre o serviço (inclusive por WhatsApp) e cumprir obrigações legais.\n\n'
    || E'c) COMPARTILHAMENTO. Os dados são armazenados no sistema de gestão contratado pela academia, que atua como operador e só os trata conforme as instruções da academia. Não são vendidos nem cedidos a terceiros para outras finalidades.\n\n'
    || case when p_biometria then
         E'd) RECONHECIMENTO FACIAL (DADO BIOMÉTRICO). Para entrar pela catraca, a academia poderá cadastrar uma foto do rosto do CONTRATANTE, que é transformada em um modelo biométrico guardado apenas no equipamento de controle de acesso. A foto é apagada do sistema logo após o cadastro no equipamento. Este consentimento é específico e destacado, nos termos do art. 11 da LGPD, e pode ser revogado a qualquer momento junto à recepção; nesse caso, o rosto é removido do equipamento e o acesso passa a ser feito por outro meio (cartão, QR Code ou liberação pela recepção), sem qualquer prejuízo ao CONTRATANTE.\n\n'
       else '' end
    || (case when p_biometria then 'e' else 'd' end) || E') GUARDA. Os dados são mantidos enquanto durar o vínculo com a academia e, depois, pelo prazo necessário para cumprir obrigações legais (como fiscais e contábeis), sendo então eliminados.\n\n'
    || (case when p_biometria then 'f' else 'e' end) || E') DIREITOS DO TITULAR. O CONTRATANTE pode, a qualquer momento, solicitar à academia a confirmação e o acesso aos seus dados, a correção de dados incompletos ou desatualizados, a eliminação de dados desnecessários, informações sobre o compartilhamento e a revogação do consentimento, nos termos do art. 18 da LGPD.\n\n'
    || 'Ao aceitar eletronicamente este contrato, o CONTRATANTE declara ter lido e concordado com este termo'
    || case when p_biometria then ', inclusive com o uso do reconhecimento facial descrito no item d.' else '.' end;
$$;

/** Texto do contrato com os dados do aluno + termo de LGPD ao final */
create or replace function public._render_contract(p_student uuid, out titulo text, out conteudo text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_s   public.students;
  v_p   public.profiles;
  v_pl  public.plans;
  v_a   public.academies;
  v_u   public.units;
  v_cfg jsonb;
  v_txt text;
  v_moeda text;
begin
  select * into v_s from public.students where id = p_student;
  select * into v_p from public.profiles where id = v_s.profile_id;
  select * into v_pl from public.plans where id = v_s.plan_id;
  select * into v_a from public.academies where id = v_s.academy_id;
  select * into v_u from public.units where id = v_s.unit_id;
  v_cfg := public._academy_cfg(v_s.academy_id);

  v_txt := coalesce(nullif(trim(v_cfg ->> 'contrato_texto'), ''), public.default_contract_text());
  v_moeda := case when v_pl.valor is null then '—'
                  else 'R$ ' || translate(to_char(v_pl.valor, 'FM999,999,990.00'), ',.', '.,') end;

  titulo := coalesce(nullif(trim(v_cfg ->> 'contrato_titulo'), ''), 'Contrato de prestação de serviços');
  conteudo := replace(replace(replace(replace(replace(replace(replace(replace(replace(v_txt,
    '{nome}', v_p.nome),
    '{cpf}', regexp_replace(v_p.cpf, '^(\d{3})(\d{3})(\d{3})(\d{2})$', '\1.\2.\3-\4')),
    '{plano}', coalesce(v_pl.nome, 'contratado')),
    '{valor}', v_moeda),
    '{duracao}', coalesce(v_pl.duracao_meses, 1)::text),
    '{academia}', v_a.nome),
    '{cnpj}', coalesce(regexp_replace(v_a.cnpj, '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5'), '—')),
    '{cidade}', coalesce(v_u.cidade, '')),
    '{data}', to_char(public._today(), 'DD/MM/YYYY'));
  conteudo := regexp_replace(conteudo, '^, ', '', 'gm'); -- "{cidade}, " sem cidade

  -- termo de LGPD sempre ao final (com o reconhecimento facial quando a academia usa catraca)
  if position('TERMO DE TRATAMENTO DE DADOS PESSOAIS (LGPD)' in conteudo) = 0 then
    conteudo := conteudo || public._termo_lgpd(v_a.nome, public.has_module(v_s.academy_id, 'catraca'));
  end if;
end $$;
revoke execute on function public._render_contract(uuid) from public, anon, authenticated;

/**
 * Contrato que o aluno logado precisa aceitar para usar a área do aluno (ou null).
 * Gera um novo quando ele não tem nenhum contrato aceito com o termo de LGPD.
 */
create or replace function public.meu_contrato_pendente(p_academy uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid;
  v_id      uuid;
begin
  if not public.has_module(p_academy, 'contratos') then
    return null;
  end if;
  select s.id into v_student
    from public.students s join public.profiles p on p.id = s.profile_id
   where p.user_id = auth.uid() and s.academy_id = p_academy and s.deleted_at is null and p.deleted_at is null
   limit 1;
  if v_student is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('contrato:' || v_student::text));

  -- pendente: é esse que ele precisa aceitar
  select id into v_id from public.contracts
   where student_id = v_student and status = 'pendente'
   order by created_at desc limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- já aceitou um contrato com o termo de LGPD: liberado
  if exists (select 1 from public.contracts
              where student_id = v_student and status = 'aceito'
                and position('TERMO DE TRATAMENTO DE DADOS PESSOAIS (LGPD)' in conteudo) > 0) then
    return null;
  end if;

  -- nunca aceitou (ou aceitou um contrato antigo, sem o termo): gera agora
  return public._issue_contract(v_student);
end $$;
grant execute on function public.meu_contrato_pendente(uuid) to authenticated;

notify pgrst, 'reload schema';
