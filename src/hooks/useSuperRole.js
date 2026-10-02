import { useAuth } from './useAuth'

export const SUPER_ROLES = [
  { value: 'admin', label: 'Administrador', description: 'Acesso total ao SaaS' },
  { value: 'suporte', label: 'Suporte', description: 'Acessa academias, logs, chamados e avisos' },
  { value: 'financeiro', label: 'Financeiro', description: 'Faturas e planos do SaaS' },
]

/** Mesmas regras de super_can() no banco */
const AREAS = {
  admin: null, // tudo
  suporte: ['acessar', 'suporte', 'avisos', 'auditoria'],
  financeiro: ['financeiro', 'auditoria'],
}

/**
 * Papel do usuário na equipe do SaaS e o que ele pode fazer.
 * Áreas: acessar, suporte, avisos, financeiro, academias, equipe, config, auditoria.
 */
export function useSuperRole() {
  const { context } = useAuth()
  const papel = context?.super_admin?.papel ?? 'admin'
  const allowed = AREAS[papel]
  return {
    papel,
    label: SUPER_ROLES.find((r) => r.value === papel)?.label ?? 'Super Admin',
    superCan: (area) => allowed === null || Boolean(allowed?.includes(area)),
  }
}
