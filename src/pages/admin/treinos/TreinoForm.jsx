import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import {
  Button,
  Card,
  EmptyState,
  FormActions,
  FormGrid,
  FormSection,
  Input,
  PageHeader,
  Select,
  Switch,
  useConfirm,
} from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { exerciseService } from '../../../services/catalogServices'
import { listStaffOptions } from '../../../services/roleService'
import { listStudentOptions } from '../../../services/studentService'
import { getWorkout, removeWorkout, saveWorkout } from '../../../services/workoutService'
import { addDays, toISODate } from '../../../utils/formatters'
import { rules } from '../../../utils/validators'
import { ExerciseModal } from './ExerciciosTab'
import styles from './TreinoForm.module.css'

const newItem = () => ({ key: Math.random().toString(36).slice(2), exercise_id: '', series: '3', repeticoes: '10-12', carga: '', descanso: '60s' })

export default function TreinoForm() {
  const { id } = useParams()
  const isNew = !id
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { academyId, membership } = useTenant()
  const { can } = usePermissions()
  const [confirm, confirmDialog] = useConfirm()
  const [items, setItems] = useState(() => [newItem()])
  const [itemsError, setItemsError] = useState('')
  const [exerciseModal, setExerciseModal] = useState(null) // índice do item que receberá o novo exercício
  const readOnly = !isNew && !can('treinos.editar')

  const workout = useQuery({ queryKey: ['workout', id], queryFn: () => getWorkout(id), enabled: !isNew })
  const students = useQuery({ queryKey: ['student-options', academyId], queryFn: () => listStudentOptions(academyId) })
  const staff = useQuery({ queryKey: ['staff-options', academyId], queryFn: () => listStaffOptions(academyId) })
  const exercises = useQuery({ queryKey: ['exercises', academyId], queryFn: () => exerciseService.list(academyId) })

  const { field, handleSubmit, reset, values, setValue } = useForm(
    {
      student_id: params.get('aluno') ?? '',
      professor_id: membership?.profile?.id ?? '',
      nome: '',
      objetivo: '',
      data_inicio: toISODate(),
      data_fim: toISODate(addDays(new Date(), 60)),
      ativo: true,
    },
    {
      student_id: [rules.required('Selecione o aluno')],
      nome: [rules.required()],
      data_fim: [(v, all) => (v && all.data_inicio && v < all.data_inicio ? 'Data final antes da inicial' : undefined)],
    },
  )

  useEffect(() => {
    const w = workout.data
    if (!w) return
    reset({
      student_id: w.student_id,
      professor_id: w.professor_id ?? '',
      nome: w.nome,
      objetivo: w.objetivo ?? '',
      data_inicio: w.data_inicio ?? '',
      data_fim: w.data_fim ?? '',
      ativo: w.ativo,
    })
    setItems(
      w.items.map((it) => ({
        key: it.id,
        exercise_id: it.exercise_id,
        series: it.series ?? '',
        repeticoes: it.repeticoes ?? '',
        carga: it.carga ?? '',
        descanso: it.descanso ?? '',
      })),
    )
  }, [workout.data, reset])

  const saveMutation = useMutationToast((v) => saveWorkout(academyId, id, v, items), {
    success: isNew ? 'Treino criado' : 'Treino atualizado',
    invalidate: [['workouts', academyId], ['workout', id]],
    onSuccess: (newId) => isNew && navigate(`/admin/treinos/${newId}`, { replace: true }),
  })
  const removeMutation = useMutationToast(() => removeWorkout(id), {
    success: 'Treino excluído',
    invalidate: [['workouts', academyId]],
    onSuccess: () => navigate('/admin/treinos', { replace: true }),
  })

  const updateItem = (index, patch) => setItems((list) => list.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  const move = (index, dir) =>
    setItems((list) => {
      const next = [...list]
      const target = index + dir
      if (target < 0 || target >= next.length) return list
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  const onSubmit = handleSubmit((v) => {
    const filled = items.filter((it) => it.exercise_id)
    if (!filled.length) {
      setItemsError('Adicione ao menos um exercício')
      return
    }
    setItemsError('')
    saveMutation.mutate(v)
  })

  if (!isNew && workout.isPending) return <PageLoader />
  if (!isNew && workout.isError) return <QueryError error={workout.error} onRetry={workout.refetch} />

  const exerciseOptions = (exercises.data ?? []).map((e) => ({ value: e.id, label: e.grupo_muscular ? `${e.nome} (${e.grupo_muscular})` : e.nome }))
  const title = isNew ? 'Novo treino' : workout.data.nome

  return (
    <>
      {confirmDialog}
      <PageHeader
        title={title}
        breadcrumb={[{ label: 'Treinos', to: '/admin/treinos' }, { label: isNew ? 'Novo' : title }]}
        actions={
          !isNew &&
          can('treinos.excluir') && (
            <Button
              variant="outline"
              icon={Trash2}
              onClick={async () => {
                if (await confirm({ title: 'Excluir treino', message: 'O treino deixará de aparecer para o aluno.', danger: true, confirmLabel: 'Excluir' })) {
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
        <form onSubmit={onSubmit} noValidate>
          <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
            <FormSection title="Dados do treino">
              <FormGrid columns={3}>
                <Select label="Aluno" required placeholder="Selecione o aluno" options={students.data ?? []} disabled={!isNew} {...field('student_id')} />
                <Input label="Nome do treino" required placeholder="Ex.: Treino A — Superiores" {...field('nome')} />
                <Input label="Objetivo" placeholder="Hipertrofia, emagrecimento..." {...field('objetivo')} />
                <Select label="Professor" placeholder="Não definido" options={staff.data ?? []} {...field('professor_id')} />
                <Input label="Início" type="date" {...field('data_inicio')} />
                <Input label="Fim" type="date" {...field('data_fim')} />
              </FormGrid>
              <div style={{ marginTop: 16 }}>
                <Switch label="Treino ativo (visível para o aluno)" checked={values.ativo} onChange={(v) => setValue('ativo', v)} />
              </div>
            </FormSection>

            <FormSection title="Exercícios" description="Defina séries, repetições, carga e descanso. Use as setas para ordenar.">
              {itemsError && <p className={styles.error}>{itemsError}</p>}
              {items.length === 0 ? (
                <EmptyState compact title="Nenhum exercício" description="Adicione exercícios ao treino." />
              ) : (
                <div className={styles.items}>
                  <div className={`${styles.row} ${styles.head}`}>
                    <span>#</span>
                    <span>Exercício</span>
                    <span>Séries</span>
                    <span>Repetições</span>
                    <span>Carga</span>
                    <span>Descanso</span>
                    <span />
                  </div>
                  {items.map((it, index) => (
                    <div key={it.key} className={styles.row}>
                      <span className={styles.order}>{index + 1}</span>
                      <Select
                        aria-label="Exercício"
                        placeholder="Selecione"
                        options={exerciseOptions}
                        value={it.exercise_id}
                        onChange={(e) => updateItem(index, { exercise_id: e.target.value })}
                      />
                      <Input aria-label="Séries" type="number" min="1" value={it.series} onChange={(e) => updateItem(index, { series: e.target.value })} />
                      <Input aria-label="Repetições" value={it.repeticoes} onChange={(e) => updateItem(index, { repeticoes: e.target.value })} />
                      <Input aria-label="Carga" placeholder="kg" value={it.carga} onChange={(e) => updateItem(index, { carga: e.target.value })} />
                      <Input aria-label="Descanso" value={it.descanso} onChange={(e) => updateItem(index, { descanso: e.target.value })} />
                      <div className={styles.rowActions}>
                        <Button variant="ghost" size="sm" icon={ArrowUp} onClick={() => move(index, -1)} disabled={index === 0} aria-label="Subir" />
                        <Button variant="ghost" size="sm" icon={ArrowDown} onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label="Descer" />
                        <Button variant="ghost" size="sm" icon={X} onClick={() => setItems((l) => l.filter((_, i) => i !== index))} aria-label="Remover" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!readOnly && (
                <div className={styles.addBar}>
                  <Button variant="secondary" icon={Plus} onClick={() => setItems((l) => [...l, newItem()])}>
                    Adicionar exercício
                  </Button>
                  <Button variant="ghost" icon={Plus} onClick={() => setExerciseModal(items.length)}>
                    Cadastrar novo exercício na biblioteca
                  </Button>
                </div>
              )}
            </FormSection>
          </fieldset>

          {!readOnly && (
            <FormActions>
              <Button variant="outline" to="/admin/treinos">
                Cancelar
              </Button>
              <Button type="submit" loading={saveMutation.isPending}>
                {isNew ? 'Criar treino' : 'Salvar alterações'}
              </Button>
            </FormActions>
          )}
        </form>
      </Card>

      {exerciseModal !== null && (
        <ExerciseModal
          onClose={() => setExerciseModal(null)}
          onSaved={(exerciseId) => setItems((l) => [...l, { ...newItem(), exercise_id: exerciseId }])}
        />
      )}
    </>
  )
}
