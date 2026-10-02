-- =====================================================================
-- Migração 012 — QR Code de check-in troca a cada 5 minutos (antes: 30 s)
--   • checkin_qr: código da janela atual de 5 min + segundos até a troca
--   • do_checkin: aceita o código atual e, nos 2 primeiros minutos após a troca,
--     também o anterior (quem leu o QR pouco antes de mudar ainda consegue entrar).
--     Validade máxima de um código: 7 minutos.
-- Requer a 009. Pode ser executada mais de uma vez.
-- =====================================================================

create or replace function public.checkin_qr(p_academy uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_epoch  numeric := extract(epoch from now());
  v_janela bigint := floor(v_epoch / 300);
begin
  if not public.has_permission(p_academy, 'alunos.editar') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'codigo', public._checkin_code(p_academy, v_janela),
    'expira_em', ceil((v_janela + 1) * 300 - v_epoch)::int
  );
end $$;

create or replace function public.do_checkin(p_academy uuid, p_codigo text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_epoch   numeric := extract(epoch from now());
  v_janela  bigint := floor(v_epoch / 300);
  v_student uuid;
begin
  select s.id into v_student
    from public.students s
    join public.profiles p on p.id = s.profile_id
   where p.user_id = auth.uid() and s.academy_id = p_academy
     and s.deleted_at is null and p.deleted_at is null and s.status = 'ativo';
  if v_student is null or not public.is_member(p_academy) then
    raise exception 'Check-in disponível apenas para alunos ativos desta academia' using errcode = '42501';
  end if;
  if coalesce(p_codigo, '') <> public._checkin_code(p_academy, v_janela)
     and not (v_epoch - v_janela * 300 < 120 and p_codigo = public._checkin_code(p_academy, v_janela - 1)) then
    raise exception 'QR Code expirado. Leia o código que está na tela da recepção agora.';
  end if;
  return public._register_checkin(p_academy, v_student, 'qr');
end $$;

notify pgrst, 'reload schema';
