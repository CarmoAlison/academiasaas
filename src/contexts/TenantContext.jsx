import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { setLogContext } from '../services/logService'
import { getAcademy } from '../services/saasService'
import { TENANT_STORAGE_KEY } from '../utils/constants'

export const TenantContext = createContext(null)

const readStored = () => {
  try {
    return localStorage.getItem(TENANT_STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Academia (tenant) ativa. Para usuários comuns é uma das academias em que possuem perfil;
 * para o Super Admin pode ser qualquer academia ("acessar como").
 */
export function TenantProvider({ children }) {
  const { context, isSuperAdmin, session } = useAuth()
  const [academyId, setAcademyIdState] = useState(readStored)

  const setAcademy = useCallback((id) => {
    setAcademyIdState(id || null)
    try {
      if (id) localStorage.setItem(TENANT_STORAGE_KEY, id)
      else localStorage.removeItem(TENANT_STORAGE_KEY)
    } catch {
      // storage indisponível
    }
  }, [])

  const membership = context?.memberships.find((m) => m.academy_id === academyId) ?? null
  // "Acessar como": Super Admin numa academia onde não é da equipe (sem vínculo ou só como aluno)
  const impersonating = Boolean(
    isSuperAdmin && academyId && !membership?.roles.some((r) => r.slug !== 'aluno'),
  )

  // Sessão encerrada → limpa tenant
  useEffect(() => {
    if (session === null) setAcademy(null)
  }, [session, setAcademy])

  // Valida/auto-seleciona o tenant quando o contexto do usuário carrega
  useEffect(() => {
    if (!context) return
    if (academyId && !membership && !isSuperAdmin) setAcademy(null)
    else if (!academyId && !isSuperAdmin && context.memberships.length === 1) {
      setAcademy(context.memberships[0].academy_id)
    }
  }, [context, academyId, membership, isSuperAdmin, setAcademy])

  useEffect(() => setLogContext(academyId), [academyId])

  const impersonatedQuery = useQuery({
    queryKey: ['academy', academyId],
    queryFn: () => getAcademy(academyId),
    enabled: impersonating,
  })

  const value = useMemo(() => {
    const academy = membership
      ? { id: membership.academy_id, nome: membership.academy_nome, status: membership.academy_status, logo_url: membership.academy_logo }
      : impersonatedQuery.data ?? null
    return { academyId, academy, membership, impersonating, setAcademy }
  }, [academyId, membership, impersonating, impersonatedQuery.data, setAcademy])

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}
