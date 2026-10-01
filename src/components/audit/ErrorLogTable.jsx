import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useDebounce } from '../../hooks/useDebounce'
import { listErrors } from '../../services/auditService'
import { formatDateTime } from '../../utils/formatters'
import QueryError from '../feedback/QueryError'
import Badge from '../ui/Badge'
import DataTable from '../ui/DataTable'
import Drawer from '../ui/Drawer'
import Input from '../ui/Input'
import styles from './Audit.module.css'
import LogFilters from './LogFilters'

const PAGE_SIZE = 20

/**
 * Erros do frontend (stack trace, rota, usuário, data)
 * @param {{ academyId: string|null }} props
 */
export default function ErrorLogTable({ academyId }) {
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState({})
  const [selected, setSelected] = useState(null)
  const debounced = useDebounce(filters, 350)
  const global = !academyId

  const query = useQuery({
    queryKey: ['errors', academyId, page, debounced],
    queryFn: () => listErrors({ academyId, page, pageSize: PAGE_SIZE, filters: debounced }),
    placeholderData: keepPreviousData,
  })

  const changeFilters = (next) => {
    setFilters(next)
    setPage(0)
  }

  const columns = [
    { key: 'created_at', header: 'Data', render: (r) => formatDateTime(r.created_at), width: 150 },
    {
      key: 'mensagem',
      header: 'Mensagem',
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
          <span className={styles.truncate}>{r.mensagem}</span>
          {r.ocorrencias > 1 && (
            <Badge tone="warning" title={`Última vez: ${formatDateTime(r.ultima_em)}`}>
              {r.ocorrencias}×
            </Badge>
          )}
        </span>
      ),
    },
    { key: 'rota', header: 'Rota', render: (r) => <span className={styles.mono}>{r.rota ?? '—'}</span> },
    { key: 'user_nome', header: 'Usuário', render: (r) => r.user_nome ?? <span className="text-muted">Anônimo</span> },
    ...(global ? [{ key: 'academies.nome', header: 'Academia', render: (r) => r.academies?.nome ?? '—' }] : []),
  ]

  return (
    <>
      <LogFilters value={filters} onChange={changeFilters} showAcademy={global}>
        <Input
          label="Mensagem"
          placeholder="Contém..."
          value={filters.busca ?? ''}
          onChange={(e) => changeFilters({ ...filters, busca: e.target.value })}
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
          onRowClick={setSelected}
          emptyTitle="Nenhum erro registrado"
          emptyDescription="Ótimo sinal! Erros do sistema aparecerão aqui."
        />
      )}

      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title="Detalhe do erro" width={640}>
        {selected && (
          <>
            <dl className={styles.meta}>
              <div>
                <dt>Data</dt>
                <dd>{formatDateTime(selected.created_at)}</dd>
              </div>
              {selected.ocorrencias > 1 && (
                <div>
                  <dt>Ocorrências</dt>
                  <dd>
                    {selected.ocorrencias}× · última {formatDateTime(selected.ultima_em)}
                  </dd>
                </div>
              )}
              <div>
                <dt>Usuário</dt>
                <dd>{selected.user_nome ?? 'Anônimo'}</dd>
              </div>
              <div>
                <dt>Rota</dt>
                <dd className={styles.mono}>{selected.rota ?? '—'}</dd>
              </div>
            </dl>
            <h3 style={{ marginBottom: 8 }}>Mensagem</h3>
            <p style={{ marginBottom: 20 }}>{selected.mensagem}</p>
            <h3 style={{ marginBottom: 8 }}>Stack trace</h3>
            <pre className={styles.stack}>{selected.stack || 'Sem stack trace'}</pre>
            {selected.user_agent && (
              <p className="text-muted" style={{ marginTop: 12, fontSize: 12 }}>
                {selected.user_agent}
              </p>
            )}
          </>
        )}
      </Drawer>
    </>
  )
}
