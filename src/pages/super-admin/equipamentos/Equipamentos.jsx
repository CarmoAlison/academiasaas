import { useQuery } from '@tanstack/react-query'
import { ScanFace } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, DataTable, PageHeader, Select, StatCard, StatGrid } from '../../../components/ui'
import { isOnline, listEquipamentos } from '../../../services/catracaService'
import { formatDateTime } from '../../../utils/formatters'

const situacao = (d) => (!d.ativo ? 'desativada' : isOnline(d.ultimo_sinal) ? 'online' : 'offline')

/** Catracas de todas as academias: status, fila de comandos e erros (gestão de TI do SaaS) */
export default function Equipamentos() {
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState('')
  const query = useQuery({ queryKey: ['catraca-equipamentos'], queryFn: listEquipamentos, refetchInterval: 15000 })
  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  const all = (query.data ?? []).map((d) => ({ ...d, situacao: situacao(d) }))
  const rows = all.filter((d) => !filtro || d.situacao === filtro)
  const count = (s) => all.filter((d) => d.situacao === s).length

  return (
    <>
      <PageHeader title="Equipamentos" subtitle="Catracas de todas as academias (atualiza a cada 15 segundos)" />
      <StatGrid>
        <StatCard label="Catracas" value={all.length} icon={ScanFace} loading={query.isPending} />
        <StatCard label="Online" value={count('online')} tone="success" loading={query.isPending} />
        <StatCard label="Offline" value={count('offline')} tone="danger" loading={query.isPending} hint="Sem sinal há mais de 2 minutos" />
        <StatCard label="Acessos hoje" value={all.reduce((a, d) => a + d.acessos_hoje, 0)} loading={query.isPending} />
      </StatGrid>
      <DataTable
        loading={query.isPending}
        data={rows}
        searchKeys={['academia', 'nome', 'modelo']}
        searchPlaceholder="Buscar academia ou catraca"
        onRowClick={(d) => navigate(`/super-admin/academias/${d.academy_id}?tab=catraca`)}
        filters={
          <Select
            aria-label="Situação"
            placeholder="Todas"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            options={[
              { value: 'online', label: 'Online' },
              { value: 'offline', label: 'Offline' },
              { value: 'desativada', label: 'Desativadas' },
            ]}
          />
        }
        emptyTitle="Nenhuma catraca cadastrada"
        emptyDescription="Cadastre as catracas na aba Catraca de cada academia."
        columns={[
          { key: 'academia', header: 'Academia', render: (d) => <strong>{d.academia}</strong> },
          { key: 'nome', header: 'Catraca' },
          { key: 'modelo', header: 'Modelo', render: (d) => `${d.modelo ?? '—'}${d.firmware ? ` · ${d.firmware}` : ''}` },
          {
            key: 'situacao',
            header: 'Situação',
            render: (d) => (
              <Badge tone={d.situacao === 'online' ? 'success' : d.situacao === 'offline' ? 'danger' : 'neutral'}>
                {{ online: 'Online', offline: d.ultimo_sinal ? 'Offline' : 'Aguardando conexão', desativada: 'Desativada' }[d.situacao]}
              </Badge>
            ),
          },
          { key: 'ultimo_sinal', header: 'Último sinal', render: (d) => (d.ultimo_sinal ? formatDateTime(d.ultimo_sinal) : '—') },
          { key: 'fila', header: 'Na fila', align: 'right' },
          { key: 'erros', header: 'Erros (24h)', align: 'right', render: (d) => (d.erros ? <Badge tone="danger">{d.erros}</Badge> : 0) },
          { key: 'acessos_hoje', header: 'Acessos hoje', align: 'right' },
        ]}
      />
    </>
  )
}
