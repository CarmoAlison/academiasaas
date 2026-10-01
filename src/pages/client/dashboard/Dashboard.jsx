import { CalendarDays, ChevronRight, CreditCard, Dumbbell, IdCard } from 'lucide-react'
import { Button, SkeletonCard, StatusBadge } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { firstName, formatCurrency, formatDate, formatTime, paymentStatus, toDate, toISODate } from '../../../utils/formatters'
import { dayLabel, exercisesLabel, weekPosition } from '../../../utils/workoutDays'
import DelinquencyBanner from '../DelinquencyBanner'
import styles from '../client.module.css'
import { useMyPayments, useMyStudent, useMyWeekLogs, useMyWorkouts, useWeekSchedule, weekStart } from '../useStudent'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export default function Dashboard() {
  const { membership } = useTenant()
  const student = useMyStudent()
  const workouts = useMyWorkouts()
  const logs = useMyWeekLogs()
  const payments = useMyPayments()
  const week = useWeekSchedule(weekStart())
  const today = toISODate()

  // Treino da semana: ficha ativa, dia de hoje e progresso
  const ficha = (workouts.data ?? []).find((w) => w.days.length)
  const doneIds = new Set((logs.data ?? []).filter((l) => l.day_id).map((l) => l.day_id))
  const dow = new Date().getDay()
  const todayDay = ficha?.days.find((d) => d.dia_semana === dow)
  const nextDay = ficha?.days.find((d) => d.dia_semana != null && weekPosition(d.dia_semana) > weekPosition(dow) && !doneIds.has(d.id))
  const doneWeek = ficha ? ficha.days.filter((d) => doneIds.has(d.id)).length : 0
  const doneToday = Boolean(todayDay && doneIds.has(todayDay.id))

  const myClasses = week.days.flatMap((d) => d.items.filter((i) => i.booking && d.iso >= today))
  const pending = (payments.data ?? []).filter((p) => p.status === 'pendente').sort((a, b) => a.vencimento.localeCompare(b.vencimento))
  const s = student.data

  return (
    <>
      <div className={styles.hello}>
        <h1>
          {greeting()}, {firstName(membership?.profile?.nome)}!
        </h1>
        <p className={styles.muted}>
          {doneToday ? 'Treino de hoje concluído. Mandou bem! 💪' : todayDay ? 'Bora treinar hoje?' : 'Aproveite o descanso de hoje.'}
        </p>
      </div>

      <DelinquencyBanner />

      <div className={styles.grid}>
        {workouts.isPending ? (
          <SkeletonCard />
        ) : (
          <section className={`${styles.tile} ${styles.highlight}`}>
            <span className={styles.tileTitle}>
              <Dumbbell size={16} /> Treino de hoje
            </span>
            {ficha ? (
              <>
                {todayDay ? (
                  <>
                    <span className={styles.big}>
                      {doneToday && '✓ '}
                      {todayDay.nome || dayLabel(todayDay.dia_semana)}
                    </span>
                    <span className={styles.muted}>
                      {doneToday ? 'Concluído' : exercisesLabel(todayDay.items.length)} · {doneWeek} de {ficha.days.length} na semana
                    </span>
                  </>
                ) : (
                  <>
                    <span className={styles.big}>Dia de descanso</span>
                    <span className={styles.muted}>
                      {nextDay ? `Próximo: ${dayLabel(nextDay.dia_semana)}${nextDay.nome ? ` — ${nextDay.nome}` : ''} · ` : ''}
                      {doneWeek} de {ficha.days.length} na semana
                    </span>
                  </>
                )}
                <div>
                  <Button variant="secondary" size="sm" icon={ChevronRight} to="/client/treinos">
                    Ver treino da semana
                  </Button>
                </div>
              </>
            ) : (
              <span className={styles.muted}>Nenhum treino ativo. Fale com seu professor.</span>
            )}
          </section>
        )}

        <section className={styles.tile}>
          <div className={styles.tileHeader}>
            <span className={styles.tileTitle}>
              <IdCard size={16} /> Meu plano
            </span>
            {s && <StatusBadge status={s.status} />}
          </div>
          {student.isPending ? (
            <SkeletonCard lines={1} height={40} />
          ) : (
            <>
              <span className={styles.big}>{s?.plan?.nome ?? 'Sem plano'}</span>
              <span className={styles.muted}>
                {s?.plan ? `${formatCurrency(s.plan.valor)} · ` : ''}Aluno desde {formatDate(s?.data_matricula)}
                {s?.plano_valido_ate && (
                  <>
                    <br />
                    {s.plano_valido_ate < today ? `Plano venceu em ${formatDate(s.plano_valido_ate)}` : `Válido até ${formatDate(s.plano_valido_ate)}`}
                  </>
                )}
              </span>
            </>
          )}
        </section>

        <section className={styles.tile}>
          <div className={styles.tileHeader}>
            <span className={styles.tileTitle}>
              <CalendarDays size={16} /> Minhas aulas da semana
            </span>
            <Button variant="ghost" size="sm" to="/client/aulas">
              Agenda
            </Button>
          </div>
          {myClasses.length ? (
            <ul className={styles.list}>
              {myClasses.map((c) => {
                const d = toDate(c.data)
                return (
                  <li key={`${c.id}-${c.data}`} className={styles.listItem}>
                    <span className={styles.dateBox}>
                      <strong>{d.getDate()}</strong>
                      <small>{d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</small>
                    </span>
                    <div>
                      <strong>{c.nome}</strong>
                      <div className={styles.muted}>{formatTime(c.horario)}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <span className={styles.muted}>Nenhuma aula reservada nesta semana.</span>
          )}
        </section>

        <section className={styles.tile}>
          <div className={styles.tileHeader}>
            <span className={styles.tileTitle}>
              <CreditCard size={16} /> Pagamentos pendentes
            </span>
            <Button variant="ghost" size="sm" to="/client/financeiro">
              Ver tudo
            </Button>
          </div>
          {pending.length ? (
            <ul className={styles.list}>
              {pending.slice(0, 3).map((p) => (
                <li key={p.id} className={styles.listItem}>
                  <div>
                    <strong>{formatCurrency(p.valor)}</strong>
                    <div className={styles.muted}>Vence em {formatDate(p.vencimento)}</div>
                  </div>
                  <StatusBadge status={paymentStatus(p)} />
                </li>
              ))}
            </ul>
          ) : (
            <span className={styles.muted}>Tudo em dia! ✅</span>
          )}
        </section>
      </div>
    </>
  )
}
