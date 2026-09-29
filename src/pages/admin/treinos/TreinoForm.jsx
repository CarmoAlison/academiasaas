import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Plus, Save, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
import { WEEKDAYS } from '../../../utils/constants'
import { addDays, toISODate } from '../../../utils/formatters'
import { rules } from '../../../utils/validators'
import { dayLabel, dayShort, exercisesLabel, sortDays, WEEK_ORDER, WEEK_PRESETS } from '../../../utils/workoutDays'
import { ExerciseModal } from './ExerciciosTab'
import styles from './TreinoForm.module.css'

const uid = () => Math.random().toString(36).slice(2)
const newItem = () => ({ key: uid(), exercise_id: '', series: '3', repeticoes: '10-12', carga: '', descanso: '60s' })
const newDay = (dia) => ({ key: uid(), id: null, dia_semana: dia, nome: '', items: [newItem()] })
const hasContent = (day) => Boolean(day.nome) || day.items.some((it) => it.exercise_id)
const filledCount = (day) => day.items.filter((it) => it.exercise_id).length

export default function TreinoForm() {
  const { id } = useParams()
  const isNew = !id
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { academyId, membership } = useTenant()
  const { can } = usePermissions()
  const [confirm, confirmDialog] = useConfirm()
  const readOnly = !isNew && !can('treinos.editar')

  // Semana: um item por dia de treino, cada um com seus exercícios
  const [days, setDays] = useState(() => WEEK_PRESETS[0].dias.map(newDay))
  const [activeKey, setActiveKey] = useState(null)
  const [invalidKeys, setInvalidKeys] = useState([])
  const [daysError, setDaysError] = useState('')
  const [exerciseModal, setExerciseModal] = useState(false)

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
      nome: [rules.required('Dê um nome à ficha')],
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
    setDays(
      w.days.map((d) => ({
        key: d.id,
        id: d.id,
        dia_semana: d.dia_semana,
        nome: d.nome ?? '',
        items: d.items.length
          ? d.items.map((it) => ({
              key: it.id,
              exercise_id: it.exercise_id,
              series: it.series ?? '',
              repeticoes: it.repeticoes ?? '',
              carga: it.carga ?? '',
              descanso: it.descanso ?? '',
            }))
          : [newItem()],
      })),
    )
  }, [workout.data, reset])

  const sorted = useMemo(() => sortDays(days), [days])
  const active = sorted.find((d) => d.key === activeKey) ?? sorted[0]
  const activeIndex = active ? sorted.indexOf(active) : -1
  const usedDias = new Set(days.map((d) => d.dia_semana).filter((d) => d != null))
  const totalExercises = days.reduce((acc, d) => acc + filledCount(d), 0)

  const saveMutation = useMutationToast(
    (v) => saveWorkout(academyId, id, v, sortDays(days)),
    {
      success: isNew ? 'Treino da semana cadastrado' : 'Treino da semana atualizado',
      invalidate: [['workouts', academyId], ['workout', id]],
      onSuccess: (newId) => isNew && navigate(`/admin/treinos/${newId}`, { replace: true }),
    },
  )
  const removeMutation = useMutationToast(() => removeWorkout(id), {
    success: 'Treino excluído',
    invalidate: [['workouts', academyId]],
    onSuccess: () => navigate('/admin/treinos', { replace: true }),
  })

  // ---- Dias -------------------------------------------------------------
  const updateDay = (key, patch) => setDays((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  const updateItems = (key, fn) => setDays((list) => list.map((d) => (d.key === key ? { ...d, items: fn(d.items) } : d)))

  const toggleDia = async (dia) => {
    const existing = days.find((d) => d.dia_semana === dia)
    if (!existing) {
      const day = newDay(dia)
      setDays((list) => [...list, day])
      setActiveKey(day.key)
      return
    }
    if (hasContent(existing)) {
      const ok = await confirm({
        title: `Remover ${WEEKDAYS[dia].label}?`,
        message: 'Os exercícios cadastrados neste dia serão descartados ao salvar.',
        danger: true,
        confirmLabel: 'Remover dia',
      })
      if (!ok) return
    }
    setDays((list) => list.filter((d) => d.key !== existing.key))
  }

  const applyPreset = async (preset) => {
    const removed = days.filter((d) => !preset.dias.includes(d.dia_semana))
    if (removed.some(hasContent)) {
      const ok = await confirm({
        title: `Usar "${preset.label}"?`,
        message: `Serão removidos: ${removed.map((d) => dayLabel(d.dia_semana)).join(', ')}. Os dias em comum mantêm os exercícios.`,
        confirmLabel: 'Aplicar',
      })
      if (!ok) return
    }
    setDays((list) => [
      ...list.filter((d) => preset.dias.includes(d.dia_semana)),
      ...preset.dias.filter((dia) => !list.some((d) => d.dia_semana === dia)).map(newDay),
    ])
    setActiveKey(null)
  }

  const copyFrom = (sourceKey) => {
    const source = days.find((d) => d.key === sourceKey)
    if (!source || !active) return
    updateItems(active.key, () => source.items.filter((it) => it.exercise_id).map((it) => ({ ...it, key: uid() })))
    if (!active.nome && source.nome) updateDay(active.key, { nome: source.nome })
  }

  const moveItem = (index, dir) =>
    updateItems(active.key, (items) => {
      const next = [...items]
      const target = index + dir
      if (target < 0 || target >= next.length) return items
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  // ---- Salvar (um lançamento só) -------------------------------------------
  const onSubmit = handleSubmit((v) => {
    if (!days.length) {
      setDaysError('Escolha ao menos um dia de treino')
      return
    }
    const invalid = sorted.filter((d) => filledCount(d) === 0)
    if (invalid.length) {
      setInvalidKeys(invalid.map((d) => d.key))
      setDaysError(`Adicione exercícios em: ${invalid.map((d) => dayShort(d.dia_semana)).join(', ')}`)
      setActiveKey(invalid[0].key)
      return
    }
    setInvalidKeys([])
    setDaysError('')
    saveMutation.mutate(v)
  })

  if (!isNew && workout.isPending) return <PageLoader />
  if (!isNew && workout.isError) return <QueryError error={workout.error} onRetry={workout.refetch} />

  const exerciseOptions = (exercises.data ?? []).map((e) => ({ value: e.id, label: e.grupo_muscular ? `${e.nome} (${e.grupo_muscular})` : e.nome }))
  const title = isNew ? 'Novo treino da semana' : workout.data.nome

  return (
    <>
      {confirmDialog}
      <PageHeader
        title={title}
        breadcrumb={[{ label: 'Treinos', to: '/admin/treinos' }, { label: isNew ? 'Novo' : workout.data.nome }]}
        actions={
          !isNew &&
          can('treinos.excluir') && (
            <Button
              variant="outline"
              icon={Trash2}
              onClick={async () => {
                if (await confirm({ title: 'Excluir treino', message: 'A ficha deixará de aparecer para o aluno.', danger: true, confirmLabel: 'Excluir' })) {
                  removeMutation.mutate()
                }
              }}
            >
              Excluir
            </Button>
          )
        }
      />

      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={readOnly} className={styles.fieldset}>
          <Card>
            <FormSection title="Dados do treino">
              <FormGrid columns={3}>
                <Select label="Aluno" required placeholder="Selecione o aluno" options={students.data ?? []} disabled={!isNew} {...field('student_id')} />
                <Input label="Nome da ficha" required placeholder="Ex.: Hipertrofia — Outubro" {...field('nome')} />
                <Input label="Objetivo" placeholder="Hipertrofia, emagrecimento..." {...field('objetivo')} />
                <Select label="Professor" placeholder="Não definido" options={staff.data ?? []} {...field('professor_id')} />
                <Input label="Início" type="date" {...field('data_inicio')} />
                <Input label="Fim" type="date" {...field('data_fim')} />
              </FormGrid>
              <div style={{ marginTop: 16 }}>
                <Switch label="Treino ativo (visível para o aluno)" checked={values.ativo} onChange={(v) => setValue('ativo', v)} />
              </div>
            </FormSection>

            <FormSection title="Dias de treino" description="Escolha os dias da semana do aluno. Cada dia tem seus próprios exercícios.">
              <div className={styles.presets}>
                {WEEK_PRESETS.map((p) => (
                  <Button key={p.key} variant="outline" size="sm" icon={CalendarDays} onClick={() => applyPreset(p)}>
                    {p.label}
                  </Button>
                ))}
              </div>
              <div className={styles.weekdays} role="group" aria-label="Dias da semana">
                {WEEK_ORDER.map((dia) => (
                  <button
                    key={dia}
                    type="button"
                    aria-pressed={usedDias.has(dia)}
                    className={`${styles.weekday} ${usedDias.has(dia) ? styles.weekdayOn : ''}`}
                    onClick={() => toggleDia(dia)}
                  >
                    {WEEKDAYS[dia].short}
                  </button>
                ))}
              </div>
              <p className={styles.summary}>
                {days.length} {days.length === 1 ? 'dia' : 'dias'} · {exercisesLabel(totalExercises)} no total
              </p>
              {daysError && (
                <p className={styles.error} role="alert">
                  <AlertCircle size={16} /> {daysError}
                </p>
              )}
            </FormSection>
          </Card>

          {!sorted.length ? (
            <Card>
              <EmptyState compact icon={CalendarDays} title="Nenhum dia selecionado" description="Use um atalho acima ou toque nos dias da semana." />
            </Card>
          ) : (
            <Card padding={false}>
              <div className={styles.tabs} role="tablist" aria-label="Dias do treino">
                {sorted.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    role="tab"
                    aria-selected={d.key === active?.key}
                    className={`${styles.tab} ${d.key === active?.key ? styles.tabActive : ''} ${invalidKeys.includes(d.key) && !filledCount(d) ? styles.tabInvalid : ''}`}
                    onClick={() => setActiveKey(d.key)}
                  >
                    <strong>{dayShort(d.dia_semana)}</strong>
                    <span>{d.nome || 'Sem foco'}</span>
                    <small>{filledCount(d)} exerc.</small>
                  </button>
                ))}
              </div>

              {active && (
                <div className={styles.dayEditor}>
                  <FormGrid columns={3}>
                    <Input
                      label={`Foco do treino — ${dayLabel(active.dia_semana)}`}
                      placeholder="Ex.: Peito e tríceps"
                      value={active.nome}
                      onChange={(e) => updateDay(active.key, { nome: e.target.value })}
                    />
                    <Select
                      label="Dia da semana"
                      value={active.dia_semana ?? ''}
                      onChange={(e) => updateDay(active.key, { dia_semana: e.target.value === '' ? null : Number(e.target.value) })}
                      options={[
                        ...WEEK_ORDER.filter((dia) => dia === active.dia_semana || !usedDias.has(dia)).map((dia) => ({
                          value: dia,
                          label: WEEKDAYS[dia].label,
                        })),
                        { value: '', label: 'Sem dia fixo' },
                      ]}
                    />
                    <Select
                      label="Copiar exercícios de"
                      placeholder="Escolha um dia…"
                      value=""
                      onChange={async (e) => {
                        const source = days.find((d) => d.key === e.target.value)
                        if (!source) return
                        if (filledCount(active) && !(await confirm({ title: 'Substituir exercícios?', message: `Os exercícios deste dia serão trocados pelos de ${dayLabel(source.dia_semana)}.`, confirmLabel: 'Copiar' }))) return
                        copyFrom(source.key)
                      }}
                      options={sorted
                        .filter((d) => d.key !== active.key && filledCount(d))
                        .map((d) => ({ value: d.key, label: `${dayLabel(d.dia_semana)}${d.nome ? ` — ${d.nome}` : ''}` }))}
                    />
                  </FormGrid>

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
                    {active.items.map((it, index) => (
                      <div key={it.key} className={styles.row}>
                        <span className={styles.order}>{index + 1}</span>
                        <Select
                          aria-label="Exercício"
                          placeholder="Selecione"
                          options={exerciseOptions}
                          value={it.exercise_id}
                          onChange={(e) => updateItems(active.key, (items) => items.map((x) => (x.key === it.key ? { ...x, exercise_id: e.target.value } : x)))}
                        />
                        {['series', 'repeticoes', 'carga', 'descanso'].map((f) => (
                          <Input
                            key={f}
                            aria-label={f}
                            type={f === 'series' ? 'number' : 'text'}
                            min={f === 'series' ? '1' : undefined}
                            placeholder={f === 'carga' ? 'kg' : undefined}
                            value={it[f]}
                            onChange={(e) => updateItems(active.key, (items) => items.map((x) => (x.key === it.key ? { ...x, [f]: e.target.value } : x)))}
                          />
                        ))}
                        <div className={styles.rowActions}>
                          <Button variant="ghost" size="sm" icon={ArrowUp} onClick={() => moveItem(index, -1)} disabled={index === 0} aria-label="Subir" />
                          <Button variant="ghost" size="sm" icon={ArrowDown} onClick={() => moveItem(index, 1)} disabled={index === active.items.length - 1} aria-label="Descer" />
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={X}
                            onClick={() => updateItems(active.key, (items) => (items.length > 1 ? items.filter((x) => x.key !== it.key) : [newItem()]))}
                            aria-label="Remover exercício"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {!readOnly && (
                    <div className={styles.addBar}>
                      <Button variant="secondary" icon={Plus} onClick={() => updateItems(active.key, (items) => [...items, newItem()])}>
                        Adicionar exercício
                      </Button>
                      <Button variant="ghost" icon={Plus} onClick={() => setExerciseModal(true)}>
                        Cadastrar exercício na biblioteca
                      </Button>
                    </div>
                  )}

                  <div className={styles.dayNav}>
                    <Button variant="ghost" size="sm" icon={ArrowLeft} disabled={activeIndex <= 0} onClick={() => setActiveKey(sorted[activeIndex - 1].key)}>
                      {activeIndex > 0 ? dayLabel(sorted[activeIndex - 1].dia_semana) : 'Anterior'}
                    </Button>
                    <span className="text-muted">
                      Dia {activeIndex + 1} de {sorted.length}
                    </span>
                    <Button variant="ghost" size="sm" disabled={activeIndex >= sorted.length - 1} onClick={() => setActiveKey(sorted[activeIndex + 1].key)}>
                      {activeIndex < sorted.length - 1 ? dayLabel(sorted[activeIndex + 1].dia_semana) : 'Próximo'} <ArrowRight size={15} />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </fieldset>

        {!readOnly && (
          <div className={styles.footer}>
            <FormActions>
              <Button variant="outline" to="/admin/treinos">
                Cancelar
              </Button>
              <Button type="submit" icon={Save} loading={saveMutation.isPending}>
                {isNew ? 'Salvar treino da semana' : 'Salvar alterações'}
              </Button>
            </FormActions>
          </div>
        )}
      </form>

      {exerciseModal && active && (
        <ExerciseModal
          onClose={() => setExerciseModal(false)}
          onSaved={(exerciseId) =>
            updateItems(active.key, (items) => {
              const empty = items.find((x) => !x.exercise_id)
              return empty ? items.map((x) => (x === empty ? { ...x, exercise_id: exerciseId } : x)) : [...items, { ...newItem(), exercise_id: exerciseId }]
            })
          }
        />
      )}
    </>
  )
}
