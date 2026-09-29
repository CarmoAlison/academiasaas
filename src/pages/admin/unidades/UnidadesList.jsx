import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, DataTable, PageHeader } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import { unitService } from '../../../services/catalogServices'
import { formatPhone } from '../../../utils/formatters'

export default function UnidadesList() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['units', academyId], queryFn: () => unitService.list(academyId) })

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      <PageHeader
        title="Unidades"
        subtitle="Filiais e endereços da academia"
        actions={
          can('unidades.criar') && (
            <Button icon={Plus} to="/admin/unidades/nova">
              Nova unidade
            </Button>
          )
        }
      />
      <DataTable
        loading={query.isPending}
        data={query.data ?? []}
        searchKeys={['nome', 'cidade', 'endereco']}
        onRowClick={(u) => navigate(`/admin/unidades/${u.id}`)}
        emptyTitle="Nenhuma unidade cadastrada"
        columns={[
          { key: 'nome', header: 'Unidade', render: (u) => <strong>{u.nome}</strong> },
          { key: 'endereco', header: 'Endereço', render: (u) => u.endereco ?? '—' },
          { key: 'cidade', header: 'Cidade/UF', render: (u) => (u.cidade ? `${u.cidade}${u.estado ? `/${u.estado}` : ''}` : '—') },
          { key: 'telefone', header: 'Telefone', render: (u) => (u.telefone ? formatPhone(u.telefone) : '—') },
          { key: 'ativo', header: 'Status', render: (u) => <Badge tone={u.ativo ? 'success' : 'neutral'}>{u.ativo ? 'Ativa' : 'Inativa'}</Badge> },
        ]}
      />
    </>
  )
}
