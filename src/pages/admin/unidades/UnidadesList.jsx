import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, DataTable, PageHeader } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import { unitService } from '../../../services/catalogServices'
import { academyUsage } from '../../../services/studentService'
import { formatPhone } from '../../../utils/formatters'

export default function UnidadesList() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['units', academyId], queryFn: () => unitService.list(academyId) })
  // limite de unidades do plano do sistema (o banco também bloqueia)
  const usage = useQuery({ queryKey: ['units', academyId, 'usage'], queryFn: () => academyUsage(academyId) })
  const u = usage.data
  const limite = u?.limite_unidades ?? null
  const noLimite = limite !== null && u.unidades >= limite

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      <PageHeader
        title="Unidades"
        subtitle={
          limite !== null
            ? `${u.unidades} de ${limite} unidade(s) do plano ${u.plano ?? ''}${noLimite ? ' — limite atingido' : ''}`
            : 'Filiais e endereços da academia'
        }
        actions={
          can('unidades.criar') && (
            <Button
              icon={Plus}
              to={noLimite ? undefined : '/admin/unidades/nova'}
              disabled={noLimite}
              title={noLimite ? 'Seu plano atingiu o limite de unidades. Fale com o suporte para mudar de plano.' : undefined}
            >
              Nova unidade
            </Button>
          )
        }
      />
      {noLimite && can('unidades.criar') && (
        <p className="text-muted" style={{ margin: '-8px 0 16px' }}>
          Seu plano permite até {limite} unidade(s). Para cadastrar mais, fale com o suporte para mudar de plano.
        </p>
      )}
      <DataTable
        loading={query.isPending}
        data={query.data ?? []}
        searchKeys={['nome', 'cidade', 'endereco']}
        onRowClick={(row) => navigate(`/admin/unidades/${row.id}`)}
        emptyTitle="Nenhuma unidade cadastrada"
        columns={[
          { key: 'nome', header: 'Unidade', render: (row) => <strong>{row.nome}</strong> },
          { key: 'endereco', header: 'Endereço', render: (row) => row.endereco ?? '—' },
          { key: 'cidade', header: 'Cidade/UF', render: (row) => (row.cidade ? `${row.cidade}${row.estado ? `/${row.estado}` : ''}` : '—') },
          { key: 'telefone', header: 'Telefone', render: (row) => (row.telefone ? formatPhone(row.telefone) : '—') },
          { key: 'ativo', header: 'Status', render: (row) => <Badge tone={row.ativo ? 'success' : 'neutral'}>{row.ativo ? 'Ativa' : 'Inativa'}</Badge> },
        ]}
      />
    </>
  )
}
