import { useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import {
  Button,
  Card,
  Checkbox,
  FormActions,
  FormGrid,
  FormSection,
  FullRow,
  Input,
  PageHeader,
  Select,
  Switch,
  Textarea,
  useConfirm,
} from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { unitService } from '../../../services/catalogServices'
import { classService } from '../../../services/classService'
import { listStaffOptions } from '../../../services/roleService'
import { WEEKDAYS } from '../../../utils/constants'
import { formatTime } from '../../../utils/formatters'
import { rules } from '../../../utils/validators'

const EMPTY = { nome: '', descricao: '', professor_id: '', unit_id: '', horario: '07:00', duracao_min: '60', capacidade: '20', dias_semana: [], ativo: true }

export default function AulaForm() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const [confirm, confirmDialog] = useConfirm()
  const readOnly = !isNew && !can('aulas.editar')

  const aula = useQuery({ queryKey: ['class', id], queryFn: () => classService.get(id), enabled: !isNew })
  const units = useQuery({ queryKey: ['units', academyId], queryFn: () => unitService.list(academyId) })
  const staff = useQuery({ queryKey: ['staff-options', academyId], queryFn: () => listStaffOptions(academyId) })

  const { field, values, setValue, errors, handleSubmit, reset } = useForm(EMPTY, {
    nome: [rules.required()],
    horario: [rules.required()],
    capacidade: [rules.required(), rules.min(1)],
    dias_semana: [rules.required('Selecione ao menos um dia')],
  })

  useEffect(() => {
    const c = aula.data
    if (!c) return
    reset({
      nome: c.nome,
      descricao: c.descricao ?? '',
      professor_id: c.professor_id ?? '',
      unit_id: c.unit_id ?? '',
      horario: formatTime(c.horario),
      duracao_min: String(c.duracao_min),
      capacidade: String(c.capacidade),
      dias_semana: c.dias_semana,
      ativo: c.ativo,
    })
  }, [aula.data, reset])

  useEffect(() => {
    if (isNew && !values.unit_id && units.data?.length === 1) setValue('unit_id', units.data[0].id)
  }, [isNew, units.data, values.unit_id, setValue])

  const saveMutation = useMutationToast(
    (v) => {
      const payload = {
        nome: v.nome,
        descricao: v.descricao || null,
        professor_id: v.professor_id || null,
        unit_id: v.unit_id || null,
        horario: v.horario,
        duracao_min: Number(v.duracao_min) || 60,
        capacidade: Number(v.capacidade),
        dias_semana: [...v.dias_semana].sort(),
        ativo: v.ativo,
      }
      return isNew ? classService.create(academyId, payload) : classService.update(id, payload)
    },
    {
      success: isNew ? 'Aula criada' : 'Aula atualizada',
      invalidate: [['classes', academyId], ['class', id], ['admin-dashboard', academyId]],
      onSuccess: () => navigate('/admin/aulas'),
    },
  )
  const removeMutation = useMutationToast(() => classService.remove(id), {
    success: 'Aula excluída',
    invalidate: [['classes', academyId]],
    onSuccess: () => navigate('/admin/aulas', { replace: true }),
  })

  if (!isNew && aula.isPending) return <PageLoader />
  if (!isNew && aula.isError) return <QueryError error={aula.error} onRetry={aula.refetch} />

  const toggleDay = (day, checked) =>
    setValue('dias_semana', checked ? [...values.dias_semana, day] : values.dias_semana.filter((d) => d !== day))

  const title = isNew ? 'Nova aula' : aula.data.nome

  return (
    <>
      {confirmDialog}
      <PageHeader
        title={title}
        breadcrumb={[{ label: 'Aulas', to: '/admin/aulas' }, { label: isNew ? 'Nova' : title }]}
        actions={
          !isNew &&
          can('aulas.excluir') && (
            <Button
              variant="outline"
              icon={Trash2}
              onClick={async () => {
                if (await confirm({ title: 'Excluir aula', message: 'A aula sairá da agenda dos alunos.', danger: true, confirmLabel: 'Excluir' })) {
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
            <FormSection title="Informações">
              <FormGrid columns={2}>
                <Input label="Nome da aula" required placeholder="Ex.: Spinning" {...field('nome')} />
                <Select label="Professor" placeholder="Não definido" options={staff.data ?? []} {...field('professor_id')} />
                <Select label="Unidade" placeholder="Selecione" options={(units.data ?? []).map((u) => ({ value: u.id, label: u.nome }))} {...field('unit_id')} />
                <FullRow>
                  <Textarea label="Descrição" rows={2} {...field('descricao')} />
                </FullRow>
              </FormGrid>
            </FormSection>

            <FormSection title="Horário e recorrência">
              <FormGrid columns={3}>
                <Input label="Horário" type="time" required {...field('horario')} />
                <Input label="Duração (min)" type="number" min="10" step="5" {...field('duracao_min')} />
                <Input label="Capacidade" type="number" min="1" required {...field('capacidade')} />
              </FormGrid>
              <div style={{ marginTop: 16 }}>
                <span style={{ fontWeight: 500, display: 'block', marginBottom: 8 }}>
                  Dias da semana <span style={{ color: 'var(--color-danger)' }}>*</span>
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  {WEEKDAYS.map((d) => (
                    <Checkbox
                      key={d.value}
                      label={d.label}
                      checked={values.dias_semana.includes(d.value)}
                      onChange={(checked) => toggleDay(d.value, checked)}
                    />
                  ))}
                </div>
                {errors.dias_semana && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginTop: 6 }}>{errors.dias_semana}</p>}
              </div>
              <div style={{ marginTop: 20 }}>
                <Switch label="Aula ativa (aparece na agenda)" checked={values.ativo} onChange={(v) => setValue('ativo', v)} />
              </div>
            </FormSection>
          </fieldset>

          {!readOnly && (
            <FormActions>
              <Button variant="outline" to="/admin/aulas">
                Cancelar
              </Button>
              <Button type="submit" loading={saveMutation.isPending}>
                {isNew ? 'Criar aula' : 'Salvar alterações'}
              </Button>
            </FormActions>
          )}
        </form>
      </Card>
    </>
  )
}
