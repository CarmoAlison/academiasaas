import { useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import { Button, Card, FormActions, FormGrid, FullRow, Input, PageHeader, Select, Switch, useConfirm } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { unitService } from '../../../services/catalogServices'
import { UFS } from '../../../utils/constants'
import { formatCEP, formatPhone, onlyDigits } from '../../../utils/formatters'
import { rules } from '../../../utils/validators'

const EMPTY = { nome: '', cep: '', endereco: '', cidade: '', estado: '', telefone: '', ativo: true }

export default function UnidadeForm() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const [confirm, confirmDialog] = useConfirm()
  const readOnly = !isNew && !can('unidades.editar')

  const unit = useQuery({ queryKey: ['unit', id], queryFn: () => unitService.get(id), enabled: !isNew })
  const { field, values, setValue, handleSubmit, reset } = useForm(EMPTY, { nome: [rules.required()] })

  useEffect(() => {
    const u = unit.data
    if (u) {
      reset({
        nome: u.nome,
        cep: formatCEP(u.cep ?? ''),
        endereco: u.endereco ?? '',
        cidade: u.cidade ?? '',
        estado: u.estado ?? '',
        telefone: formatPhone(u.telefone ?? ''),
        ativo: u.ativo,
      })
    }
  }, [unit.data, reset])

  const saveMutation = useMutationToast(
    (v) => {
      const payload = {
        nome: v.nome,
        cep: onlyDigits(v.cep) || null,
        endereco: v.endereco || null,
        cidade: v.cidade || null,
        estado: v.estado || null,
        telefone: onlyDigits(v.telefone) || null,
        ativo: v.ativo,
      }
      return isNew ? unitService.create(academyId, payload) : unitService.update(id, payload)
    },
    { success: isNew ? 'Unidade criada' : 'Unidade atualizada', invalidate: [['units', academyId], ['unit', id]], onSuccess: () => navigate('/admin/unidades') },
  )
  const removeMutation = useMutationToast(() => unitService.remove(id), {
    success: 'Unidade excluída',
    invalidate: [['units', academyId]],
    onSuccess: () => navigate('/admin/unidades', { replace: true }),
  })

  if (!isNew && unit.isPending) return <PageLoader />
  if (!isNew && unit.isError) return <QueryError error={unit.error} onRetry={unit.refetch} />
  const title = isNew ? 'Nova unidade' : unit.data.nome

  return (
    <>
      {confirmDialog}
      <PageHeader
        title={title}
        breadcrumb={[{ label: 'Unidades', to: '/admin/unidades' }, { label: isNew ? 'Nova' : title }]}
        actions={
          !isNew &&
          can('unidades.excluir') && (
            <Button
              variant="outline"
              icon={Trash2}
              onClick={async () => {
                if (await confirm({ title: 'Excluir unidade', message: `Excluir ${title}?`, danger: true, confirmLabel: 'Excluir' })) {
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
            <FormGrid columns={4}>
              <FullRow>
                <Input label="Nome da unidade" required {...field('nome')} />
              </FullRow>
              <Input label="CEP" inputMode="numeric" {...field('cep', { mask: 'cep' })} />
              <FullRow>
                <Input label="Endereço" placeholder="Rua, número, bairro" {...field('endereco')} />
              </FullRow>
              <Input label="Cidade" {...field('cidade')} />
              <Select label="UF" placeholder="—" options={UFS.map((u) => ({ value: u, label: u }))} {...field('estado')} />
              <Input label="Telefone" inputMode="tel" {...field('telefone', { mask: 'phone' })} />
              <FullRow>
                <Switch label="Unidade ativa" checked={values.ativo} onChange={(v) => setValue('ativo', v)} />
              </FullRow>
            </FormGrid>
          </fieldset>
          {!readOnly && (
            <div style={{ marginTop: 24 }}>
              <FormActions>
                <Button variant="outline" to="/admin/unidades">
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
