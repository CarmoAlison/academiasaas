import { useContext } from 'react'
import { ThemeContext } from '../contexts/ThemeContext'

/**
 * @returns {{ preference: 'light'|'dark'|'system', resolved: 'light'|'dark', setPreference: (p: 'light'|'dark'|'system') => void, toggle: () => void }}
 */
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme deve ser usado dentro de <ThemeProvider>')
  return ctx
}
