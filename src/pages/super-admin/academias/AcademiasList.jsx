import { useQuery } from '@tanstack/react-query'
import { Ban, CheckCircle2, Download, Eye, LogIn, Plus, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, DataTable, PageHeader, Select, StatusBadge, Tooltip, useConfirm } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { useSuperRole } from '../../../hooks/useSuperRole'
import { logAccess } from '../../../services/logService'
import { academiesOverview, listAcademies, listSaasOffers, listSaasPlans, setAcademyStatus } from '../../../services/saasService'
import { ACADEMY_STATUS, UFS } from '../../../utils/constants'
import { exportCSV } from '../../../utils/csv'
import { formatCNPJ, formatCurrency, formatDate, formatDateTime } from '../../../utils/formatters'
import ModulesModal from './ModulesModal'

const SITUACOES = [
  { value: 'atraso', label: 'Com fatura em atraso' },
  { value: 'em_dia', label: 'Em dia' },
  { value: 'limite', label: 'Perto do limite de alunos (80%+)' },
  { value: 'sem_acesso', label: 'Admin sem acessar há 15+ dias' },
]

const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null)

/** Filtros na URL: dá para chegar aqui já filtrado (ex.: cards do dashboard) */
function useUrlFilter(key) {
  const [params, setParams] = useSearchParams()
  const value = params.get(key) ?? ''
  const set = (v) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v) next.set(key, v)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  return [value, set]
}

export default function AcademiasList() {
  const { superCan } = useSuperRole()
  const navigate = useNavigate()
  const { setAcademy } = useTenant()
  const [confirm, confirmDialog] = useConfirm()
  const [status, setStatus] = useUrlFilter('status')
  const [plano, setPlano] = useUrlFilter('plano')
  const [uf, setUf] = useUrlFilter('uf')
  const [oferta, setOferta] = useUrlFilter('oferta')
  const [situacao, setSituacao] = useUrlFilter('situacao')
  const [modulesFor, setModulesFor] = useState(null)

  const query = useQuery({ queryKey: ['academies'], queryFn: listAcademies })
  const overview = useQuery({ queryKey: ['academies', 'overview'], queryFn: academiesOverview })
  const plans = useQuery({ queryKey: ['saas-plans'], queryFn: listSaasPlans })
  const offers = useQuery({ queryKey: ['saas-offers'], queryFn: listSaasOffers })

  const statusMutation = useMutationToast(({ id, status: s }) => setAcademyStatus(id, s), {
    success: 'Status atualizado',
    invalidate: [['academies'], ['super-dashboard']],
  })

  const toggleStatus = async (academy) => {
    const next = academy.status === 'ativa' ? 'inativa' : 'ativa'
    const ok = await confirm({
      title: next === 'inativa' ? 'Inativar academia' : 'Reativar academia',
      message:
        next === 'inativa'
          ? `Os usuários de ${academy.nome} perderão o acesso ao sistema até a reativação.`
          : `Os usuários de ${academy.nome} voltarão a ter acesso.`,
      danger: next === 'inativa',
      confirmLabel: next === 'inativa' ? 'Inativar' : 'Reativar',
    })
    if (ok) statusMutation.mutate({ id: academy.id, status: next })
  }

  /** "Acessar como": entra na área da academia com privilégios de super admin (fica no histórico) */
  const accessAs = (academy) => {
    setAcademy(academy.id)
    logAccess(academy.id, 'acesso_super')
    navigate('/admin')
  }

  const ov = overview.data ?? {}
  const all = (query.data ?? []).map((a) => {
    const o = ov[a.id] ?? {}
    return {
      ...a,
      ov: o,
      usoPct: o.limite_alunos ? Math.round(((o.alunos_ativos ?? 0) / o.limite_alunos) * 100) : null,
      diasSemAcesso: daysSince(o.ultimo_acesso),
    }
  })
  const rows = all.filter(
    (a) =>
      (!status || a.status === status) &&
      (!plano || a.saas_plan_id === plano) &&
      (!uf || a.uf === uf) &&
      (!oferta || a.offer_id === oferta) &&
      (!situacao ||
        (situacao === 'atraso' && a.ov.faturas_atrasadas > 0) ||
        (situacao === 'em_dia' && !a.ov.faturas_atrasadas) ||
        (situacao === 'limite' && a.usoPct !== null && a.usoPct >= 80) ||
        (situacao === 'sem_acesso' && (a.diasSemAcesso === null || a.diasSemAcesso >= 15))),
  )
  const anyFilter = status || plano || uf || oferta || situacao

  const onExport = () =>
    exportCSV(
      'academias',
      [
        { header: 'Academia', value: (a) => a.nome },
        { header: 'CNPJ', value: (a) => (a.cnpj ? formatCNPJ(a.cnpj) : '') },
        { header: 'Cidade', value: (a) => a.cidade ?? '' },
        { header: 'UF', value: (a) => a.uf ?? '' },
        { header: 'Plano', value: (a) => a.saas_plan?.nome ?? '' },
        { header: 'Ciclo', value: (a) => a.ciclo },
        { header: 'MRR', value: (a) => Number(a.ov.mrr ?? 0).toFixed(2).replace('.', ',') },
        { header: 'Alunos ativos', value: (a) => a.ov.alunos_ativos ?? '' },
        { header: 'Limite de alunos', value: (a) => a.ov.limite_alunos ?? 'ilimitado' },
        { header: 'Último acesso do admin', value: (a) => (a.ov.ultimo_acesso ? formatDateTime(a.ov.ultimo_acesso) : '') },
        { header: 'Faturas em atraso', value: (a) => a.ov.faturas_atrasadas ?? 0 },
        { header: 'Valor em atraso', value: (a) => Number(a.ov.valor_atrasado ?? 0).toFixed(2).replace('.', ',') },
        { header: 'Módulos', value: (a) => (a.ov.modulos_total ? `${a.ov.modulos}/${a.ov.modulos_total}` : '') },
        { header: 'Status', value: (a) => a.status },
        { header: 'Cadastro', value: (a) => formatDate(a.created_at) },
      ],
      rows,
    )

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      <PageHeader
        title="Academias"
        subtitle="Todas as academias clientes do SaaS"
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={onExport} disabled={!rows.length}>
              Exportar CSV
            </Button>
            {superCan('academias') && (
              <Button icon={Plus} to="/super-admin/academias/nova">
                Nova academia
              </Button>
            )}
          </>
        }
      />
      {confirmDialog}
      <DataTable
        loading={query.isPending}
        data={rows}
        searchPlaceholder="Buscar por nome, CNPJ ou cidade"
        searchKeys={['nome', 'cnpj', 'cidade']}
        onRowClick={(a) => navigate(`/super-admin/academias/${a.id}`)}
        filters={
          <>
            <Select aria-label="Situação" placeholder="Toda situação" value={situacao} onChange={(e) => setSituacao(e.target.value)} options={SITUACOES} />
            <Select aria-label="Status" placeholder="Todos os status" value={status} onChange={(e) => setStatus(e.target.value)} options={ACADEMY_STATUS} />
            <Select
              aria-label="Plano"
              placeholder="Todos os planos"
              value={plano}
              onChange={(e) => setPlano(e.target.value)}
              options={(plans.data ?? []).map((p) => ({ value: p.id, label: p.nome }))}
            />
            <Select aria-label="UF" placeholder="UF" value={uf} onChange={(e) => setUf(e.target.value)} options={UFS.map((u) => ({ value: u, label: u }))} />
            <Select
              aria-label="Oferta"
              placeholder="Qualquer oferta"
              value={oferta}
              onChange={(e) => setOferta(e.target.value)}
              options={(offers.data ?? []).map((o) => ({ value: o.id, label: o.nome }))}
            />
            {anyFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatus('')
                  setPlano('')
                  setUf('')
                  setOferta('')
                  setSituacao('')
                }}
              >
                Limpar filtros
              </Button>
            )}
          </>
        }
        emptyTitle="Nenhuma academia encontrada"
        emptyAction={superCan('academias') && !anyFilter && <Button icon={Plus} to="/super-admin/academias/nova">Cadastrar academia</Button>}
        columns={[
          {
            key: 'nome',
            header: 'Academia',
            render: (a) => (
              <>
                <strong>{a.nome}</strong>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {[a.cidade, a.uf].filter(Boolean).join('/') || (a.cnpj ? formatCNPJ(a.cnpj) : '—')}
                </div>
              </>
            ),
          },
          {
            key: 'saas_plan.nome',
            header: 'Plano',
            render: (a) => (
              <>
                {a.saas_plan?.nome ?? '—'}
                {a.ciclo === 'anual' ? ' · anual' : ''}
                {a.ov.mrr ? <div className="text-muted" style={{ fontSize: 12 }}>{formatCurrency(a.ov.mrr)}/mês</div> : null}
              </>
            ),
          },
          {
            key: 'usoPct',
            header: 'Alunos',
            sortValue: (a) => a.usoPct ?? -1,
            render: (a) =>
              a.ov.alunos_ativos === undefined ? (
                '—'
              ) : (
                <span>
                  {a.ov.alunos_ativos}
                  {a.ov.limite_alunos ? `/${a.ov.limite_alunos}` : ''}{' '}
                  {a.usoPct !== null && a.usoPct >= 80 && <Badge tone={a.usoPct >= 100 ? 'danger' : 'warning'}>{a.usoPct}%</Badge>}
                </span>
              ),
          },
          {
            key: 'diasSemAcesso',
            header: 'Último acesso',
            sortValue: (a) => a.diasSemAcesso ?? 99999,
            render: (a) =>
              a.ov.ultimo_acesso ? (
                <span title={formatDateTime(a.ov.ultimo_acesso)} style={{ color: a.diasSemAcesso >= 15 ? 'var(--color-danger-text)' : undefined }}>
                  {a.diasSemAcesso === 0 ? 'hoje' : `há ${a.diasSemAcesso} dia(s)`}
                </span>
              ) : (
                <span className="text-muted">nunca</span>
              ),
          },
          {
            key: 'fatura',
            header: 'Fatura',
            sortValue: (a) => Number(a.ov.valor_atrasado ?? 0),
            render: (a) =>
              a.ov.faturas_atrasadas > 0 ? (
                <Badge tone="danger" title={`${a.ov.faturas_atrasadas} fatura(s) vencida(s)`}>
                  Atrasada · {formatCurrency(a.ov.valor_atrasado)}
                </Badge>
              ) : (
                <Badge tone="success">Em dia</Badge>
              ),
          },
          {
            key: 'modulos',
            header: 'Módulos',
            sortValue: (a) => a.ov.modulos ?? 0,
            render: (a) => (a.ov.modulos_total ? `${a.ov.modulos}/${a.ov.modulos_total}` : '—'),
          },
          { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (a) => (
              <div style={{ display: 'inline-flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                <Tooltip content="Ver / editar">
                  <Button variant="ghost" size="sm" icon={Eye} to={`/super-admin/academias/${a.id}`} aria-label="Ver" />
                </Tooltip>
                {superCan('academias') && (
                  <Tooltip content="Módulos liberados">
                    <Button variant="ghost" size="sm" icon={Settings2} onClick={() => setModulesFor(a)} aria-label="Módulos" />
                  </Tooltip>
                )}
                {superCan('acessar') && (
                  <Tooltip content="Acessar como admin">
                    <Button variant="ghost" size="sm" icon={LogIn} onClick={() => accessAs(a)} aria-label="Acessar como" disabled={a.status !== 'ativa'} />
                  </Tooltip>
                )}
                {superCan('academias') && (
                  <Tooltip content={a.status === 'ativa' ? 'Inativar' : 'Reativar'}>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={a.status === 'ativa' ? Ban : CheckCircle2}
                      onClick={() => toggleStatus(a)}
                      aria-label={a.status === 'ativa' ? 'Inativar' : 'Reativar'}
                    />
                  </Tooltip>
                )}
              </div>
            ),
          },
        ]}
      />
      <ModulesModal academy={modulesFor} onClose={() => setModulesFor(null)} />
    </>
  )
}
