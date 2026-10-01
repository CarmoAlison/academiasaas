import { onlyDigits } from '../utils/formatters'
import { nowISO, supabase, unwrap } from './supabaseClient'

export const listPermissions = () =>
  unwrap(supabase.from('permissions').select('id, recurso, acao, descricao').order('recurso').order('acao'))

/** Perfis da academia com ids de permissões e total de usuários */
export async function listRoles(academyId) {
  const [roles, links] = await Promise.all([
    unwrap(
      supabase
        .from('roles')
        .select('id, nome, descricao, slug, is_system, role_permissions(permission_id)')
        .eq('academy_id', academyId)
        .is('deleted_at', null)
        .order('is_system', { ascending: false })
        .order('nome'),
    ),
    unwrap(supabase.from('user_roles').select('role_id').eq('academy_id', academyId)),
  ])
  const counts = links.reduce((acc, l) => ({ ...acc, [l.role_id]: (acc[l.role_id] || 0) + 1 }), {})
  return roles.map((r) => ({
    ...r,
    permissionIds: r.role_permissions.map((rp) => rp.permission_id),
    usuarios: counts[r.id] || 0,
  }))
}

export const createRole = (academyId, values) =>
  unwrap(
    supabase
      .from('roles')
      .insert({ academy_id: academyId, nome: values.nome, descricao: values.descricao || null })
      .select('id')
      .single(),
  )

export const updateRole = (id, values) =>
  unwrap(supabase.from('roles').update({ nome: values.nome, descricao: values.descricao || null }).eq('id', id))

export const removeRole = (id) => unwrap(supabase.from('roles').update({ deleted_at: nowISO() }).eq('id', id))

/**
 * Sincroniza as permissões de um perfil (diff: remove as desmarcadas, insere as novas)
 * @param {string} roleId
 * @param {string[]} current
 * @param {string[]} next
 */
export async function setRolePermissions(roleId, current, next) {
  const toRemove = current.filter((id) => !next.includes(id))
  const toAdd = next.filter((id) => !current.includes(id))
  if (toRemove.length) {
    await unwrap(supabase.from('role_permissions').delete().eq('role_id', roleId).in('permission_id', toRemove))
  }
  if (toAdd.length) {
    await unwrap(supabase.from('role_permissions').insert(toAdd.map((permission_id) => ({ role_id: roleId, permission_id }))))
  }
}

// --- Equipe (usuários não-alunos) --------------------------------------

/** Membros da equipe: profiles com ao menos um perfil diferente de "aluno" */
export async function listStaff(academyId) {
  const [profiles, links, roles] = await Promise.all([
    unwrap(
      supabase
        .from('profiles')
        .select('id, user_id, nome, cpf, telefone, email_contato, status, avatar_url, created_at')
        .eq('academy_id', academyId)
        .is('deleted_at', null)
        .order('nome'),
    ),
    unwrap(supabase.from('user_roles').select('user_id, role_id').eq('academy_id', academyId)),
    unwrap(supabase.from('roles').select('id, nome, slug').eq('academy_id', academyId).is('deleted_at', null)),
  ])
  const roleById = Object.fromEntries(roles.map((r) => [r.id, r]))
  return profiles
    .map((p) => ({
      ...p,
      roles: links.filter((l) => l.user_id === p.user_id && roleById[l.role_id]).map((l) => roleById[l.role_id]),
    }))
    .filter((p) => p.roles.some((r) => r.slug !== 'aluno'))
}

/** Profiles que podem ser professores (equipe) — para selects */
export async function listStaffOptions(academyId) {
  const staff = await listStaff(academyId)
  return staff.filter((s) => s.status === 'ativo').map((s) => ({ value: s.id, label: s.nome }))
}

export const createStaff = (academyId, values) =>
  unwrap(
    supabase.rpc('create_staff', {
      p_academy: academyId,
      p_nome: values.nome,
      p_cpf: onlyDigits(values.cpf),
      p_telefone: onlyDigits(values.telefone),
      p_email: values.email_contato || null,
      p_role_id: values.role_id,
    }),
  )

/**
 * Atualiza dados e perfis de acesso de um membro da equipe
 * @param {{ id: string, user_id: string, roles: {id: string}[] }} member
 * @param {{ nome: string, telefone?: string, email_contato?: string, status: string, roleIds: string[] }} values
 * @param {string} academyId
 */
export async function updateStaff(member, values, academyId) {
  await unwrap(
    supabase
      .from('profiles')
      .update({
        nome: values.nome,
        telefone: onlyDigits(values.telefone) || null,
        email_contato: values.email_contato || null,
        status: values.status,
      })
      .eq('id', member.id),
  )
  const current = member.roles.map((r) => r.id)
  const toRemove = current.filter((id) => !values.roleIds.includes(id))
  const toAdd = values.roleIds.filter((id) => !current.includes(id))
  if (toRemove.length) {
    await unwrap(supabase.from('user_roles').delete().eq('user_id', member.user_id).in('role_id', toRemove))
  }
  if (toAdd.length) {
    await unwrap(
      supabase.from('user_roles').insert(toAdd.map((role_id) => ({ user_id: member.user_id, role_id, academy_id: academyId }))),
    )
  }
}

/** Remove da equipe; se a pessoa também é aluna, o acesso de aluno é mantido (regra no banco) */
export const removeStaff = (member) => unwrap(supabase.rpc('remove_staff', { p_profile: member.id }))

/** Nomes de membros da equipe (ex.: professor do treino/aula), visíveis inclusive para alunos */
export async function staffNames(ids) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!unique.length) return {}
  const rows = await unwrap(supabase.rpc('staff_names', { p_ids: unique }))
  return Object.fromEntries(rows.map((r) => [r.id, r.nome]))
}
