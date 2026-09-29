import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import {
  Badge,
  Button,
  DataTable,
  FormGrid,
  FullRow,
  Input,
  Modal,
  PageHeader,
  Switch,
  Textarea,
  useConfirm,
} from '../../../components/ui'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { listSaasPlans, removeSaasPlan, saveSaasPlan } from '../../../services/saasService'
import { formatCurrency } from '../../../utils/formatters'
import { rules } from '../../../utils/validators'

const EMPTY = { nome: '', descricao: '', valor: '', limite_alunos: '', ativo: true }

function PlanModal({ plan, onClose }) {
  const { field, values, setValue, handleSubmit } = useForm(
    plan ? { ...EMPTY, ...plan, descricao: plan.descricao ?? '', limite_alunos: plan.limite_alunos ?? '' } : EMPTY,
    { nome: [rules.required()], valor: [rules.required(), rules.min(0)] },
  )
  const mutation = useMutationToast((v) => saveSaasPlan(plan?.id, v), {
    success: plan ? 'Plano atualizado' : 'Plano criado',
    invalidate: [['saas-plans']],
    onSuccess: onClose,
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={plan ? 'Editar plano SaaS' : 'Novo plano SaaS'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit((v) => mutation.mutate(v))} loading={mutation.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
        <FormGrid columns={2}>
          <FullRow>
            <Input label="Nome" required {...field('nome')} />
          </FullRow>
          <Input label="Valor mensal (R$)" type="number" step="0.01" min="0" required {...field('valor')} />
          <Input label="Limite de alunos" type="number" min="0" hint="Vazio = ilimitado" {...field('limite_alunos')} />
          <FullRow>
            <Textarea label="Descrição" {...field('descricao')} />
          </FullRow>
          <Switch label="Plano ativo (disponível para novas academias)" checked={values.ativo} onChange={(v) => setValue('ativo', v)} />
        </FormGrid>
      </form>
    </Modal>
  )
}

export default function PlanosSaas() {
  const [editing, setEditing] = useState(null) // null = fechado, {} = novo
  const [confirm, confirmDialog] = useConfirm()
  const query = useQuery({ queryKey: ['saas-plans'], queryFn: listSaasPlans })
  const removeMutation = useMutationToast(removeSaasPlan, { success: 'Plano removido', invalidate: [['saas-plans']] })

  const onRemove = async (plan) => {
    if (await confirm({ title: 'Remover plano', message: `Remover o plano ${plan.nome}? Academias já vinculadas mantêm o plano.`, danger: true, confirmLabel: 'Remover' })) {
      removeMutation.mutate(plan.id)
    }
  }

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      <PageHeader
        title="Planos SaaS"
        subtitle="Planos que você vende para as academias"
        actions={
          <Button icon={Plus} onClick={() => setEditing({})}>
            Novo plano
          </Button>
        }
      />
      {confirmDialog}
      <DataTable
        loading={query.isPending}
        data={query.data ?? []}
        searchKeys={['nome', 'descricao']}
        columns={[
          { key: 'nome', header: 'Plano', render: (p) => <strong>{p.nome}</strong> },
          { key: 'descricao', header: 'Descrição', render: (p) => p.descricao ?? '—' },
          { key: 'valor', header: 'Valor/mês', align: 'right', render: (p) => formatCurrency(p.valor) },
          { key: 'limite_alunos', header: 'Limite de alunos', align: 'right', render: (p) => p.limite_alunos ?? 'Ilimitado' },
          { key: 'ativo', header: 'Status', render: (p) => <Badge tone={p.ativo ? 'success' : 'neutral'}>{p.ativo ? 'Ativo' : 'Inativo'}</Badge> },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (p) => (
              <div style={{ display: 'inline-flex', gap: 4 }}>
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(p)} aria-label="Editar" />
                <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onRemove(p)} aria-label="Remover" />
              </div>
            ),
          },
        ]}
        emptyTitle="Nenhum plano cadastrado"
      />
      {editing && <PlanModal plan={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </>
  )
}
