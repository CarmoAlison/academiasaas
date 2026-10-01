-- =====================================================================
-- Migração 009 — Aulas, check-in, WhatsApp e vídeos
--   • Aulas: lista de espera (promoção automática quando abre vaga), prazo mínimo
--     de cancelamento e limite de reservas por semana (academy_settings)
--   • Check-in por QR Code dinâmico (troca a cada 30 s) ou manual pela recepção,
--     histórico de frequência e "alunos sumidos"
--   • WhatsApp: modelos de mensagem (academy_settings) e registro de envios
--   • Vídeos de exercícios: bucket exercise-videos (upload até 50 MB)
-- Requer a 008. Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Novas configurações da academia
-- ---------------------------------------------------------------------
alter table public.academy_settings add column if not exists aulas_lista_espera boolean not null default true;
alter table public.academy_settings add column if not exists aulas_cancelamento_horas integer not null default 2;
alter table public.academy_settings add column if not exists aulas_limite_semana integer;
alter table public.academy_settings add column if not exists dias_sumido integer not null default 10;
alter table public.academy_settings add column if not exists whatsapp_dias_lembrete integer not null default 3;
alter table public.academy_settings add column if not exists msg_lembrete text;
alter table public.academy_settings add column if not exists msg_atraso text;
alter table public.academy_settings add column if not exists msg_recibo text;
alter table public.academy_settings add column if not exists msg_sumido text;

alter table public.academy_settings drop constraint if exists academy_settings_aulas_check;
alter table public.academy_settings add constraint academy_settings_aulas_check check (
  aulas_cancelamento_horas between 0 and 72
  and (aulas_limite_semana is null or aulas_limite_semana between 1 and 50)
  and dias_sumido between 3 and 120
  and whatsapp_dias_lembrete between 0 and 15
);

-- ---------------------------------------------------------------------
-- Aulas: lista de espera
-- ---------------------------------------------------------------------
alter table public.class_bookings drop constraint if exists class_bookings_status_check;
alter table public.class_bookings add constraint class_bookings_status_check
  check (status in ('reservado', 'cancelado', 'presente', 'falta', 'espera'));
create index if not exists class_bookings_espera_idx on public.class_bookings (class_id, data, updated_at)
  where status = 'espera';

/** Início da aula (fuso da academia) */
create or replace function public._class_start(p_data date, p_horario time)
returns timestamptz language sql immutable as $$
  select (p_data + p_horario) at time zone 'America/Sao_Paulo';
$$;

/**
 * Validações comuns de reserva/lista de espera. Retorna o id do aluno logado.
 * Erros: aluno inativo, inadimplente (se configurado), data passada/aula já começou,
 * dia em que a aula não acontece, limite semanal de reservas.
 */
create or replace function public._booking_student(p_class public.classes, p_data date)
returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_student uuid;
  v_cfg     jsonb := public._academy_cfg(p_class.academy_id);
  v_limite  integer := (v_cfg ->> 'aulas_limite_semana')::int;
  v_semana  date := p_data - ((extract(isodow from p_data)::int) - 1);
  v_total   integer;
begin
  select s.id into v_student
    from public.students s
    join public.profiles p on p.id = s.profile_id
   where p.user_id = auth.uid() and s.academy_id = p_class.academy_id
     and s.deleted_at is null and s.status = 'ativo';
  if v_student is null or not public.is_member(p_class.academy_id) then
    raise exception 'Apenas alunos ativos podem reservar aulas' using errcode = '42501';
  end if;

  if coalesce((v_cfg ->> 'bloquear_reservas_inadimplente')::boolean, true) and public.is_inadimplente(v_student) then
    raise exception 'Reservas bloqueadas: há mensalidade em atraso. Procure a recepção para regularizar.';
  end if;

  if p_data < public._today() or public._class_start(p_data, p_class.horario) <= now() then
    raise exception 'Esta aula já começou ou já passou';
  end if;
  if not (extract(dow from p_data)::smallint = any (p_class.dias_semana)) then
    raise exception 'Esta aula não acontece nesse dia';
  end if;

  if v_limite is not null then
    select count(*) into v_total
      from public.class_bookings b
     where b.student_id = v_student
       and b.data between v_semana and v_semana + 6
       and b.status in ('reservado', 'presente', 'falta')
       and not (b.class_id = p_class.id and b.data = p_data);
    if v_total >= v_limite then
      raise exception 'Você já atingiu o limite de % reserva(s) nesta semana', v_limite;
    end if;
  end if;
  return v_student;
end $$;

create or replace function public.book_class(p_class_id uuid, p_data date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_class   public.classes;
  v_student uuid;
  v_total   integer;
  v_id      uuid;
begin
  select * into v_class from public.classes where id = p_class_id and deleted_at is null and ativo;
  if v_class.id is null then
    raise exception 'Aula não encontrada';
  end if;
  v_student := public._booking_student(v_class, p_data);

  perform 1 from public.classes where id = p_class_id for update;
  select count(*) into v_total
    from public.class_bookings
   where class_id = p_class_id and data = p_data and status in ('reservado', 'presente');
  if v_total >= v_class.capacidade then
    raise exception 'Aula lotada';
  end if;

  insert into public.class_bookings (academy_id, class_id, student_id, data, status)
  values (v_class.academy_id, p_class_id, v_student, p_data, 'reservado')
  on conflict (class_id, student_id, data) do update set status = 'reservado', updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

/** Entra na lista de espera de uma aula lotada (se a academia permitir) */
create or replace function public.join_waitlist(p_class_id uuid, p_data date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_class   public.classes;
  v_student uuid;
  v_total   integer;
  v_id      uuid;
begin
  select * into v_class from public.classes where id = p_class_id and deleted_at is null and ativo;
  if v_class.id is null then
    raise exception 'Aula não encontrada';
  end if;
  if not coalesce((public._academy_cfg(v_class.academy_id) ->> 'aulas_lista_espera')::boolean, true) then
    raise exception 'Esta academia não usa lista de espera';
  end if;
  v_student := public._booking_student(v_class, p_data);

  perform 1 from public.classes where id = p_class_id for update;
  select count(*) into v_total
    from public.class_bookings
   where class_id = p_class_id and data = p_data and status in ('reservado', 'presente');
  if v_total < v_class.capacidade then
    return public.book_class(p_class_id, p_data); -- abriu vaga: reserva direto
  end if;

  insert into public.class_bookings (academy_id, class_id, student_id, data, status)
  values (v_class.academy_id, p_class_id, v_student, p_data, 'espera')
  on conflict (class_id, student_id, data) do update set status = 'espera', updated_at = now()
    where public.class_bookings.status not in ('reservado', 'presente')
  returning id into v_id;
  return v_id;
end $$;

/** Cancela reserva/lista de espera. O aluno respeita o prazo mínimo; a equipe (aulas.editar) não. */
create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking public.class_bookings;
  v_class   public.classes;
  v_staff   boolean;
  v_horas   integer;
begin
  select * into v_booking from public.class_bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Reserva não encontrada';
  end if;
  v_staff := public.has_permission(v_booking.academy_id, 'aulas.editar');
  if not (v_booking.student_id in (select public.my_student_ids()) or v_staff) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if not v_staff and v_booking.status = 'reservado' then
    select * into v_class from public.classes where id = v_booking.class_id;
    v_horas := coalesce((public._academy_cfg(v_booking.academy_id) ->> 'aulas_cancelamento_horas')::int, 2);
    if public._class_start(v_booking.data, v_class.horario) - make_interval(hours => v_horas) < now() then
      raise exception 'Cancelamento permitido só até % hora(s) antes do início da aula', v_horas;
    end if;
  end if;

  update public.class_bookings set status = 'cancelado', updated_at = now() where id = p_booking_id;
end $$;

/** Ao abrir vaga (cancelamento), o 1º da lista de espera vira reserva */
create or replace function public.promote_waitlist()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cap   integer;
  v_total integer;
  v_next  uuid;
begin
  -- só cancelamento antes do início da aula libera vaga (falta/presença não promovem ninguém)
  if old.status <> 'reservado' or new.status <> 'cancelado' then
    return new;
  end if;
  select capacidade into v_cap from public.classes where id = new.class_id;
  if public._class_start(new.data, (select horario from public.classes where id = new.class_id)) <= now() then
    return new;
  end if;
  loop
    select count(*) into v_total from public.class_bookings
     where class_id = new.class_id and data = new.data and status in ('reservado', 'presente');
    exit when v_total >= v_cap;
    select id into v_next from public.class_bookings
     where class_id = new.class_id and data = new.data and status = 'espera'
     order by updated_at, created_at limit 1
     for update skip locked;
    exit when v_next is null;
    update public.class_bookings set status = 'reservado', updated_at = now() where id = v_next;
  end loop;
  return new;
end $$;

drop trigger if exists class_bookings_promote on public.class_bookings;
create trigger class_bookings_promote after update of status on public.class_bookings
  for each row execute function public.promote_waitlist();

/** Posição do aluno logado em cada lista de espera da semana */
create or replace function public.my_waitlist_positions(p_inicio date, p_fim date)
returns table (booking_id uuid, posicao bigint)
language sql stable security definer set search_path = public as $$
  select x.id, x.pos
    from (
      select b.id, b.student_id,
             row_number() over (partition by b.class_id, b.data order by b.updated_at, b.created_at) pos
        from public.class_bookings b
       where b.status = 'espera' and b.data between p_inicio and p_fim
         and (b.class_id, b.data) in (
           select class_id, data from public.class_bookings
            where student_id in (select public.my_student_ids()) and status = 'espera'
         )
    ) x
   where x.student_id in (select public.my_student_ids());
$$;

revoke execute on function public._booking_student(public.classes, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Check-in
-- ---------------------------------------------------------------------
create table if not exists public.checkins (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id) on delete cascade,
  student_id     uuid not null references public.students(id),
  origem         text not null default 'qr' check (origem in ('qr', 'manual')),
  registrado_por uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists checkins_academy_idx on public.checkins (academy_id, created_at desc);
create index if not exists checkins_student_idx on public.checkins (student_id, created_at desc);
alter table public.checkins enable row level security;

drop policy if exists checkins_select on public.checkins;
create policy checkins_select on public.checkins for select to authenticated
  using (academy_id in (select public.academies_with_permission('alunos.ver'))
      or student_id in (select public.my_student_ids()));

-- inclusão só pelas funções; exclusão (desfazer engano) por quem edita alunos
drop policy if exists checkins_delete on public.checkins;
create policy checkins_delete on public.checkins for delete to authenticated
  using (academy_id in (select public.academies_with_permission('alunos.editar')));

grant select, delete on public.checkins to authenticated;

drop trigger if exists checkins_audit on public.checkins;
create trigger checkins_audit after delete on public.checkins
  for each row execute function public.audit_trigger();

-- Segredo do QR por academia (sem policies: ninguém lê pela API)
create table if not exists public.checkin_secrets (
  academy_id uuid primary key references public.academies(id) on delete cascade,
  secret     text not null
);
alter table public.checkin_secrets enable row level security;

create or replace function public._checkin_code(p_academy uuid, p_janela bigint)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_secret text;
begin
  select secret into v_secret from public.checkin_secrets where academy_id = p_academy;
  if v_secret is null then
    v_secret := encode(gen_random_bytes(32), 'hex');
    insert into public.checkin_secrets (academy_id, secret) values (p_academy, v_secret)
    on conflict (academy_id) do nothing;
    select secret into v_secret from public.checkin_secrets where academy_id = p_academy;
  end if;
  return substr(encode(hmac(p_academy::text || ':' || p_janela::text, v_secret, 'sha256'), 'hex'), 1, 16);
end $$;
revoke execute on function public._checkin_code(uuid, bigint) from public, anon, authenticated;

/** Código atual do QR (muda a cada 30 s). Tela da recepção: quem edita alunos. */
create or replace function public.checkin_qr(p_academy uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_epoch  numeric := extract(epoch from now());
  v_janela bigint := floor(v_epoch / 30);
begin
  if not public.has_permission(p_academy, 'alunos.editar') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'codigo', public._checkin_code(p_academy, v_janela),
    'expira_em', ceil((v_janela + 1) * 30 - v_epoch)::int
  );
end $$;

/** Troca o segredo: QRs fotografados/antigos deixam de valer */
create or replace function public.reset_checkin_qr(p_academy uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_academy_admin(p_academy) and not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  insert into public.checkin_secrets (academy_id, secret) values (p_academy, encode(gen_random_bytes(32), 'hex'))
  on conflict (academy_id) do update set secret = excluded.secret;
end $$;

create or replace function public._register_checkin(p_academy uuid, p_student uuid, p_origem text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_last public.checkins;
  v_id   uuid;
begin
  -- mesmo aluno em menos de 3 horas: não duplica
  select * into v_last from public.checkins
   where student_id = p_student and created_at > now() - interval '3 hours'
   order by created_at desc limit 1;
  if v_last.id is not null then
    return jsonb_build_object('id', v_last.id, 'repetido', true, 'em', v_last.created_at,
                              'inadimplente', public.is_inadimplente(p_student));
  end if;
  insert into public.checkins (academy_id, student_id, origem, registrado_por)
  values (p_academy, p_student, p_origem, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'repetido', false, 'em', now(),
                            'inadimplente', public.is_inadimplente(p_student));
end $$;
revoke execute on function public._register_checkin(uuid, uuid, text) from public, anon, authenticated;

/** Check-in do próprio aluno lendo o QR da recepção */
create or replace function public.do_checkin(p_academy uuid, p_codigo text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_janela  bigint := floor(extract(epoch from now()) / 30);
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
  -- aceita o código atual e os dois anteriores (até ~90 s, tempo de abrir a câmera e logar)
  if coalesce(p_codigo, '') not in (
    public._checkin_code(p_academy, v_janela),
    public._checkin_code(p_academy, v_janela - 1),
    public._checkin_code(p_academy, v_janela - 2)
  ) then
    raise exception 'QR Code expirado. Leia o código que está na tela da recepção agora.';
  end if;
  return public._register_checkin(p_academy, v_student, 'qr');
end $$;

/** Check-in manual pela recepção */
create or replace function public.manual_checkin(p_student uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_s public.students;
begin
  select * into v_s from public.students where id = p_student and deleted_at is null;
  if v_s.id is null then
    raise exception 'Aluno não encontrado';
  end if;
  if not public.has_permission(v_s.academy_id, 'alunos.editar') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return public._register_checkin(v_s.academy_id, v_s.id, 'manual');
end $$;

/** Alunos ativos sem check-in há p_dias ou mais (inclui quem nunca veio, matriculado há p_dias) */
create or replace function public.absent_students(p_academy uuid, p_dias integer default null)
returns table (student_id uuid, nome text, telefone text, ultimo_checkin timestamptz, dias_ausente integer, data_matricula date)
language plpgsql stable security definer set search_path = public as $$
declare
  v_dias integer := coalesce(p_dias, (public._academy_cfg(p_academy) ->> 'dias_sumido')::int, 10);
begin
  if not public.has_permission(p_academy, 'alunos.ver') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
  select s.id, p.nome, p.telefone, c.ultimo,
         (public._today() - coalesce((c.ultimo at time zone 'America/Sao_Paulo')::date, s.data_matricula))::int,
         s.data_matricula
    from public.students s
    join public.profiles p on p.id = s.profile_id
    left join lateral (select max(ck.created_at) ultimo from public.checkins ck where ck.student_id = s.id) c on true
   where s.academy_id = p_academy and s.deleted_at is null and s.status = 'ativo'
     and coalesce((c.ultimo at time zone 'America/Sao_Paulo')::date, s.data_matricula) <= public._today() - v_dias
   order by 5 desc;
end $$;

-- ---------------------------------------------------------------------
-- WhatsApp: registro de envios (o envio é pelo app/web do WhatsApp em 1 clique)
-- ---------------------------------------------------------------------
create table if not exists public.whatsapp_logs (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id) on delete cascade,
  student_id  uuid references public.students(id),
  payment_id  uuid references public.payments(id),
  tipo        text not null check (tipo in ('lembrete', 'atraso', 'recibo', 'sumido', 'livre')),
  telefone    text,
  mensagem    text,
  enviado_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists whatsapp_logs_academy_idx on public.whatsapp_logs (academy_id, created_at desc);
create index if not exists whatsapp_logs_payment_idx on public.whatsapp_logs (payment_id);
create index if not exists whatsapp_logs_student_idx on public.whatsapp_logs (student_id, created_at desc);
alter table public.whatsapp_logs enable row level security;

drop policy if exists whatsapp_logs_select on public.whatsapp_logs;
create policy whatsapp_logs_select on public.whatsapp_logs for select to authenticated
  using (academy_id in (select public.academies_with_permission('financeiro.ver'))
      or academy_id in (select public.academies_with_permission('alunos.ver')));

drop policy if exists whatsapp_logs_insert on public.whatsapp_logs;
create policy whatsapp_logs_insert on public.whatsapp_logs for insert to authenticated
  with check (enviado_por = (select auth.uid())
    and (academy_id in (select public.academies_with_permission('financeiro.ver'))
      or academy_id in (select public.academies_with_permission('alunos.ver'))));

grant select, insert on public.whatsapp_logs to authenticated;

-- ---------------------------------------------------------------------
-- Dashboard: check-ins de hoje e alunos sumidos
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard(p_academy uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public._today();
  v_mes   date := date_trunc('month', public._today())::date;
  v_tol   integer := public._academy_tolerancia(p_academy);
  v_sum   integer := coalesce((public._academy_cfg(p_academy) ->> 'dias_sumido')::int, 10);
begin
  if not public.has_permission(p_academy, 'dashboard.ver') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'alunos_ativos', (select count(*) from public.students
                       where academy_id = p_academy and deleted_at is null and status = 'ativo'),
    'inadimplentes', (select count(distinct student_id) from public.payments
                       where academy_id = p_academy and deleted_at is null and status = 'pendente'
                         and vencimento < v_today - v_tol),
    'tolerancia', v_tol,
    'planos_vencendo', (select count(*) from public.students
                         where academy_id = p_academy and deleted_at is null and status = 'ativo'
                           and plano_valido_ate between v_today and v_today + 7),
    'checkins_hoje', (select count(*) from public.checkins
                       where academy_id = p_academy
                         and created_at >= (v_today::timestamp at time zone 'America/Sao_Paulo')),
    'dias_sumido', v_sum,
    'sumidos', (select count(*) from public.students s
                 where s.academy_id = p_academy and s.deleted_at is null and s.status = 'ativo'
                   and coalesce((select (max(c.created_at) at time zone 'America/Sao_Paulo')::date
                                   from public.checkins c where c.student_id = s.id), s.data_matricula)
                       <= v_today - v_sum),
    'aulas_hoje', (select count(*) from public.classes
                    where academy_id = p_academy and deleted_at is null and ativo
                      and extract(dow from v_today)::smallint = any (dias_semana)),
    'novos_mes', (select count(*) from public.students
                   where academy_id = p_academy and deleted_at is null and data_matricula >= v_mes),
    'receita_mes', (select coalesce(sum(valor), 0) from public.payments
                     where academy_id = p_academy and deleted_at is null and status = 'pago' and pago_em >= v_mes),
    'mensal', (
      select jsonb_agg(jsonb_build_object(
        'mes', to_char(m, 'YYYY-MM'),
        'receita', (select coalesce(sum(valor), 0) from public.payments
                     where academy_id = p_academy and deleted_at is null and status = 'pago'
                       and pago_em >= m and pago_em < m + interval '1 month'),
        'matriculas', (select count(*) from public.students
                        where academy_id = p_academy and deleted_at is null
                          and data_matricula >= m and data_matricula < m + interval '1 month')
      ) order by m)
      from generate_series(v_mes - interval '5 months', v_mes, interval '1 month') m
    ),
    'alunos_por_status', (
      select coalesce(jsonb_agg(jsonb_build_object('status', status, 'total', total)), '[]'::jsonb)
        from (select status, count(*) total from public.students
               where academy_id = p_academy and deleted_at is null group by status) s
    )
  );
end $$;

-- ---------------------------------------------------------------------
-- Vídeos dos exercícios: exercise-videos/{academy_id}/arquivo (público, até 50 MB)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('exercise-videos', 'exercise-videos', true)
on conflict (id) do nothing;

do $$
begin
  update storage.buckets
     set file_size_limit = 52428800,
         allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime']
   where id = 'exercise-videos';
exception when undefined_column then
  null; -- versão do storage sem essas colunas: o limite fica só no app
end $$;

drop policy if exists exercise_videos_public_read on storage.objects;
create policy exercise_videos_public_read on storage.objects for select
  using (bucket_id = 'exercise-videos');

drop policy if exists exercise_videos_insert on storage.objects;
create policy exercise_videos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and (public.has_permission(((storage.foldername(name))[1])::uuid, 'treinos.criar')
      or public.has_permission(((storage.foldername(name))[1])::uuid, 'treinos.editar')));

drop policy if exists exercise_videos_update on storage.objects;
create policy exercise_videos_update on storage.objects for update to authenticated
  using (bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'treinos.editar'));

drop policy if exists exercise_videos_delete on storage.objects;
create policy exercise_videos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'exercise-videos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'treinos.editar'));

notify pgrst, 'reload schema';
