import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useDebounce } from '../../hooks/useDebounce'
import { listAccessLogs } from '../../services/auditService'
import { formatDateTime } from '../../utils/formatters'
import QueryError from '../feedback/QueryError'
import { StatusBadge } from '../ui/Badge'
import DataTable from '../ui/DataTable'
import Select from '../ui/Select'
import styles from './Audit.module.css'
import LogFilters from './LogFilters'

const PAGE_SIZE = 25

/** Descreve o navegador a partir do user-agent */
function browserOf(ua = '') {
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Outro'
  return [browser, os].filter(Boolean).join(' · ')
}

/**
 * Logins/logouts com IP e user-agent
 * @param {{ academyId: string|null }} props
 */
export default function AccessLogTable({ academyId }) {
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState({})
  const debounced = useDebounce(filters, 350)
  const global = !academyId

  const query = useQuery({
    queryKey: ['access-logs', academyId, page, debounced],
    queryFn: () => listAccessLogs({ academyId, page, pageSize: PAGE_SIZE, filters: debounced }),
    placeholderData: keepPreviousData,
  })

  const changeFilters = (next) => {
    setFilters(next)
    setPage(0)
  }

  const columns = [
    { key: 'created_at', header: 'Data', render: (r) => formatDateTime(r.created_at), width: 150 },
    { key: 'evento', header: 'Evento', render: (r) => <StatusBadge status={r.evento} /> },
    { key: 'user_nome', header: 'Usuário', render: (r) => r.user_nome ?? '—' },
    ...(global ? [{ key: 'academies.nome', header: 'Academia', render: (r) => r.academies?.nome ?? '—' }] : []),
    { key: 'ip', header: 'IP', render: (r) => <span className={styles.mono}>{r.ip ?? '—'}</span> },
    {
      key: 'user_agent',
      header: 'Navegador',
      render: (r) => <span title={r.user_agent}>{browserOf(r.user_agent)}</span>,
    },
  ]

  return (
    <>
      <LogFilters value={filters} onChange={changeFilters} showAcademy={global}>
        <Select
          label="Evento"
          placeholder="Todos"
          value={filters.evento ?? ''}
          onChange={(e) => changeFilters({ ...filters, evento: e.target.value })}
          options={[
            { value: 'login', label: 'Login' },
            { value: 'logout', label: 'Logout' },
          ]}
        />
      </LogFilters>

      {query.isError ? (
        <QueryError error={query.error} onRetry={query.refetch} />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          loading={query.isPending}
          total={query.data?.count ?? 0}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          emptyTitle="Nenhum acesso registrado"
        />
      )}
    </>
  )
}
