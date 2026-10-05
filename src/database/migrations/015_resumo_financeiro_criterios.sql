-- =====================================================================
-- Migração 015 — Resumo do financeiro com os dois critérios
--   O Dashboard conta a receita pela DATA DO PAGAMENTO e os inadimplentes com a
--   TOLERÂNCIA da academia; o Financeiro conta pelo VENCIMENTO e qualquer parcela
--   vencida. payments_summary passa a devolver os dois, para as telas explicarem
--   a diferença:
--     recebido_caixa       = pago no período (data do pagamento)
--     alunos_inadimplentes = vencidos há mais que a tolerância
--     tolerancia           = dias de tolerância configurados
-- Requer a 008. Pode ser executada mais de uma vez.
-- =====================================================================

create or replace function public.payments_summary(p_academy uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public._today();
  v_tol   integer := public._academy_tolerancia(p_academy);
begin
  if not public.has_permission(p_academy, 'financeiro.ver') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'previsto',   coalesce(sum(valor) filter (where status <> 'cancelado' and vencimento between p_de and p_ate), 0),
      'recebido',   coalesce(sum(valor) filter (where status = 'pago' and vencimento between p_de and p_ate), 0),
      'recebido_caixa', coalesce(sum(valor) filter (where status = 'pago'
                          and (pago_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate), 0),
      'a_receber',  coalesce(sum(valor) filter (where status = 'pendente' and vencimento >= v_today and vencimento between p_de and p_ate), 0),
      'atrasado_mes', coalesce(sum(valor) filter (where status = 'pendente' and vencimento < v_today and vencimento between p_de and p_ate), 0),
      'inadimplencia', coalesce(sum(valor) filter (where status = 'pendente' and vencimento < v_today), 0),
      'alunos_em_atraso', count(distinct student_id) filter (where status = 'pendente' and vencimento < v_today),
      'alunos_inadimplentes', count(distinct student_id) filter (where status = 'pendente' and vencimento < v_today - v_tol),
      'tolerancia', v_tol
    )
    from public.payments
    where academy_id = p_academy and deleted_at is null
  );
end $$;

notify pgrst, 'reload schema';
