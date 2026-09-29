import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import ResetPasswordButton from '../../../components/auth/ResetPasswordButton'
import QueryError from '../../../components/feedback/QueryError'
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  DataTable,
  FormGrid,
  FullRow,
  Input,
  Modal,
  Select,
  StatusBadge,
  useConfirm,
} from '../../../components/ui'
import { useAuth, useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { createStaff, listRoles, listStaff, removeStaff, updateStaff } from '../../../services/roleService'
import { formatCPF, formatPhone } from '../../../utils/formatters'
import { rules } from '../../../utils/validators'

function MemberModal({ member, roles, academyId, onClose }) {
  const isNew = !member
  const { isAdmin } = usePermissions()
  const assignable = roles.filter((r) => r.slug !== 'aluno' && (isAdmin || r.slug !== 'admin'))
  const { field, values, setValue, errors, handleSubmit } = useForm(
    {
      nome: member?.nome ?? '',
      cpf: formatCPF(member?.cpf ?? ''),
      telefone: formatPhone(member?.telefone ?? ''),
      email_contato: member?.email_contato ?? '',
      status: member?.status ?? 'ativo',
      role_id: '',
      roleIds: member?.roles.filter((r) => assignable.some((a) => a.id === r.id)).map((r) => r.id) ?? [],
    },
    {
      nome: [rules.required()],
      cpf: isNew ? [rules.required(), rules.cpf()] : [],
      email_contato: [rules.email()],
      role_id: isNew ? [rules.required('Selecione o perfil')] : [],
      roleIds: isNew ? [] : [rules.required('Selecione ao menos um perfil')],
    },
  )

  const invalidate = [['staff', academyId], ['staff-options', academyId], ['roles', academyId]]
  const mutation = useMutationToast((v) => (isNew ? createStaff(academyId, v) : updateStaff(member, v, academyId)), {
    success: (_, v) => (isNew ? `Usuário criado! Senha inicial: ${v.cpf.replace(/\D/g, '').slice(0, 6)}` : 'Usuário atualizado'),
    invalidate,
    onSuccess: onClose,
  })
  // perfis que o usuário atual não gerencia (ex.: Aluno, Admin) são preservados
  const keep = member?.roles.filter((r) => !assignable.some((a) => a.id === r.id)).map((r) => r.id) ?? []
  const submit = handleSubmit((v) => mutation.mutate({ ...v, roleIds: [...v.roleIds, ...keep] }))

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Novo membro da equipe' : `Editar ${member.nome}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <FullRow>
            <Input label="Nome completo" required {...field('nome')} />
          </FullRow>
          <Input
            label="CPF (login)"
            required={isNew}
            disabled={!isNew}
            inputMode="numeric"
            hint={isNew ? 'Senha inicial: 6 primeiros dígitos' : undefined}
            {...field('cpf', { mask: 'cpf' })}
          />
          <Input label="Telefone" {...field('telefone', { mask: 'phone' })} />
          <Input label="E-mail" type="email" {...field('email_contato')} />
          {isNew ? (
            <Select
              label="Perfil de acesso"
              required
              placeholder="Selecione"
              options={assignable.map((r) => ({ value: r.id, label: r.nome }))}
              {...field('role_id')}
            />
          ) : (
            <Select
              label="Status"
              options={[
                { value: 'ativo', label: 'Ativo' },
                { value: 'inativo', label: 'Inativo (sem acesso)' },
              ]}
              {...field('status')}
            />
          )}
          {!isNew && (
            <FullRow>
              <span style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Perfis de acesso</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {assignable.map((r) => (
                  <Checkbox
                    key={r.id}
                    label={r.nome}
                    checked={values.roleIds.includes(r.id)}
                    onChange={(checked) =>
                      setValue('roleIds', checked ? [...values.roleIds, r.id] : values.roleIds.filter((x) => x !== r.id))
                    }
                  />
                ))}
              </div>
              {errors.roleIds && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginTop: 6 }}>{errors.roleIds}</p>}
            </FullRow>
          )}
        </FormGrid>
      </form>
    </Modal>
  )
}

export default function EquipeTab() {
  const { academyId } = useTenant()
  const { user } = useAuth()
  const { can, isAdmin } = usePermissions()
  const [editing, setEditing] = useState(null)
  const [confirm, confirmDialog] = useConfirm()

  const staff = useQuery({ queryKey: ['staff', academyId], queryFn: () => listStaff(academyId) })
  const roles = useQuery({ queryKey: ['roles', academyId], queryFn: () => listRoles(academyId) })
  const removeMutation = useMutationToast(removeStaff, {
    success: 'Usuário removido da equipe',
    invalidate: [['staff', academyId], ['staff-options', academyId]],
  })

  if (staff.isError) return <QueryError error={staff.error} onRetry={staff.refetch} />

  const canTouch = (m) => m.user_id !== user?.id && (isAdmin || !m.roles.some((r) => r.slug === 'admin'))

  return (
    <>
      {confirmDialog}
      <DataTable
        loading={staff.isPending}
        data={staff.data ?? []}
        searchKeys={['nome', 'cpf']}
        searchPlaceholder="Buscar por nome ou CPF"
        actions={
          can('equipe.criar') && (
            <Button icon={Plus} onClick={() => setEditing({})} disabled={!roles.data}>
              Novo membro
            </Button>
          )
        }
        emptyTitle="Nenhum membro na equipe"
        columns={[
          {
            key: 'nome',
            header: 'Nome',
            render: (m) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={m.nome} src={m.avatar_url} size={32} />
                <strong>{m.nome}</strong>
                {m.user_id === user?.id && <Badge tone="info">Você</Badge>}
              </span>
            ),
          },
          { key: 'cpf', header: 'CPF', render: (m) => formatCPF(m.cpf) },
          {
            key: 'roles',
            header: 'Perfis',
            sortable: false,
            render: (m) => (
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                {m.roles.map((r) => (
                  <Badge key={r.id} tone={r.slug === 'admin' ? 'warning' : 'neutral'}>
                    {r.nome}
                  </Badge>
                ))}
              </span>
            ),
          },
          { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} /> },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (m) =>
              canTouch(m) && (
                <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  {can('equipe.editar') && (
                    <>
                      <ResetPasswordButton profileId={m.id} nome={m.nome} size="sm" />
                      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(m)} aria-label="Editar" />
                    </>
                  )}
                  {can('equipe.excluir') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      aria-label="Remover"
                      onClick={async () => {
                        if (await confirm({ title: 'Remover da equipe', message: `${m.nome} perderá o acesso a esta academia.`, danger: true, confirmLabel: 'Remover' })) {
                          removeMutation.mutate(m)
                        }
                      }}
                    />
                  )}
                </div>
              ),
          },
        ]}
      />
      {editing && roles.data && (
        <MemberModal member={editing.id ? editing : null} roles={roles.data} academyId={academyId} onClose={() => setEditing(null)} />
      )}
    </>
  )
}
