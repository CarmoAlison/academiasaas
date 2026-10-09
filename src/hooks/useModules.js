import { useQuery } from '@tanstack/react-query'
import { academyModules } from '../services/moduleService'
import { useTenant } from './useAuth'

/**
 * Módulos liberados para a academia ativa (definidos pelo Super Admin).
 * Enquanto carrega, nada opcional aparece (o que está bloqueado nunca "pisca" na tela).
 * @returns {{ has: (slug: string) => boolean, loaded: boolean, modules: string[] }}
 */
export function useModules() {
  const { academyId } = useTenant()
  const query = useQuery({
    queryKey: ['academy-modules', academyId],
    queryFn: () => academyModules(academyId),
    enabled: Boolean(academyId),
    staleTime: 5 * 60000,
  })
  const list = query.data ?? []
  return {
    modules: list,
    loaded: query.isSuccess,
    has: (slug) => !slug || list.includes(slug),
  }
}
