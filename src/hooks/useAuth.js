import { useCallback, useContext } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { TenantContext } from '../contexts/TenantContext'
import { logAccess } from '../services/logService'

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant deve ser usado dentro de <TenantProvider>')
  return ctx
}

/** Logout com registro em access_logs */
export function useLogout() {
  const { signOut } = useAuth()
  const { academyId } = useTenant()
  return useCallback(async () => {
    await logAccess(academyId, 'logout')
    await signOut()
  }, [academyId, signOut])
}
