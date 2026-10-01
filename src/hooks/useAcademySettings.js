import { useQuery } from '@tanstack/react-query'
import { getAcademySettings } from '../services/academySettingsService'
import { useTenant } from './useAuth'

/** Configurações da academia ativa (com os padrões aplicados) */
export function useAcademySettings() {
  const { academyId } = useTenant()
  return useQuery({
    queryKey: ['academy-settings', academyId],
    queryFn: () => getAcademySettings(academyId),
    enabled: Boolean(academyId),
  })
}
