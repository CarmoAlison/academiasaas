import { useQuery } from '@tanstack/react-query'
import { Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Avatar, Button, DataTable, PageHeader, Select, StatusBadge } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import { planService, unitService } from '../../../services/catalogServices'
import { listStudents } from '../../../services/studentService'
import { STUDENT_STATUS } from '../../../utils/constants'
import { exportCSV } from '../../../utils/csv'
import { formatCPF, formatDate, formatPhone } from '../../../utils/formatters'

export default function AlunosList() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const [planId, setPlanId] = useState('')
  const [unitId, setUnitId] = useState('')

  const query = useQuery({ queryKey: ['students', academyId], queryFn: () => listStudents(academyId) })
  const plans = useQuery({ queryKey: ['plans', academyId], queryFn: () => planService.list(academyId) })
  const units = useQuery({ queryKey: ['units', academyId], queryFn: () => unitService.list(academyId) })

  const rows = (query.data ?? []).filter(
    (s) => (!status || s.status === status) && (!planId || s.plan_id === planId) && (!unitId || s.unit_id === unitId),
  )

  const onExport = () =>
    exportCSV('alunos', [
      { header: 'Nome', value: (s) => s.profile?.nome },
      { header: 'CPF', value: (s) => formatCPF(s.profile?.cpf) },
      { header: 'Telefone', value: (s) => formatPhone(s.profile?.telefone) },
      { header: 'E-mail', value: (s) => s.profile?.email_contato },
      { header: 'Plano', value: (s) => s.plan?.nome },
      { header: 'Unidade', value: (s) => s.unit?.nome },
      { header: 'Matrícula', value: (s) => formatDate(s.data_matricula) },
      { header: 'Status', value: (s) => s.status },
    ], rows)

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      <PageHeader
        title="Alunos"
        subtitle={`${query.data?.length ?? 0} aluno(s) cadastrado(s)`}
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={onExport} disabled={!rows.length}>
              Exportar
            </Button>
            {can('alunos.criar') && (
              <Button icon={Plus} to="/admin/alunos/novo">
                Novo aluno
              </Button>
            )}
          </>
        }
      />
      <DataTable
        loading={query.isPending}
        data={rows}
        searchPlaceholder="Buscar por nome, CPF ou telefone"
        searchKeys={['profile.nome', 'profile.cpf', 'profile.telefone', (s) => formatCPF(s.profile?.cpf)]}
        onRowClick={(s) => navigate(`/admin/alunos/${s.id}`)}
        filters={
          <>
            <Select aria-label="Status" placeholder="Todos os status" value={status} onChange={(e) => setStatus(e.target.value)} options={STUDENT_STATUS} />
            <Select
              aria-label="Plano"
              placeholder="Todos os planos"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              options={(plans.data ?? []).map((p) => ({ value: p.id, label: p.nome }))}
            />
            {(units.data?.length ?? 0) > 1 && (
              <Select
                aria-label="Unidade"
                placeholder="Todas as unidades"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                options={units.data.map((u) => ({ value: u.id, label: u.nome }))}
              />
            )}
          </>
        }
        emptyTitle="Nenhum aluno cadastrado"
        emptyAction={can('alunos.criar') && <Button icon={Plus} to="/admin/alunos/novo">Cadastrar aluno</Button>}
        columns={[
          {
            key: 'profile.nome',
            header: 'Aluno',
            render: (s) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={s.profile?.nome} src={s.profile?.avatar_url} size={32} />
                <strong>{s.profile?.nome}</strong>
              </span>
            ),
          },
          { key: 'profile.cpf', header: 'CPF', render: (s) => formatCPF(s.profile?.cpf) },
          { key: 'profile.telefone', header: 'Telefone', render: (s) => (s.profile?.telefone ? formatPhone(s.profile.telefone) : '—') },
          { key: 'plan.nome', header: 'Plano', render: (s) => s.plan?.nome ?? '—' },
          { key: 'data_matricula', header: 'Matrícula', render: (s) => formatDate(s.data_matricula) },
          { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
        ]}
      />
    </>
  )
}
