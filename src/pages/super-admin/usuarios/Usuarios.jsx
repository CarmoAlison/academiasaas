import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, DataTable, FormGrid, Input, Modal, PageHeader, Select, Tooltip, useConfirm } from '../../../components/ui'
import { useAuth } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { SUPER_ROLES } from '../../../hooks/useSuperRole'
import { useMutationToast } from '../../../hooks/useMutationToast'
import {
  createSuperAdmin,
  listSuperAdmins,
  removeSuperAdmin,
  resetSuperAdminPassword,
  updateSuperAdmin,
} from '../../../services/saasService'
import { formatCPF, formatDate } from '../../../utils/formatters'
import { rules } from '../../../utils/validators'

function UserModal({ user, onClose }) {
  const isNew = !user
  const { field, values, handleSubmit } = useForm(
    { nome: user?.nome ?? '', cpf: formatCPF(user?.cpf ?? ''), email: user?.email ?? '', papel: user?.papel ?? 'suporte' },
    { nome: [rules.required()], cpf: isNew ? [rules.required(), rules.cpf()] : [], email: [rules.email()] },
  )
  const mutation = useMutationToast((v) => (isNew ? createSuperAdmin(v) : updateSuperAdmin(user.id, v)), {
    success: isNew ? 'Super admin criado — senha inicial: 6 primeiros dígitos do CPF' : 'Usuário atualizado',
    invalidate: [['super-admins']],
    onSuccess: onClose,
  })
  const submit = handleSubmit((v) => mutation.mutate(v))

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Novo usuário do SaaS' : 'Editar usuário do SaaS'}
      size="sm"
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
        <FormGrid columns={1}>
          <Input label="Nome" required {...field('nome')} />
          <Input label="CPF (login)" required={isNew} disabled={!isNew} inputMode="numeric" {...field('cpf', { mask: 'cpf' })} />
          <Input label="E-mail" type="email" {...field('email')} />
          <Select
            label="Papel"
            options={SUPER_ROLES.map((r) => ({ value: r.value, label: r.label }))}
            hint={SUPER_ROLES.find((r) => r.value === values.papel)?.description}
            {...field('papel')}
          />
        </FormGrid>
      </form>
    </Modal>
  )
}

export default function Usuarios() {
  const { user: me } = useAuth()
  const [editing, setEditing] = useState(null)
  const [confirm, confirmDialog] = useConfirm()
  const query = useQuery({ queryKey: ['super-admins'], queryFn: listSuperAdmins })

  const removeMutation = useMutationToast(removeSuperAdmin, { success: 'Acesso de super admin removido', invalidate: [['super-admins']] })
  const resetMutation = useMutationToast(resetSuperAdminPassword, { success: 'Senha redefinida para o padrão' })

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      {confirmDialog}
      <PageHeader
        title="Usuários"
        subtitle="Equipe do SaaS: Administrador (tudo), Suporte (academias, logs, chamados e avisos) e Financeiro (faturas e planos)"
        actions={
          <Button icon={Plus} onClick={() => setEditing({})}>
            Novo usuário
          </Button>
        }
      />
      <DataTable
        loading={query.isPending}
        data={query.data ?? []}
        searchKeys={['nome', 'cpf', 'email']}
        columns={[
          {
            key: 'nome',
            header: 'Nome',
            render: (u) => (
              <>
                <strong>{u.nome}</strong> {u.user_id === me?.id && <Badge tone="info">Você</Badge>}
              </>
            ),
          },
          {
            key: 'papel',
            header: 'Papel',
            render: (u) => <Badge tone={u.papel === 'admin' ? 'info' : u.papel === 'financeiro' ? 'success' : 'warning'}>{SUPER_ROLES.find((r) => r.value === u.papel)?.label ?? u.papel}</Badge>,
          },
          { key: 'cpf', header: 'CPF', render: (u) => formatCPF(u.cpf) },
          { key: 'email', header: 'E-mail', render: (u) => u.email ?? '—' },
          { key: 'created_at', header: 'Desde', render: (u) => formatDate(u.created_at) },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (u) => (
              <div style={{ display: 'inline-flex', gap: 4 }}>
                <Tooltip content="Editar">
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(u)} aria-label="Editar" />
                </Tooltip>
                <Tooltip content="Resetar senha">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={RotateCcw}
                    aria-label="Resetar senha"
                    onClick={async () => {
                      if (await confirm({ title: 'Resetar senha', message: `A senha de ${u.nome} voltará aos 6 primeiros dígitos do CPF.` })) {
                        resetMutation.mutate(u.id)
                      }
                    }}
                  />
                </Tooltip>
                {u.user_id !== me?.id && (
                  <Tooltip content="Remover acesso">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      aria-label="Remover"
                      onClick={async () => {
                        if (await confirm({ title: 'Remover super admin', message: `${u.nome} perderá o acesso ao painel do SaaS.`, danger: true, confirmLabel: 'Remover' })) {
                          removeMutation.mutate(u.id)
                        }
                      }}
                    />
                  </Tooltip>
                )}
              </div>
            ),
          },
        ]}
      />
      {editing && <UserModal user={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </>
  )
}
