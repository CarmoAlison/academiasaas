import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { THEME_STORAGE_KEY } from '../utils/constants'

/** @typedef {'light'|'dark'|'system'} ThemePreference */

export const ThemeContext = createContext(null)

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

const readPreference = () => {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** Aplica o tema no <html> (mesma lógica do script inline do index.html) */
function applyTheme(resolved) {
  const root = document.documentElement
  root.dataset.theme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#121A23' : '#006EB8')
}

/**
 * Tema claro/escuro. A preferência fica no navegador (por usuário/dispositivo);
 * "system" acompanha a configuração do sistema operacional.
 */
export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readPreference)
  const [systemDark, setSystemDark] = useState(() => media().matches)

  useEffect(() => {
    const mq = media()
    const onChange = (e) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => applyTheme(resolved), [resolved])

  const setPreference = useCallback((next) => {
    setPreferenceState(next)
    try {
      if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
      else localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // storage indisponível: vale só para esta sessão
    }
  }, [])

  const toggle = useCallback(() => setPreference(resolved === 'dark' ? 'light' : 'dark'), [resolved, setPreference])

  const value = useMemo(() => ({ preference, resolved, setPreference, toggle }), [preference, resolved, setPreference, toggle])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
