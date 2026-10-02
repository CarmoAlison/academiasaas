import { useQuery } from '@tanstack/react-query'
import { Ban, CheckCircle2, Eye, LogIn, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Button, DataTable, PageHeader, Select, StatusBadge, Tooltip, useConfirm } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { listAcademies, listSaasPlans, setAcademyStatus } from '../../../services/saasService'
import { ACADEMY_STATUS } from '../../../utils/constants'
import { formatCNPJ, formatDate } from '../../../utils/formatters'
import { useSuperRole } from '../../../hooks/useSuperRole'

export default function AcademiasList() {
  const { superCan } = useSuperRole()
  const navigate = useNavigate()
  const { setAcademy } = useTenant()
  const [confirm, confirmDialog] = useConfirm()
  const [status, setStatus] = useState('')
  const [plano, setPlano] = useState('')

  const query = useQuery({ queryKey: ['academies'], queryFn: listAcademies })
  const plans = useQuery({ queryKey: ['saas-plans'], queryFn: listSaasPlans })

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

  /** "Acessar como": entra na área da academia com privilégios de super admin */
  const accessAs = (academy) => {
    setAcademy(academy.id)
    navigate('/admin')
  }

  const rows = (query.data ?? []).filter((a) => (!status || a.status === status) && (!plano || a.saas_plan_id === plano))

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      <PageHeader
        title="Academias"
        subtitle="Todas as academias clientes do SaaS"
        actions={
          superCan('academias') && (
            <Button icon={Plus} to="/super-admin/academias/nova">
              Nova academia
            </Button>
          )
        }
      />
      {confirmDialog}
      <DataTable
        loading={query.isPending}
        data={rows}
        searchPlaceholder="Buscar por nome ou CNPJ"
        searchKeys={['nome', 'cnpj']}
        onRowClick={(a) => navigate(`/super-admin/academias/${a.id}`)}
        filters={
          <>
            <Select aria-label="Status" placeholder="Todos os status" value={status} onChange={(e) => setStatus(e.target.value)} options={ACADEMY_STATUS} />
            <Select
              aria-label="Plano"
              placeholder="Todos os planos"
              value={plano}
              onChange={(e) => setPlano(e.target.value)}
              options={(plans.data ?? []).map((p) => ({ value: p.id, label: p.nome }))}
            />
          </>
        }
        emptyTitle="Nenhuma academia cadastrada"
        emptyAction={<Button icon={Plus} to="/super-admin/academias/nova">Cadastrar academia</Button>}
        columns={[
          { key: 'nome', header: 'Academia', render: (a) => <strong>{a.nome}</strong> },
          { key: 'cnpj', header: 'CNPJ', render: (a) => (a.cnpj ? formatCNPJ(a.cnpj) : '—') },
          { key: 'saas_plan.nome', header: 'Plano', render: (a) => a.saas_plan?.nome ?? '—' },
          { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
          { key: 'created_at', header: 'Cadastro', render: (a) => formatDate(a.created_at) },
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
    </>
  )
}
