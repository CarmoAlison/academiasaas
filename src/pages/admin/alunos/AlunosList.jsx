import { useQuery } from '@tanstack/react-query'
import { Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Avatar, Button, DataTable, PageHeader, Select, StatusBadge, useToast } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import { useServerTable } from '../../../hooks/useServerTable'
import { planService, unitService } from '../../../services/catalogServices'
import { exportStudents, listStudentsPage } from '../../../services/studentService'
import { STUDENT_STATUS } from '../../../utils/constants'
import { exportCSV } from '../../../utils/csv'
import { errorMessage } from '../../../utils/errors'
import { formatCPF, formatDate, formatPhone } from '../../../utils/formatters'

export default function AlunosList() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const toast = useToast()
  const [exporting, setExporting] = useState(false)

  // paginação, busca, ordenação e filtros no servidor
  const { query, tableProps, filters, setFilter, search } = useServerTable({
    queryKey: ['students', academyId],
    fetchPage: (params) => listStudentsPage(academyId, params),
    pageSize: 20,
    initialFilters: { status: '', plan_id: '', unit_id: '' },
  })
  const plans = useQuery({ queryKey: ['plans', academyId], queryFn: () => planService.list(academyId) })
  const units = useQuery({ queryKey: ['units', academyId], queryFn: () => unitService.list(academyId) })

  const onExport = async () => {
    setExporting(true)
    try {
      const rows = await exportStudents(academyId, { search, filters })
      exportCSV('alunos', [
        { header: 'Nome', value: (s) => s.nome },
        { header: 'CPF', value: (s) => formatCPF(s.cpf) },
        { header: 'Telefone', value: (s) => formatPhone(s.telefone) },
        { header: 'E-mail', value: (s) => s.email_contato },
        { header: 'Plano', value: (s) => s.plano_nome },
        { header: 'Unidade', value: (s) => s.unidade_nome },
        { header: 'Matrícula', value: (s) => formatDate(s.data_matricula) },
        { header: 'Status', value: (s) => s.status },
      ], rows)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      <PageHeader
        title="Alunos"
        subtitle={query.isPending ? 'Carregando…' : `${tableProps.total} aluno(s)${search || Object.values(filters).some(Boolean) ? ' no filtro' : ''}`}
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={onExport} loading={exporting} disabled={!tableProps.total}>
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
        {...tableProps}
        searchPlaceholder="Buscar por nome, CPF ou telefone"
        onRowClick={(s) => navigate(`/admin/alunos/${s.id}`)}
        filters={
          <>
            <Select
              aria-label="Status"
              placeholder="Todos os status"
              value={filters.status}
              onChange={(e) => setFilter('status', e.target.value)}
              options={STUDENT_STATUS}
            />
            <Select
              aria-label="Plano"
              placeholder="Todos os planos"
              value={filters.plan_id}
              onChange={(e) => setFilter('plan_id', e.target.value)}
              options={(plans.data ?? []).map((p) => ({ value: p.id, label: p.nome }))}
            />
            {(units.data?.length ?? 0) > 1 && (
              <Select
                aria-label="Unidade"
                placeholder="Todas as unidades"
                value={filters.unit_id}
                onChange={(e) => setFilter('unit_id', e.target.value)}
                options={units.data.map((u) => ({ value: u.id, label: u.nome }))}
              />
            )}
          </>
        }
        emptyTitle="Nenhum aluno cadastrado"
        emptyAction={can('alunos.criar') && <Button icon={Plus} to="/admin/alunos/novo">Cadastrar aluno</Button>}
        columns={[
          {
            key: 'nome',
            header: 'Aluno',
            render: (s) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={s.nome} src={s.avatar_url} size={32} />
                <strong>{s.nome}</strong>
              </span>
            ),
          },
          { key: 'cpf', header: 'CPF', render: (s) => formatCPF(s.cpf) },
          { key: 'telefone', header: 'Telefone', render: (s) => (s.telefone ? formatPhone(s.telefone) : '—') },
          { key: 'plano_nome', header: 'Plano', render: (s) => s.plano_nome ?? '—' },
          { key: 'data_matricula', header: 'Matrícula', render: (s) => formatDate(s.data_matricula) },
          { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
        ]}
      />
    </>
  )
}
