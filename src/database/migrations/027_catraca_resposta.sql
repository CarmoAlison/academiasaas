-- =====================================================================
-- Migração 027 — Catraca: resposta da identificação no formato da Control iD
--   O sistema liberava o aluno (o log mostrava "Entrou"), mas a catraca não
--   girava e mostrava "erro de comunicação": o portal_id ia como texto ("1")
--   e o aparelho espera número (1), como na documentação da Control iD.
-- Requer a 024. Pode ser executada mais de uma vez.
-- =====================================================================

/** portal_id do aparelho como número (o firmware não aceita texto) */
create or replace function public._catraca_portal(p_portal text)
returns jsonb language sql immutable as $$
  select case when p_portal ~ '^\d+$' then to_jsonb(p_portal::bigint) else to_jsonb(1) end;
$$;

/** Decide se libera o aluno e registra o acesso */
create or replace function public._catraca_decidir(p_dev public.catraca_devices, p_user_id bigint, p_metodo text, p_portal text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cu    public.catraca_usuarios;
  v_s     public.students;
  v_nome  text;
  v_cfg   jsonb := public._academy_cfg(p_dev.academy_id);
  v_msg   text;
  v_ck    jsonb;
  v_ckid  uuid;
begin
  select * into v_cu from public.catraca_usuarios where user_id = p_user_id and academy_id = p_dev.academy_id;
  if v_cu.student_id is not null then
    select * into v_s from public.students where id = v_cu.student_id;
    select nome into v_nome from public.profiles where id = v_s.profile_id;
  end if;

  if not public.has_module(p_dev.academy_id, 'catraca') then
    v_msg := 'Catraca não habilitada. Procure a recepção.';
  elsif v_s.id is null then
    v_msg := 'Cadastro não encontrado. Procure a recepção.';
  elsif v_s.deleted_at is not null or v_s.status <> 'ativo' then
    v_msg := 'Matrícula inativa. Procure a recepção.';
  elsif coalesce((v_cfg ->> 'catraca_bloquear_vencido')::boolean, true)
        and v_s.plano_valido_ate is not null and v_s.plano_valido_ate < public._today() then
    v_msg := 'Plano vencido em ' || to_char(v_s.plano_valido_ate, 'DD/MM') || '. Procure a recepção.';
  elsif coalesce((v_cfg ->> 'catraca_bloquear_inadimplente')::boolean, true) and public.is_inadimplente(v_s.id) then
    v_msg := 'Mensalidade em atraso. Procure a recepção.';
  elsif coalesce((v_cfg ->> 'catraca_bloquear_fora_horario')::boolean, false) and not public._academy_open(p_dev.academy_id) then
    v_msg := 'Academia fechada agora.';
  end if;

  if v_msg is not null then
    insert into public.catraca_acessos (academy_id, device_id, student_id, nome, resultado, motivo, metodo)
    values (p_dev.academy_id, p_dev.id, v_s.id,
            case when v_s.id is null then null else v_nome end,
            case when v_s.id is null then 'nao_identificado' else 'bloqueado' end, v_msg, p_metodo);
    return jsonb_build_object('result', jsonb_build_object(
      'event', 6, 'user_id', coalesce(p_user_id, 0), 'user_name', coalesce(v_nome, ''), 'user_image', false,
      'portal_id', public._catraca_portal(p_portal), 'actions', '[]'::jsonb, 'message', v_msg));
  end if;

  -- liberado: entrada vira check-in (saída não)
  if p_dev.sentido <> 'saida' and public.has_module(p_dev.academy_id, 'checkin') then
    v_ck := public._register_checkin(p_dev.academy_id, v_s.id, 'catraca');
    if not coalesce((v_ck ->> 'repetido')::boolean, false) then
      v_ckid := (v_ck ->> 'id')::uuid;
    end if;
  end if;
  insert into public.catraca_acessos (academy_id, device_id, student_id, nome, resultado, metodo, checkin_id)
  values (p_dev.academy_id, p_dev.id, v_s.id, v_nome, 'liberado', p_metodo, v_ckid);

  return jsonb_build_object('result', jsonb_build_object(
    'event', 7, 'user_id', p_user_id, 'user_name', coalesce(v_nome, ''), 'user_image', false,
    'portal_id', public._catraca_portal(p_portal), 'actions', jsonb_build_array(public._catraca_acao(p_dev)),
    'message', 'Bem-vindo(a), ' || split_part(coalesce(v_nome, ''), ' ', 1) || '!'));
end $$;
revoke execute on function public._catraca_decidir(public.catraca_devices, bigint, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
