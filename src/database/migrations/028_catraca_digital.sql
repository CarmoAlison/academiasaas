-- =====================================================================
-- Migração 028 — Catraca: biometria por impressão digital
--   • Cada catraca diz o que lê (Super Admin → Métodos): rosto, digital,
--     cartão... A ficha do aluno mostra "Cadastrar rosto" e/ou "Cadastrar
--     digital" conforme as catracas da academia.
--   • A foto do rosto vai só para as catracas que fazem reconhecimento facial.
--   • Cadastrar digital: a recepção escolhe a catraca, ela entra em modo de
--     captura (remote_enroll) e o aluno põe o dedo no leitor. A digital fica
--     só no aparelho — o sistema não guarda a digital (LGPD).
--   • Entradas pela digital aparecem como "Digital" no log e no relatório.
--   • Termo de LGPD do contrato cita a digital quando a academia usa.
--   Vale só para equipamentos Control iD.
-- Requer a 027. Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Estrutura
-- ---------------------------------------------------------------------
alter table public.catraca_comandos drop constraint if exists catraca_comandos_tipo_check;
alter table public.catraca_comandos add constraint catraca_comandos_tipo_check
  check (tipo in ('usuario', 'rosto', 'digital', 'liberar', 'remover', 'config'));

alter table public.catraca_usuarios add column if not exists digital_status text not null default 'sem';
alter table public.catraca_usuarios add column if not exists digital_erro text;
alter table public.catraca_usuarios add column if not exists digital_em timestamptz;
alter table public.catraca_usuarios add column if not exists digital_device uuid references public.catraca_devices(id) on delete set null;
alter table public.catraca_usuarios drop constraint if exists catraca_usuarios_digital_status_check;
alter table public.catraca_usuarios add constraint catraca_usuarios_digital_status_check
  check (digital_status in ('sem', 'pendente', 'ok', 'erro'));
grant select (digital_status, digital_erro, digital_em, digital_device) on public.catraca_usuarios to authenticated;

/** A catraca lê esse método? (facial, digital, cartao, senha, qrcode) */
create or replace function public._catraca_le(p_dev public.catraca_devices, p_metodo text)
returns boolean language sql immutable as $$
  select p_metodo = any(coalesce(p_dev.metodos, '{facial}'::text[]));
$$;

/** Como a pessoa se identificou no aparelho */
create or replace function public._catraca_metodo(p_dev public.catraca_devices, p_params jsonb)
returns text language plpgsql immutable as $$
declare
  v_tipo text := lower(concat_ws(' ', p_params ->> 'identifier_id', p_params ->> 'identification_type',
                                      p_params ->> 'identifier', p_params ->> 'type'));
begin
  if nullif(p_params ->> 'card_value', '') is not null and p_params ->> 'card_value' <> '0' then
    return 'cartao';
  elsif nullif(p_params ->> 'qrcode_value', '') is not null then
    return 'qrcode';
  elsif nullif(p_params ->> 'pin_value', '') is not null then
    return 'senha';
  elsif v_tipo ~ '(bio|finger|digital|template)' then
    return 'digital';
  elsif v_tipo ~ 'face' then
    return 'facial';
  elsif public._catraca_le(p_dev, 'digital') and not public._catraca_le(p_dev, 'facial') then
    return 'digital';
  end if;
  return 'facial';
end $$;

-- ---------------------------------------------------------------------
-- Academia
-- ---------------------------------------------------------------------

/** Catracas da academia sem dados técnicos (liberar giro, relatório e ficha do aluno) */
drop function if exists public.catraca_lista_academia(uuid);
create or replace function public.catraca_lista_academia(p_academy uuid)
returns table (id uuid, nome text, sentido text, unidade text, metodos text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_super_admin()
          or p_academy in (select public.academies_with_permission('catraca.ver'))
          or p_academy in (select public.academies_with_permission('catraca.liberar'))
          or p_academy in (select public.academies_with_permission('catraca.biometria'))
          or p_academy in (select public.academies_with_permission('alunos.ver'))) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
  select d.id, d.nome, d.sentido, u.nome, d.metodos
    from public.catraca_devices d left join public.units u on u.id = d.unit_id
   where d.academy_id = p_academy and d.ativo
   order by d.nome;
end $$;

/** Cadastra o rosto: a foto (já enviada para catraca-faces/<academia>/...) vai para as catracas com reconhecimento facial */
create or replace function public.catraca_cadastrar_rosto(p_student uuid, p_foto_path text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_s  public.students;
  v_cu public.catraca_usuarios;
begin
  select * into v_s from public.students where id = p_student and deleted_at is null;
  if v_s.id is null then
    raise exception 'Aluno não encontrado';
  end if;
  if not (public.super_can('academias') or v_s.academy_id in (select public.academies_with_permission('catraca.biometria'))) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if not public.has_module(v_s.academy_id, 'catraca') then
    raise exception 'A catraca não está habilitada para esta academia';
  end if;
  if p_foto_path is null or p_foto_path not like v_s.academy_id::text || '/%' then
    raise exception 'Foto inválida';
  end if;
  if not exists (select 1 from public.catraca_devices d
                  where d.academy_id = v_s.academy_id and d.ativo and public._catraca_le(d, 'facial')) then
    raise exception 'Nenhuma catraca com reconhecimento facial nesta academia';
  end if;

  v_cu := public._catraca_usuario(p_student);
  update public.catraca_usuarios set face_status = 'pendente', face_erro = null, foto_path = p_foto_path, updated_at = now()
   where student_id = p_student;
  -- comandos antigos de rosto deste aluno que ainda não foram: substituídos pelo novo
  update public.catraca_comandos set status = 'erro', resposta = 'Substituído por uma foto mais nova', concluido_em = now()
   where student_id = p_student and tipo = 'rosto' and status in ('pendente', 'enviado');
  insert into public.catraca_comandos (device_id, tipo, student_id, payload)
  select d.id, 'rosto', p_student, jsonb_build_object(
    'verb', 'POST', 'endpoint', 'user_set_image_list', 'contentType', 'application/json',
    'body', jsonb_build_object('match', false, 'user_images', jsonb_build_array(jsonb_build_object(
      'user_id', v_cu.user_id, 'timestamp', extract(epoch from now())::bigint, 'image', '__FOTO__'))))
    from public.catraca_devices d
   where d.academy_id = v_s.academy_id and d.ativo and public._catraca_le(d, 'facial');
end $$;

/**
 * Cadastra a digital: a catraca escolhida entra em modo de captura e o aluno
 * põe o dedo no leitor. A digital fica guardada só no aparelho.
 */
create or replace function public.catraca_cadastrar_digital(p_student uuid, p_device uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_s   public.students;
  v_dev public.catraca_devices;
  v_cu  public.catraca_usuarios;
begin
  select * into v_s from public.students where id = p_student and deleted_at is null;
  if v_s.id is null then
    raise exception 'Aluno não encontrado';
  end if;
  if not (public.super_can('academias') or v_s.academy_id in (select public.academies_with_permission('catraca.biometria'))) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if not public.has_module(v_s.academy_id, 'catraca') then
    raise exception 'A catraca não está habilitada para esta academia';
  end if;
  select * into v_dev from public.catraca_devices where id = p_device and academy_id = v_s.academy_id and ativo;
  if v_dev.id is null then
    raise exception 'Catraca não encontrada';
  end if;
  if not public._catraca_le(v_dev, 'digital') then
    raise exception 'Esta catraca não tem leitor de digital';
  end if;

  v_cu := public._catraca_usuario(p_student); -- garante o aluno no aparelho antes da captura
  update public.catraca_comandos set status = 'erro', resposta = 'Substituído por um cadastro mais novo', concluido_em = now()
   where student_id = p_student and tipo = 'digital' and status in ('pendente', 'enviado');
  update public.catraca_usuarios
     set digital_status = 'pendente', digital_erro = null, digital_device = v_dev.id, updated_at = now()
   where student_id = p_student;
  insert into public.catraca_comandos (device_id, tipo, student_id, payload)
  values (v_dev.id, 'digital', p_student, jsonb_build_object(
    'verb', 'POST', 'endpoint', 'remote_enroll', 'contentType', 'application/json',
    'body', jsonb_build_object('type', 'biometry', 'user_id', v_cu.user_id, 'save', true, 'sync', true,
                               'panic_finger', 0, 'message', 'Coloque o dedo no leitor')));
end $$;
grant execute on function public.catraca_cadastrar_digital(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Aparelho → sistema
-- ---------------------------------------------------------------------
create or replace function public.catraca_request(p_token text, p_rota text, p_params jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_dev   public.catraca_devices;
  v_rota  text := regexp_replace(lower(coalesce(p_rota, '')), '^/+|/+$', '', 'g');
  v_cmd   public.catraca_comandos;
  v_resp  jsonb;
  v_ok    boolean;
  v_err   jsonb;
  v_foto  text;
  v_tipo  text;
  v_ac    public.catraca_acessos;
  v_hw    text := coalesce(p_params ->> 'device_id', p_params ->> 'deviceId');
  v_msg   text;
begin
  select * into v_dev from public.catraca_devices where token_hash = public._catraca_token_hash(p_token);
  if v_dev.id is null then
    return jsonb_build_object('status', 404, 'body', jsonb_build_object('error', 'catraca desconhecida'));
  end if;

  update public.catraca_devices
     set ultimo_sinal = now(), ultima_rota = left(v_rota, 60),
         hw_device_id = coalesce(hw_device_id, nullif(v_hw, ''))
   where id = v_dev.id;

  -- catraca desativada pelo Super Admin: não libera ninguém e não recebe comandos
  if not v_dev.ativo then
    if v_rota in ('new_user_identified.fcgi', 'new_card.fcgi', 'new_qrcode.fcgi', 'new_user_id_and_password.fcgi') then
      return jsonb_build_object('status', 200, 'body', jsonb_build_object('result', jsonb_build_object(
        'event', 6, 'user_image', false, 'portal_id', public._catraca_portal(p_params ->> 'portal_id'),
        'actions', '[]'::jsonb, 'message', 'Catraca desativada. Procure a recepção.')));
    end if;
    return jsonb_build_object('status', 200, 'body', null);
  end if;

  if v_rota = 'session_is_valid.fcgi' then
    return jsonb_build_object('status', 200, 'body', jsonb_build_object('session_is_valid', true));

  elsif v_rota in ('device_is_alive.fcgi', 'new_rex_log.fcgi') or v_rota like 'api/notifications/%' and v_rota <> 'api/notifications/catra_event' then
    return jsonb_build_object('status', 200, 'body', null);

  elsif v_rota = 'new_user_identified.fcgi' then
    return jsonb_build_object('status', 200, 'body', public._catraca_decidir(
      v_dev, case when p_params ->> 'user_id' ~ '^\d+$' then (p_params ->> 'user_id')::bigint end,
      public._catraca_metodo(v_dev, p_params), p_params ->> 'portal_id'));

  elsif v_rota = 'new_card.fcgi' then
    return jsonb_build_object('status', 200, 'body', public._catraca_decidir(
      v_dev,
      (select user_id from public.catraca_usuarios
        where academy_id = v_dev.academy_id
          and cartao = case when p_params ->> 'card_value' ~ '^\d+$' then (p_params ->> 'card_value')::bigint end),
      'cartao', p_params ->> 'portal_id'));

  elsif v_rota in ('new_qrcode.fcgi', 'new_user_id_and_password.fcgi') then
    return jsonb_build_object('status', 200, 'body', jsonb_build_object('result', jsonb_build_object(
      'event', 6, 'user_image', false, 'portal_id', public._catraca_portal(p_params ->> 'portal_id'), 'actions', '[]'::jsonb,
      'message', case when public._catraca_le(v_dev, 'digital') and not public._catraca_le(v_dev, 'facial')
                      then 'Use a digital' else 'Use o reconhecimento facial' end)));

  elsif v_rota = 'template_create.fcgi' then
    -- resultado do cadastro de digital quando o aparelho responde em separado (modo assíncrono)
    v_ok := nullif(p_params ->> 'error', '') is null;
    update public.catraca_usuarios
       set digital_status = case when v_ok then 'ok' else 'erro' end,
           digital_erro = case when v_ok then null else left(p_params ->> 'error', 300) end,
           digital_em = now(), digital_device = v_dev.id, updated_at = now()
     where academy_id = v_dev.academy_id
       and user_id = case when p_params ->> 'user_id' ~ '^\d+$' then (p_params ->> 'user_id')::bigint end;
    update public.catraca_comandos set status = case when v_ok then 'ok' else 'erro' end, concluido_em = now(),
           resposta = left(coalesce(nullif(p_params ->> 'error', ''), 'Digital cadastrada'), 2000)
     where device_id = v_dev.id and tipo = 'digital' and status = 'enviado';
    return jsonb_build_object('status', 200, 'body', null);

  elsif v_rota = 'api/notifications/catra_event' then
    -- desistência: liberou mas a pessoa não passou → desfaz o check-in
    if upper(coalesce(p_params #>> '{event,type}', p_params #>> '{event,name}', '')) like '%GIVE%' then
      select * into v_ac from public.catraca_acessos
       where device_id = v_dev.id and resultado = 'liberado' and created_at > now() - interval '2 minutes'
       order by id desc limit 1;
      if v_ac.id is not null then
        if v_ac.checkin_id is not null then
          delete from public.checkins where id = v_ac.checkin_id;
        end if;
        update public.catraca_acessos set resultado = 'desistencia', motivo = 'Liberado, mas não passou', checkin_id = null
         where id = v_ac.id;
      end if;
    end if;
    return jsonb_build_object('status', 200, 'body', null);

  elsif v_rota = 'push' then
    -- cadastro de digital sem resposta: não repete (a catraca pediria o dedo de novo sozinha)
    with sem_resposta as (
      update public.catraca_comandos set status = 'erro', resposta = 'Sem resposta da catraca', concluido_em = now()
       where device_id = v_dev.id and tipo = 'digital' and status = 'enviado' and enviado_em < now() - interval '2 minutes'
      returning student_id
    )
    update public.catraca_usuarios
       set digital_status = 'erro', digital_erro = 'A catraca não concluiu o cadastro. Tente de novo com o aluno na frente do leitor.',
           digital_em = now(), updated_at = now()
     where student_id in (select student_id from sem_resposta) and digital_status = 'pendente';

    -- demais comandos enviados há mais de 2 min sem resposta voltam para a fila (até 5 tentativas)
    update public.catraca_comandos set status = case when tentativas >= 5 then 'erro' else 'pendente' end,
           resposta = case when tentativas >= 5 then 'Sem resposta da catraca' else resposta end
     where device_id = v_dev.id and status = 'enviado' and enviado_em < now() - interval '2 minutes';

    select * into v_cmd from public.catraca_comandos
     where device_id = v_dev.id and status = 'pendente'
     order by case tipo when 'liberar' then 0 when 'usuario' then 1 when 'remover' then 2 else 3 end, id
     limit 1
     for update skip locked;
    if v_cmd.id is null then
      return jsonb_build_object('status', 200, 'body', null);
    end if;
    update public.catraca_comandos set status = 'enviado', enviado_em = now(), tentativas = tentativas + 1,
           uuid = coalesce(nullif(p_params ->> 'uuid', ''), id::text)
     where id = v_cmd.id;
    if v_cmd.tipo = 'rosto' then
      select foto_path into v_foto from public.catraca_usuarios where student_id = v_cmd.student_id;
      if v_foto is null then
        update public.catraca_comandos set status = 'erro', resposta = 'Foto não encontrada', concluido_em = now() where id = v_cmd.id;
        return jsonb_build_object('status', 200, 'body', null);
      end if;
    end if;
    return jsonb_build_object('status', 200, 'body', v_cmd.payload, 'comando', v_cmd.id, 'tipo', v_cmd.tipo, 'foto_path', v_foto);

  elsif v_rota = 'result' then
    select * into v_cmd from public.catraca_comandos
     where device_id = v_dev.id and status = 'enviado'
       and (uuid = nullif(p_params ->> 'uuid', '') or nullif(p_params ->> 'uuid', '') is null)
     order by enviado_em desc limit 1;
    if v_cmd.id is null then
      return jsonb_build_object('status', 200, 'body', null);
    end if;

    v_ok := nullif(p_params ->> 'error', '') is null;
    -- a resposta do aparelho vem como texto JSON
    begin
      v_resp := (p_params ->> 'response')::jsonb;
    exception when others then
      v_resp := null;
    end;
    if v_cmd.tipo = 'rosto' then
      v_ok := v_ok and coalesce((v_resp #>> '{results,0,success}')::boolean, (v_resp ->> 'success')::boolean, false);
      v_err := coalesce(v_resp #> '{results,0,errors,0}', v_resp #> '{errors,0}');
      select foto_path into v_foto from public.catraca_usuarios where student_id = v_cmd.student_id;
      update public.catraca_usuarios
         set face_status = case when v_ok then 'ok' else 'erro' end,
             face_erro = case when v_ok then null
                              else coalesce(public._catraca_erro_rosto((v_err ->> 'code')::int, v_err ->> 'message'),
                                            nullif(p_params ->> 'error', ''), 'Erro no cadastro do rosto') end,
             face_em = now(),
             -- foto sai do sistema quando não há mais envio pendente dela (LGPD)
             foto_path = case when exists (select 1 from public.catraca_comandos c
                                            where c.student_id = v_cmd.student_id and c.tipo = 'rosto'
                                              and c.status in ('pendente', 'enviado') and c.id <> v_cmd.id)
                              then foto_path else null end,
             updated_at = now()
       where student_id = v_cmd.student_id;
      v_tipo := 'rosto';
    elsif v_cmd.tipo = 'digital' then
      v_ok := v_ok and jsonb_typeof(v_resp) is distinct from 'null'
                   and coalesce(v_resp ->> 'error', '') = ''
                   and coalesce((v_resp ->> 'success')::boolean, true);
      v_msg := coalesce(nullif(p_params ->> 'error', ''), nullif(v_resp ->> 'error', ''), nullif(v_resp ->> 'message', ''));
      update public.catraca_usuarios
         set digital_status = case when v_ok then 'ok' else 'erro' end,
             digital_erro = case when v_ok then null
                                 when v_msg ~* 'time ?out|tempo' then 'Tempo esgotado: o aluno não colocou o dedo no leitor'
                                 when v_msg ~* 'cancel' then 'Cadastro cancelado na catraca'
                                 else coalesce(left(v_msg, 300), 'A catraca não concluiu o cadastro da digital') end,
             digital_em = now(), digital_device = v_cmd.device_id, updated_at = now()
       where student_id = v_cmd.student_id;
    end if;

    update public.catraca_comandos
       set status = case when v_ok then 'ok' else 'erro' end,
           resposta = left(coalesce(nullif(p_params ->> 'error', ''), p_params ->> 'response', ''), 2000),
           concluido_em = now()
     where id = v_cmd.id;

    return jsonb_build_object('status', 200, 'body', null,
      'apagar_foto', case when v_tipo = 'rosto'
                            and not exists (select 1 from public.catraca_usuarios where student_id = v_cmd.student_id and foto_path is not null)
                          then v_foto end);
  end if;

  return jsonb_build_object('status', 404, 'body', jsonb_build_object('error', 'rota desconhecida: ' || v_rota));
end $$;
revoke execute on function public.catraca_request(text, text, jsonb) from public, anon, authenticated;
do $$
begin
  execute 'grant execute on function public.catraca_request(text, text, jsonb) to service_role';
exception when undefined_object then
  null; -- ambiente sem o papel service_role (testes)
end $$;

-- ---------------------------------------------------------------------
-- Contrato: termo de LGPD com rosto e/ou digital
-- ---------------------------------------------------------------------
create or replace function public._termo_lgpd(p_academia text, p_facial boolean, p_digital boolean)
returns text language sql immutable as $$
  select E'\n\nTERMO DE TRATAMENTO DE DADOS PESSOAIS (LGPD)\n\n'
    || E'Em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018), o CONTRATANTE declara estar ciente e de acordo com o seguinte:\n\n'
    || E'a) DADOS TRATADOS. ' || p_academia || E' trata nome, CPF, data de nascimento, telefone, e-mail, endereço, dados do plano e de pagamentos, frequência (entradas e check-ins), treinos e informações de saúde informadas pelo CONTRATANTE.\n\n'
    || E'b) FINALIDADES. Os dados são usados para cadastrar e identificar o CONTRATANTE, controlar o acesso à academia, prestar os serviços contratados, montar e acompanhar treinos, realizar cobranças e emitir recibos, enviar comunicações sobre o serviço (inclusive por WhatsApp) e cumprir obrigações legais.\n\n'
    || E'c) COMPARTILHAMENTO. Os dados são armazenados no sistema de gestão contratado pela academia, que atua como operador e só os trata conforme as instruções da academia. Não são vendidos nem cedidos a terceiros para outras finalidades.\n\n'
    || case
         when p_facial and p_digital then
           E'd) DADOS BIOMÉTRICOS (ROSTO E IMPRESSÃO DIGITAL). Para entrar pela catraca, a academia poderá cadastrar uma foto do rosto e/ou a impressão digital do CONTRATANTE, que são transformadas em modelos biométricos guardados apenas no equipamento de controle de acesso. A foto é apagada do sistema logo após o cadastro no equipamento, e a impressão digital é lida diretamente pelo equipamento, sem ser armazenada no sistema. '
         when p_facial then
           E'd) RECONHECIMENTO FACIAL (DADO BIOMÉTRICO). Para entrar pela catraca, a academia poderá cadastrar uma foto do rosto do CONTRATANTE, que é transformada em um modelo biométrico guardado apenas no equipamento de controle de acesso. A foto é apagada do sistema logo após o cadastro no equipamento. '
         when p_digital then
           E'd) IMPRESSÃO DIGITAL (DADO BIOMÉTRICO). Para entrar pela catraca, a academia poderá cadastrar a impressão digital do CONTRATANTE, que é lida diretamente pelo equipamento de controle de acesso e guardada apenas nele, como modelo biométrico, sem ser armazenada no sistema. '
         else '' end
    || case when p_facial or p_digital then
         E'Este consentimento é específico e destacado, nos termos do art. 11 da LGPD, e pode ser revogado a qualquer momento junto à recepção; nesse caso, o dado biométrico é removido do equipamento e o acesso passa a ser feito por outro meio (cartão, QR Code ou liberação pela recepção), sem qualquer prejuízo ao CONTRATANTE.\n\n'
       else '' end
    || (case when p_facial or p_digital then 'e' else 'd' end) || E') GUARDA. Os dados são mantidos enquanto durar o vínculo com a academia e, depois, pelo prazo necessário para cumprir obrigações legais (como fiscais e contábeis), sendo então eliminados.\n\n'
    || (case when p_facial or p_digital then 'f' else 'e' end) || E') DIREITOS DO TITULAR. O CONTRATANTE pode, a qualquer momento, solicitar à academia a confirmação e o acesso aos seus dados, a correção de dados incompletos ou desatualizados, a eliminação de dados desnecessários, informações sobre o compartilhamento e a revogação do consentimento, nos termos do art. 18 da LGPD.\n\n'
    || 'Ao aceitar eletronicamente este contrato, o CONTRATANTE declara ter lido e concordado com este termo'
    || case
         when p_facial and p_digital then ', inclusive com o uso do rosto e da impressão digital descrito no item d.'
         when p_facial then ', inclusive com o uso do reconhecimento facial descrito no item d.'
         when p_digital then ', inclusive com o uso da impressão digital descrito no item d.'
         else '.' end;
$$;

-- versão antiga (só rosto) continua funcionando
create or replace function public._termo_lgpd(p_academia text, p_biometria boolean)
returns text language sql immutable as $$
  select public._termo_lgpd(p_academia, p_biometria, false);
$$;

/** Biometria que a academia usa: rosto (padrão da catraca) e/ou digital, conforme as catracas cadastradas */
create or replace function public._academia_biometria(p_academy uuid, out facial boolean, out digital boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  facial := false;
  digital := false;
  if not public.has_module(p_academy, 'catraca') then
    return;
  end if;
  if not exists (select 1 from public.catraca_devices where academy_id = p_academy and ativo) then
    facial := true; -- catraca contratada, aparelho ainda não cadastrado
    return;
  end if;
  facial := exists (select 1 from public.catraca_devices d where d.academy_id = p_academy and d.ativo and public._catraca_le(d, 'facial'));
  digital := exists (select 1 from public.catraca_devices d where d.academy_id = p_academy and d.ativo and public._catraca_le(d, 'digital'));
end $$;
revoke execute on function public._academia_biometria(uuid) from public, anon, authenticated;

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
  v_bio record;
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

  -- termo de LGPD sempre ao final (com a biometria que a academia usa na catraca)
  if position('TERMO DE TRATAMENTO DE DADOS PESSOAIS (LGPD)' in conteudo) = 0 then
    select * into v_bio from public._academia_biometria(v_s.academy_id);
    conteudo := conteudo || public._termo_lgpd(v_a.nome, v_bio.facial, v_bio.digital);
  end if;
end $$;
revoke execute on function public._render_contract(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
