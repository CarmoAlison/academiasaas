import { useEffect } from 'react'
import { brandVars, isHexColor } from '../utils/color'
import { useAcademySettings } from './useAcademySettings'
import { useTenant } from './useAuth'
import { useTheme } from './useTheme'

/**
 * Identidade visual da academia ativa: aplica a cor escolhida pelo Admin no sistema
 * (sobrescreve as variáveis de cor primária) e devolve o logo. Usar nos layouts.
 * @returns {{ logo: string|null, cor: string|null }}
 */
export function useBrand() {
  const { academy } = useTenant()
  const { resolved } = useTheme()
  const settings = useAcademySettings().data
  const cor = isHexColor(settings?.cor_primaria) ? settings.cor_primaria : null

  useEffect(() => {
    if (!cor) return
    const root = document.documentElement
    const vars = brandVars(cor, resolved === 'dark')
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousMeta = meta?.getAttribute('content')
    if (resolved !== 'dark') meta?.setAttribute('content', cor)
    return () => {
      Object.keys(vars).forEach((k) => root.style.removeProperty(k))
      if (meta && previousMeta) meta.setAttribute('content', previousMeta)
    }
  }, [cor, resolved])

  return { logo: settings?.logo_url || academy?.logo_url || null, cor }
}
