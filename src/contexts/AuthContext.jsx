import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import * as authService from '../services/authService'
import { supabase } from '../services/supabaseClient'

/**
 * @typedef {object} Membership
 * @property {string} academy_id
 * @property {string} academy_nome
 * @property {string} academy_status
 * @property {string|null} academy_logo
 * @property {object} profile
 * @property {string|null} student_id
 * @property {{id: string, nome: string, slug: string|null}[]} roles
 * @property {string[]} permissions
 *
 * @typedef {object} UserContext
 * @property {string} user_id
 * @property {object|null} super_admin
 * @property {Membership[]} memberships
 */

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  /** undefined = carregando sessão */
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user?.id

  const contextQuery = useQuery({
    queryKey: ['me', userId],
    queryFn: authService.getContext,
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  })

  const signIn = useCallback(
    async (cpf, password, captchaToken) => {
      const newSession = await authService.signInWithCPF(cpf, password, captchaToken)
      setSession(newSession)
      return queryClient.fetchQuery({ queryKey: ['me', newSession.user.id], queryFn: authService.getContext })
    },
    [queryClient],
  )

  const signOut = useCallback(async () => {
    await authService.signOut()
    setSession(null)
    queryClient.clear()
  }, [queryClient])

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ['me'] }), [queryClient])

  const value = useMemo(() => {
    /** @type {UserContext|undefined} */
    const context = contextQuery.data
    const mustChangePassword = Boolean(
      context &&
        (context.super_admin?.must_change_password ||
          context.memberships.some((m) => m.profile?.must_change_password)),
    )
    return {
      session,
      user: session?.user ?? null,
      context,
      contextError: contextQuery.error,
      loading: session === undefined || (Boolean(userId) && contextQuery.isPending),
      isSuperAdmin: Boolean(context?.super_admin),
      mustChangePassword,
      signIn,
      signOut,
      refresh,
    }
  }, [session, userId, contextQuery.data, contextQuery.error, contextQuery.isPending, signIn, signOut, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
