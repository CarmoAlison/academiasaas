import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, DataTable, PageHeader } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import { planService } from '../../../services/catalogServices'
import { formatCurrency } from '../../../utils/formatters'

export default function PlanosList() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const query = useQuery({ queryKey: ['plans', academyId], queryFn: () => planService.list(academyId) })

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      <PageHeader
        title="Planos"
        subtitle="Planos e mensalidades oferecidos aos alunos"
        actions={
          can('planos.criar') && (
            <Button icon={Plus} to="/admin/planos/novo">
              Novo plano
            </Button>
          )
        }
      />
      <DataTable
        loading={query.isPending}
        data={query.data ?? []}
        searchKeys={['nome', 'descricao']}
        onRowClick={(p) => navigate(`/admin/planos/${p.id}`)}
        emptyTitle="Nenhum plano cadastrado"
        emptyAction={can('planos.criar') && <Button icon={Plus} to="/admin/planos/novo">Criar plano</Button>}
        columns={[
          { key: 'nome', header: 'Plano', render: (p) => <strong>{p.nome}</strong> },
          { key: 'descricao', header: 'Descrição', render: (p) => p.descricao ?? '—' },
          { key: 'duracao_meses', header: 'Duração', render: (p) => `${p.duracao_meses} ${p.duracao_meses > 1 ? 'meses' : 'mês'}` },
          { key: 'valor', header: 'Valor', align: 'right', sortValue: (p) => Number(p.valor), render: (p) => formatCurrency(p.valor) },
          {
            key: 'mensal',
            header: 'Equivalente/mês',
            align: 'right',
            sortValue: (p) => p.valor / p.duracao_meses,
            render: (p) => formatCurrency(p.valor / p.duracao_meses),
          },
          { key: 'ativo', header: 'Status', render: (p) => <Badge tone={p.ativo ? 'success' : 'neutral'}>{p.ativo ? 'Ativo' : 'Inativo'}</Badge> },
        ]}
      />
    </>
  )
}
