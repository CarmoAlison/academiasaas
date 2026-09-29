import { useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import { Button, Card, FormActions, FormGrid, FullRow, Input, PageHeader, Switch, Textarea, useConfirm } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { planService } from '../../../services/catalogServices'
import { rules } from '../../../utils/validators'

const EMPTY = { nome: '', descricao: '', valor: '', duracao_meses: '1', ativo: true }

export default function PlanoForm() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const [confirm, confirmDialog] = useConfirm()
  const readOnly = !isNew && !can('planos.editar')

  const plan = useQuery({ queryKey: ['plan', id], queryFn: () => planService.get(id), enabled: !isNew })
  const { field, values, setValue, handleSubmit, reset } = useForm(EMPTY, {
    nome: [rules.required()],
    valor: [rules.required(), rules.min(0)],
    duracao_meses: [rules.required(), rules.min(1)],
  })

  useEffect(() => {
    const p = plan.data
    if (p) reset({ nome: p.nome, descricao: p.descricao ?? '', valor: String(p.valor), duracao_meses: String(p.duracao_meses), ativo: p.ativo })
  }, [plan.data, reset])

  const saveMutation = useMutationToast(
    (v) => {
      const payload = { nome: v.nome, descricao: v.descricao || null, valor: Number(v.valor), duracao_meses: Number(v.duracao_meses), ativo: v.ativo }
      return isNew ? planService.create(academyId, payload) : planService.update(id, payload)
    },
    { success: isNew ? 'Plano criado' : 'Plano atualizado', invalidate: [['plans', academyId], ['plan', id]], onSuccess: () => navigate('/admin/planos') },
  )
  const removeMutation = useMutationToast(() => planService.remove(id), {
    success: 'Plano excluído',
    invalidate: [['plans', academyId]],
    onSuccess: () => navigate('/admin/planos', { replace: true }),
  })

  if (!isNew && plan.isPending) return <PageLoader />
  if (!isNew && plan.isError) return <QueryError error={plan.error} onRetry={plan.refetch} />
  const title = isNew ? 'Novo plano' : plan.data.nome

  return (
    <>
      {confirmDialog}
      <PageHeader
        title={title}
        breadcrumb={[{ label: 'Planos', to: '/admin/planos' }, { label: isNew ? 'Novo' : title }]}
        actions={
          !isNew &&
          can('planos.excluir') && (
            <Button
              variant="outline"
              icon={Trash2}
              onClick={async () => {
                if (await confirm({ title: 'Excluir plano', message: 'Alunos vinculados mantêm o plano atual, mas ele não poderá ser escolhido em novas matrículas.', danger: true, confirmLabel: 'Excluir' })) {
                  removeMutation.mutate()
                }
              }}
            >
              Excluir
            </Button>
          )
        }
      />
      <Card>
        <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} noValidate>
          <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
            <FormGrid columns={3}>
              <Input label="Nome" required placeholder="Ex.: Mensal, Trimestral" {...field('nome')} />
              <Input label="Valor total (R$)" type="number" step="0.01" min="0" required {...field('valor')} />
              <Input label="Duração (meses)" type="number" min="1" required {...field('duracao_meses')} />
              <FullRow>
                <Textarea label="Descrição" placeholder="O que está incluso no plano" {...field('descricao')} />
              </FullRow>
              <Switch label="Plano ativo (disponível para novas matrículas)" checked={values.ativo} onChange={(v) => setValue('ativo', v)} />
            </FormGrid>
          </fieldset>
          {!readOnly && (
            <div style={{ marginTop: 24 }}>
              <FormActions>
                <Button variant="outline" to="/admin/planos">
                  Cancelar
                </Button>
                <Button type="submit" loading={saveMutation.isPending}>
                  Salvar
                </Button>
              </FormActions>
            </div>
          )}
        </form>
      </Card>
    </>
  )
}
