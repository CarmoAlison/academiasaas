import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useDebounce } from '../../hooks/useDebounce'
import { listAuditLogs } from '../../services/auditService'
import { AUDIT_ACTIONS, AUDIT_TABLES } from '../../utils/constants'
import { formatDateTime } from '../../utils/formatters'
import QueryError from '../feedback/QueryError'
import { StatusBadge } from '../ui/Badge'
import DataTable from '../ui/DataTable'
import Select from '../ui/Select'
import styles from './Audit.module.css'
import AuditDiffModal from './AuditDiffModal'
import LogFilters from './LogFilters'

const tableLabel = (t) => AUDIT_TABLES.find((x) => x.value === t)?.label ?? t

/**
 * Tabela de auditoria (paginação no servidor).
 * @param {object} props
 * @param {string|null} props.academyId null = todas (super admin)
 * @param {'detalhado'|'completo'} [props.variant] detalhado = com filtros; completo = todos os eventos
 */
export default function AuditLogTable({ academyId, variant = 'detalhado' }) {
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState({})
  const [selected, setSelected] = useState(null)
  const debounced = useDebounce(filters, 350)
  const pageSize = variant === 'completo' ? 50 : 20
  const global = !academyId

  const query = useQuery({
    queryKey: ['audit-logs', academyId, variant, page, debounced],
    queryFn: () => listAuditLogs({ academyId, page, pageSize, filters: variant === 'detalhado' ? debounced : {} }),
    placeholderData: keepPreviousData,
  })

  const changeFilters = (next) => {
    setFilters(next)
    setPage(0)
  }

  const columns = [
    { key: 'created_at', header: 'Data', render: (r) => formatDateTime(r.created_at), width: 150 },
    { key: 'acao', header: 'Ação', render: (r) => <StatusBadge status={r.acao} /> },
    { key: 'tabela', header: 'Tabela', render: (r) => tableLabel(r.tabela) },
    { key: 'user_nome', header: 'Usuário', render: (r) => r.user_nome ?? <span className="text-muted">Sistema</span> },
    ...(global ? [{ key: 'academies.nome', header: 'Academia', render: (r) => r.academies?.nome ?? '—' }] : []),
    ...(variant === 'completo'
      ? [
          { key: 'registro_id', header: 'Registro', render: (r) => <span className={`${styles.mono} ${styles.truncate}`}>{r.registro_id}</span> },
          { key: 'ip', header: 'IP', render: (r) => <span className={styles.mono}>{r.ip ?? '—'}</span> },
        ]
      : []),
  ]

  return (
    <>
      {variant === 'detalhado' && (
        <LogFilters value={filters} onChange={changeFilters} showAcademy={global}>
          <Select
            label="Ação"
            placeholder="Todas"
            value={filters.acao ?? ''}
            onChange={(e) => changeFilters({ ...filters, acao: e.target.value })}
            options={AUDIT_ACTIONS}
          />
          <Select
            label="Tabela"
            placeholder="Todas"
            value={filters.tabela ?? ''}
            onChange={(e) => changeFilters({ ...filters, tabela: e.target.value })}
            options={AUDIT_TABLES}
          />
        </LogFilters>
      )}

      {query.isError ? (
        <QueryError error={query.error} onRetry={query.refetch} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          loading={query.isPending}
          total={query.data?.count ?? 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onRowClick={(row) => setSelected(row.id)}
          emptyTitle="Nenhum evento registrado"
        />
      )}

      <AuditDiffModal logId={selected} onClose={() => setSelected(null)} />
    </>
  )
}
