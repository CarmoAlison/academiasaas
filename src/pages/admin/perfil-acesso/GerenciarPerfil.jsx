import { useQuery } from '@tanstack/react-query'
import { Info, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import { Button, Card, Checkbox, EmptyState, PageHeader, Select } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { listPermissions, listRoles, setRolePermissions } from '../../../services/roleService'
import { ACTIONS, RESOURCES } from '../../../utils/constants'
import styles from './GerenciarPerfil.module.css'

/** Matriz editável recurso × ação */
export default function GerenciarPerfil() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const [params, setParams] = useSearchParams()
  const roles = useQuery({ queryKey: ['roles', academyId], queryFn: () => listRoles(academyId) })
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: listPermissions, staleTime: Infinity })

  const roleId = params.get('perfil') ?? roles.data?.find((r) => r.slug !== 'admin' && r.slug !== 'aluno')?.id ?? roles.data?.[0]?.id
  const role = roles.data?.find((r) => r.id === roleId)
  const [selected, setSelected] = useState(new Set())

  useEffect(() => {
    if (role) setSelected(new Set(role.permissionIds))
  }, [role])

  /** permissão por "recurso.acao" */
  const byKey = useMemo(
    () => Object.fromEntries((permissions.data ?? []).map((p) => [`${p.recurso}.${p.acao}`, p])),
    [permissions.data],
  )

  const locked = !role || role.slug === 'admin' || role.slug === 'aluno' || !can('perfis.editar')
  const dirty = role && (selected.size !== role.permissionIds.length || role.permissionIds.some((id) => !selected.has(id)))

  const mutation = useMutationToast(() => setRolePermissions(role.id, role.permissionIds, [...selected]), {
    success: 'Permissões salvas. Usuários com este perfil verão as mudanças no próximo carregamento.',
    invalidate: [['roles', academyId], ['me']],
  })

  const toggle = (ids, checked) =>
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)))
      return next
    })

  if (roles.isPending || permissions.isPending) return <PageLoader />
  if (roles.isError) return <QueryError error={roles.error} onRetry={roles.refetch} />

  const rowIds = (resource) => ACTIONS.map((a) => byKey[`${resource}.${a.key}`]?.id).filter(Boolean)
  const colIds = (action) => RESOURCES.map((r) => byKey[`${r.key}.${action}`]?.id).filter(Boolean)
  const isChecked = (id) => role?.slug === 'admin' || selected.has(id)
  const allOf = (ids) => ids.length > 0 && ids.every(isChecked)
  const someOf = (ids) => ids.some(isChecked)

  return (
    <>
      <PageHeader
        title="Gerenciar permissões"
        breadcrumb={[{ label: 'Perfil de acesso', to: '/admin/perfil-acesso' }, { label: 'Gerenciar' }]}
        actions={
          !locked && (
            <Button icon={Save} disabled={!dirty} loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Salvar permissões
            </Button>
          )
        }
      />

      <Card>
        <div className={styles.top}>
          <Select
            label="Perfil"
            value={roleId ?? ''}
            onChange={(e) => setParams({ perfil: e.target.value }, { replace: true })}
            options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.nome }))}
          />
          {role?.descricao && <p className="text-muted">{role.descricao}</p>}
        </div>

        {role?.slug === 'admin' && (
          <p className={styles.notice}>
            <Info size={16} /> O perfil Admin possui todas as permissões e não pode ser alterado.
          </p>
        )}

        {role?.slug === 'aluno' ? (
          <EmptyState
            compact
            icon={Info}
            title="Perfil de aluno"
            description="Alunos acessam somente a área do aluno com os próprios dados. Não há permissões administrativas para configurar."
          />
        ) : (
          <div className={styles.scroll}>
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th>Recurso</th>
                  {ACTIONS.map((a) => {
                    const ids = colIds(a.key)
                    return (
                      <th key={a.key}>
                        <Checkbox
                          label={a.label}
                          checked={allOf(ids)}
                          indeterminate={!allOf(ids) && someOf(ids)}
                          disabled={locked}
                          onChange={(c) => toggle(ids, c)}
                        />
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {RESOURCES.map((r) => {
                  const ids = rowIds(r.key)
                  return (
                    <tr key={r.key}>
                      <td>
                        <Checkbox
                          label={<strong>{r.label}</strong>}
                          checked={allOf(ids)}
                          indeterminate={!allOf(ids) && someOf(ids)}
                          disabled={locked}
                          onChange={(c) => toggle(ids, c)}
                        />
                      </td>
                      {ACTIONS.map((a) => {
                        const perm = byKey[`${r.key}.${a.key}`]
                        return (
                          <td key={a.key} className={styles.cell}>
                            {perm ? (
                              <Checkbox
                                checked={isChecked(perm.id)}
                                disabled={locked}
                                onChange={(c) => toggle([perm.id], c)}
                                aria-label={`${r.label}: ${a.label}`}
                                title={perm.descricao}
                              />
                            ) : (
                              <span className={styles.na}>—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
