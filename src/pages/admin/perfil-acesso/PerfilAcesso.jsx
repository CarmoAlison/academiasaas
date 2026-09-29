import { useQuery } from '@tanstack/react-query'
import { Grid3x3, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, DataTable, FormGrid, Input, Modal, PageHeader, Tabs, Textarea, Tooltip, useConfirm } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { createRole, listRoles, removeRole, updateRole } from '../../../services/roleService'
import { rules } from '../../../utils/validators'
import EquipeTab from './EquipeTab'

function RoleModal({ role, academyId, onClose, onCreated }) {
  const { field, handleSubmit } = useForm({ nome: role?.nome ?? '', descricao: role?.descricao ?? '' }, { nome: [rules.required()] })
  const mutation = useMutationToast((v) => (role ? updateRole(role.id, v) : createRole(academyId, v)), {
    success: role ? 'Perfil atualizado' : 'Perfil criado — agora defina as permissões',
    invalidate: [['roles', academyId]],
    onSuccess: (data) => {
      onClose()
      if (!role) onCreated?.(data.id)
    },
  })
  const submit = handleSubmit((v) => mutation.mutate(v))
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={role ? 'Editar perfil' : 'Novo perfil de acesso'}
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
          <Input label="Nome" required placeholder="Ex.: Financeiro, Coordenador" {...field('nome')} />
          <Textarea label="Descrição" rows={2} {...field('descricao')} />
        </FormGrid>
      </form>
    </Modal>
  )
}

function RolesTab() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(null)
  const [confirm, confirmDialog] = useConfirm()
  const query = useQuery({ queryKey: ['roles', academyId], queryFn: () => listRoles(academyId) })
  const removeMutation = useMutationToast(removeRole, { success: 'Perfil excluído', invalidate: [['roles', academyId]] })
  const manage = (id) => navigate(`/admin/perfil-acesso/gerenciar?perfil=${id}`)

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      {confirmDialog}
      <DataTable
        loading={query.isPending}
        data={query.data ?? []}
        searchKeys={['nome', 'descricao']}
        searchPlaceholder="Buscar perfil"
        actions={
          can('perfis.criar') && (
            <Button icon={Plus} onClick={() => setEditing({})}>
              Novo perfil
            </Button>
          )
        }
        onRowClick={(r) => manage(r.id)}
        columns={[
          {
            key: 'nome',
            header: 'Perfil',
            render: (r) => (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                <strong>{r.nome}</strong>
                {r.is_system && <Badge tone="info">Sistema</Badge>}
              </span>
            ),
          },
          { key: 'descricao', header: 'Descrição', render: (r) => r.descricao ?? '—' },
          {
            key: 'permissoes',
            header: 'Permissões',
            sortValue: (r) => r.permissionIds.length,
            render: (r) => (r.slug === 'admin' ? 'Todas' : r.slug === 'aluno' ? 'Área do aluno' : r.permissionIds.length),
          },
          { key: 'usuarios', header: 'Usuários', align: 'right' },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (r) => (
              <div style={{ display: 'inline-flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                <Tooltip content="Permissões">
                  <Button variant="ghost" size="sm" icon={Grid3x3} onClick={() => manage(r.id)} aria-label="Permissões" />
                </Tooltip>
                {!r.is_system && can('perfis.editar') && (
                  <Tooltip content="Renomear">
                    <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(r)} aria-label="Editar" />
                  </Tooltip>
                )}
                {!r.is_system && can('perfis.excluir') && (
                  <Tooltip content={r.usuarios ? 'Remova os usuários antes' : 'Excluir'}>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      aria-label="Excluir"
                      disabled={r.usuarios > 0}
                      onClick={async () => {
                        if (await confirm({ title: 'Excluir perfil', message: `Excluir o perfil ${r.nome}?`, danger: true, confirmLabel: 'Excluir' })) {
                          removeMutation.mutate(r.id)
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
      {editing && <RoleModal role={editing.id ? editing : null} academyId={academyId} onClose={() => setEditing(null)} onCreated={manage} />}
    </>
  )
}

export default function PerfilAcesso() {
  const { can } = usePermissions()
  const [params, setParams] = useSearchParams()
  const tabs = [
    can('perfis.ver') && { key: 'perfis', label: 'Perfis e permissões' },
    can('equipe.ver') && { key: 'equipe', label: 'Equipe' },
  ].filter(Boolean)
  const tab = tabs.find((t) => t.key === params.get('aba'))?.key ?? tabs[0]?.key

  return (
    <>
      <PageHeader title="Perfil de acesso" subtitle="Perfis, permissões e usuários da equipe" />
      <Tabs items={tabs} value={tab} onChange={(key) => setParams({ aba: key }, { replace: true })} />
      {tab === 'perfis' && <RolesTab />}
      {tab === 'equipe' && <EquipeTab />}
    </>
  )
}
