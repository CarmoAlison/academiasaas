import { useQuery } from '@tanstack/react-query'
import { CircleDollarSign, LogIn, Package, PackagePlus, Settings2, ShieldAlert, SlidersHorizontal, Tag } from 'lucide-react'
import QueryError from '../../../components/feedback/QueryError'
import Timeline from '../../../components/timeline/Timeline'
import { EmptyState, SkeletonCard } from '../../../components/ui'
import { listModules } from '../../../services/moduleService'
import { academyTimeline, listSaasAddons, listSaasOffers, listSaasPlans } from '../../../services/saasService'
import { formatCurrency, formatDate } from '../../../utils/formatters'

const STATUS = { ativa: 'ativa', inativa: 'inativa', suspensa: 'suspensa' }

/** Transforma um registro de auditoria em frases legíveis */
function describe(row, names) {
  const antes = row.dados_antes ?? {}
  const depois = row.dados_depois ?? {}
  const out = []

  if (row.tabela === 'academies') {
    if (row.acao === 'insert') out.push({ icon: Package, text: `Academia cadastrada no plano ${names.plan(depois.saas_plan_id)}` })
    if (antes.saas_plan_id !== depois.saas_plan_id && row.acao !== 'insert')
      out.push({ icon: Package, text: `Plano: ${names.plan(antes.saas_plan_id)} → ${names.plan(depois.saas_plan_id)}` })
    if (antes.ciclo && antes.ciclo !== depois.ciclo) out.push({ icon: SlidersHorizontal, text: `Ciclo: ${antes.ciclo} → ${depois.ciclo}` })
    if (antes.status && antes.status !== depois.status)
      out.push({ icon: ShieldAlert, text: `Status: ${STATUS[antes.status] ?? antes.status} → ${STATUS[depois.status] ?? depois.status}`, tone: depois.status === 'ativa' ? 'ok' : 'bad' })
    if (row.acao === 'soft_delete') out.push({ icon: ShieldAlert, text: 'Academia excluída', tone: 'bad' })
    if ((antes.offer_id ?? null) !== (depois.offer_id ?? null) && row.acao !== 'insert')
      out.push({
        icon: Tag,
        text: depois.offer_id
          ? `Oferta aplicada: ${names.offer(depois.offer_id)}${depois.oferta_ate ? ` (até ${formatDate(depois.oferta_ate)})` : ''}`
          : `Oferta removida: ${names.offer(antes.offer_id)}`,
      })
    const ma = antes.modulos_override ?? {}
    const md = depois.modulos_override ?? {}
    if (row.acao !== 'insert' && JSON.stringify(ma) !== JSON.stringify(md)) {
      const keys = [...new Set([...Object.keys(ma), ...Object.keys(md)])]
      const parts = keys
        .filter((k) => ma[k] !== md[k])
        .map((k) => (k in md ? `${md[k] ? 'liberou' : 'bloqueou'} ${names.module(k)}` : `${names.module(k)} voltou ao padrão do plano`))
      if (parts.length) out.push({ icon: Settings2, text: `Módulos: ${parts.join(', ')}` })
    }
    if (antes.nome && antes.nome !== depois.nome) out.push({ icon: SlidersHorizontal, text: `Nome: ${antes.nome} → ${depois.nome}` })
  }

  if (row.tabela === 'academy_addons') {
    const d = row.acao === 'delete' ? antes : depois
    out.push({
      icon: PackagePlus,
      text: row.acao === 'delete' ? `Adicional removido: ${names.addon(d.addon_id)}` : `Adicional contratado: ${names.addon(d.addon_id)} (${formatCurrency(d.valor)}/mês)`,
    })
  }

  if (row.tabela === 'saas_invoices') {
    const comp = depois.competencia ? formatDate(depois.competencia).slice(3) : ''
    if (row.acao === 'insert') out.push({ icon: CircleDollarSign, text: `Fatura gerada (${comp}): ${formatCurrency(depois.valor)}` })
    else if (antes.status !== depois.status) {
      const label = { pago: 'paga', cancelado: 'cancelada', pendente: 'reaberta' }[depois.status] ?? depois.status
      out.push({ icon: CircleDollarSign, text: `Fatura ${comp} ${label}: ${formatCurrency(depois.valor)}`, tone: depois.status === 'pago' ? 'ok' : undefined })
    } else if (Number(antes.valor) !== Number(depois.valor)) {
      out.push({ icon: CircleDollarSign, text: `Fatura ${comp} recalculada: ${formatCurrency(antes.valor)} → ${formatCurrency(depois.valor)}` })
    }
  }

  if (row.tabela === 'academy_settings') {
    const changed = ['logo_url', 'logo_url_dark', 'cor_primaria'].some((k) => (antes[k] ?? null) !== (depois[k] ?? null))
    if (changed) out.push({ icon: SlidersHorizontal, text: 'Identidade visual alterada pela academia' })
  }
  return out
}

/** Linha do tempo legível da academia */
export default function AcademyTimeline({ academyId }) {
  const query = useQuery({ queryKey: ['academy', academyId, 'timeline'], queryFn: () => academyTimeline(academyId) })
  const plans = useQuery({ queryKey: ['saas-plans'], queryFn: listSaasPlans })
  const offers = useQuery({ queryKey: ['saas-offers'], queryFn: listSaasOffers })
  const modules = useQuery({ queryKey: ['saas-modules'], queryFn: listModules })
  const addons = useQuery({ queryKey: ['saas-addons'], queryFn: listSaasAddons })

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />
  if (query.isPending) return <SkeletonCard lines={6} />

  const byId = (list, key = 'id') => (id) => list?.find((x) => x[key] === id)?.nome ?? (id ? '—' : 'nenhum')
  const names = {
    plan: byId(plans.data),
    offer: byId(offers.data),
    module: (slug) => modules.data?.find((m) => m.slug === slug)?.nome ?? slug,
    addon: (id) => addons.data?.find((x) => x.id === id)?.nome ?? 'adicional',
  }

  const events = [
    ...query.data.audit.flatMap((r) => describe(r, names).map((e, i) => ({ ...e, key: `${r.id}-${i}`, at: r.created_at, by: r.user_nome }))),
    ...query.data.access.map((r) => ({ key: `a${r.id}`, icon: LogIn, text: 'Super Admin acessou a academia ("acessar como")', at: r.created_at, by: r.user_nome })),
  ].sort((x, y) => y.at.localeCompare(x.at))

  if (!events.length) return <EmptyState compact title="Sem histórico ainda" description="Mudanças de plano, módulos, ofertas e faturas aparecem aqui." />

  return <Timeline events={events} />
}
