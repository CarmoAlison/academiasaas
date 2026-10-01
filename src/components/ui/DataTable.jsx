import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDebounce } from '../../hooks/useDebounce'
import styles from './DataTable.module.css'
import EmptyState from './EmptyState'
import { SkeletonRows } from './Skeleton'

/**
 * @typedef {object} Column
 * @property {string} key                caminho do valor (ex.: 'profile.nome')
 * @property {string} header
 * @property {(row: any) => any} [render]
 * @property {(row: any) => any} [sortValue]
 * @property {boolean} [sortable]        padrão: true
 * @property {'left'|'right'|'center'} [align]
 * @property {string|number} [width]
 */

const getPath = (obj, path) => path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj)

const normalize = (v) =>
  String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/**
 * Tabela com busca, ordenação e paginação.
 * Modo servidor: informe `total`, `page` e `onPageChange` (data = página atual).
 *
 * @param {object} props
 * @param {Column[]} props.columns
 * @param {any[]} props.data
 * @param {boolean} [props.loading]
 * @param {(row: any) => void} [props.onRowClick]
 * @param {boolean} [props.searchable]
 * @param {string} [props.searchPlaceholder]
 * @param {Array<string|((row: any) => any)>} [props.searchKeys]
 * @param {import('react').ReactNode} [props.filters] filtros extras na toolbar
 * @param {import('react').ReactNode} [props.actions] ações à direita da toolbar
 * @param {number} [props.pageSize]
 * @param {{ key: string, dir: 'asc'|'desc' }} [props.initialSort]
 * @param {number} [props.total]
 * @param {number} [props.page]
 * @param {(page: number) => void} [props.onPageChange]
 * @param {string} [props.emptyTitle]
 * @param {string} [props.emptyDescription]
 * @param {import('react').ReactNode} [props.emptyAction]
 */
export default function DataTable({
  columns,
  data = [],
  loading = false,
  rowKey = 'id',
  onRowClick,
  searchable = true,
  searchPlaceholder = 'Buscar...',
  searchKeys,
  filters,
  actions,
  pageSize = 10,
  initialSort,
  total,
  page: serverPage,
  onPageChange,
  search: serverSearchValue,
  onSearchChange,
  sort: serverSortValue,
  onSortChange,
  emptyTitle = 'Nenhum registro encontrado',
  emptyDescription,
  emptyAction,
}) {
  const serverMode = typeof onPageChange === 'function'
  // no modo servidor, busca e ordenação são controladas por quem usa a tabela (ex.: useServerTable)
  const serverSearch = serverMode && typeof onSearchChange === 'function'
  const serverSort = serverMode && typeof onSortChange === 'function'
  const [localSearch, setLocalSearch] = useState('')
  const search = serverSearch ? (serverSearchValue ?? '') : localSearch
  const debouncedSearch = useDebounce(localSearch, 200)
  const [localSort, setLocalSort] = useState(initialSort ?? null)
  const sort = serverSort ? (serverSortValue ?? null) : localSort
  const [localPage, setLocalPage] = useState(0)

  const processed = useMemo(() => {
    if (serverMode) return data
    let rows = data
    const term = normalize(debouncedSearch.trim())
    if (term) {
      const keys = searchKeys ?? columns.map((c) => c.key)
      rows = rows.filter((row) =>
        keys.some((k) => normalize(typeof k === 'function' ? k(row) : getPath(row, k)).includes(term)),
      )
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)
      const value = (row) => (col?.sortValue ? col.sortValue(row) : getPath(row, sort.key))
      rows = [...rows].sort((a, b) => {
        const va = value(a)
        const vb = value(b)
        if (va == null && vb == null) return 0
        if (va == null) return 1
        if (vb == null) return -1
        const cmp =
          typeof va === 'number' && typeof vb === 'number'
            ? va - vb
            : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true })
        return sort.dir === 'asc' ? cmp : -cmp
      })
    }
    return rows
  }, [data, debouncedSearch, sort, columns, searchKeys, serverMode])

  const totalRows = serverMode ? (total ?? 0) : processed.length
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize))
  const page = Math.min(serverMode ? (serverPage ?? 0) : localPage, pageCount - 1)
  const rows = serverMode ? processed : processed.slice(page * pageSize, page * pageSize + pageSize)

  const goTo = (p) => (serverMode ? onPageChange(p) : setLocalPage(p))

  const canSort = !serverMode || serverSort
  const toggleSort = (col) => {
    if (!canSort || col.sortable === false) return
    const next = sort?.key !== col.key ? { key: col.key, dir: 'asc' } : sort.dir === 'asc' ? { key: col.key, dir: 'desc' } : null
    if (serverSort) onSortChange(next)
    else setLocalSort(next)
  }

  const showSearch = searchable && (!serverMode || serverSearch)
  const onSearchInput = (value) => {
    if (serverSearch) onSearchChange(value)
    else {
      setLocalSearch(value)
      setLocalPage(0)
    }
  }
  const activeSearch = serverSearch ? search : debouncedSearch
  const showToolbar = showSearch || filters || actions
  const from = totalRows ? page * pageSize + 1 : 0
  const to = Math.min(totalRows, (page + 1) * pageSize)

  return (
    <div className={styles.wrapper}>
      {showToolbar && (
        <div className={styles.toolbar}>
          {showSearch && (
            <label className={styles.search}>
              <Search size={16} aria-hidden />
              <input
                type="search"
                value={search}
                placeholder={searchPlaceholder}
                onChange={(e) => onSearchInput(e.target.value)}
                aria-label="Buscar"
              />
            </label>
          )}
          {filters && <div className={styles.filters}>{filters}</div>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}

      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => {
                const sortable = canSort && col.sortable !== false && !!col.header
                const active = sort?.key === col.key
                const SortIcon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
                return (
                  <th
                    key={col.key}
                    style={{ width: col.width, textAlign: col.align }}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {sortable ? (
                      <button type="button" className={styles.sortBtn} onClick={() => toggleSort(col)}>
                        {col.header}
                        <SortIcon size={13} className={active ? styles.sortActive : styles.sortIcon} />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows rows={Math.min(pageSize, 6)} cols={columns.length} />
            ) : (
              rows.map((row) => (
                <tr
                  key={typeof rowKey === 'function' ? rowKey(row) : row[rowKey]}
                  className={onRowClick ? styles.clickable : ''}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} style={{ textAlign: col.align }}>
                      {col.render ? col.render(row) : (getPath(row, col.key) ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <EmptyState
            compact
            title={activeSearch ? 'Nenhum resultado para a busca' : emptyTitle}
            description={activeSearch ? 'Tente outros termos.' : emptyDescription}
            action={activeSearch ? null : emptyAction}
          />
        )}
      </div>

      {!loading && totalRows > 0 && (
        <div className={styles.pagination}>
          <span className={styles.info}>
            {from}–{to} de {totalRows}
          </span>
          <div className={styles.pages}>
            <button type="button" onClick={() => goTo(page - 1)} disabled={page === 0} aria-label="Página anterior">
              <ChevronLeft size={16} />
            </button>
            <span className={styles.pageLabel}>
              {page + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => goTo(page + 1)}
              disabled={page >= pageCount - 1}
              aria-label="Próxima página"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
