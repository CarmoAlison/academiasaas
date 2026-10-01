import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useDebounce } from './useDebounce'

/**
 * Estado de uma tabela paginada no servidor: página, busca, ordenação e filtros.
 * Devolve `tableProps` prontas para o <DataTable /> (modo servidor).
 *
 * @template T
 * @param {object} options
 * @param {any[]} options.queryKey prefixo da query (ex.: ['students', academyId]) — invalidações por prefixo continuam valendo
 * @param {(params: { page: number, pageSize: number, search: string, sort: {key: string, dir: 'asc'|'desc'}|null, filters: Record<string, any> }) => Promise<{ data: T[], count: number }>} options.fetchPage
 * @param {number} [options.pageSize]
 * @param {{key: string, dir: 'asc'|'desc'}} [options.initialSort]
 * @param {Record<string, any>} [options.initialFilters]
 * @param {boolean} [options.enabled]
 */
export function useServerTable({ queryKey, fetchPage, pageSize = 20, initialSort = null, initialFilters = {}, enabled = true }) {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState(initialSort)
  const [filters, setFilters] = useState(initialFilters)
  const debouncedSearch = useDebounce(search, 350).trim()

  const query = useQuery({
    queryKey: [...queryKey, 'page', { page, pageSize, search: debouncedSearch, sort, filters }],
    queryFn: () => fetchPage({ page, pageSize, search: debouncedSearch, sort, filters }),
    placeholderData: keepPreviousData,
    enabled,
  })

  /** Altera um filtro e volta para a primeira página */
  const setFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(0)
  }, [])

  return {
    query,
    filters,
    setFilter,
    search: debouncedSearch,
    sort,
    tableProps: {
      data: query.data?.data ?? [],
      total: query.data?.count ?? 0,
      loading: query.isPending,
      page,
      pageSize,
      onPageChange: setPage,
      search,
      onSearchChange: (value) => {
        setSearch(value)
        setPage(0)
      },
      sort,
      onSortChange: (next) => {
        setSort(next)
        setPage(0)
      },
    },
  }
}
