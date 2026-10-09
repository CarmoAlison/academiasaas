import { CalendarClock, Copy, Trash2 } from 'lucide-react'
import { Button, EmptyState, Switch } from '../../../components/ui'
import { DIAS_SEMANA, defaultHorarios, horarioLabel } from '../../../utils/horarios'
import styles from './HorariosEditor.module.css'

// segunda primeiro, domingo por último
const ORDEM = [1, 2, 3, 4, 5, 6, 0]

/**
 * Editor do horário de funcionamento (7 dias). `value` null = não informado.
 * @param {{ value: {aberto: boolean, abre: string, fecha: string}[]|null, onChange: (v: any[]|null) => void }} props
 */
export default function HorariosEditor({ value, onChange }) {
  if (!value) {
    return (
      <EmptyState
        compact
        icon={CalendarClock}
        title="Horário não informado"
        description="Defina os dias e horários em que a academia abre."
        action={
          <Button type="button" variant="outline" onClick={() => onChange(defaultHorarios())}>
            Definir horário
          </Button>
        }
      />
    )
  }

  const set = (i, patch) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  // copia o horário de segunda para terça a sexta
  const copiarSegunda = () => onChange(value.map((d, j) => (j >= 2 && j <= 5 ? { ...value[1] } : d)))

  return (
    <>
      <div className={styles.grid}>
        {ORDEM.map((i) => {
          const d = value[i]
          return (
            <div key={i} className={`${styles.row} ${d.aberto ? '' : styles.closed}`}>
              <Switch label={DIAS_SEMANA[i]} checked={d.aberto} onChange={(v) => set(i, { aberto: v })} />
              {d.aberto ? (
                <div className={styles.times}>
                  <input type="time" aria-label={`${DIAS_SEMANA[i]}: abre`} value={d.abre} onChange={(e) => set(i, { abre: e.target.value })} />
                  <span>às</span>
                  <input type="time" aria-label={`${DIAS_SEMANA[i]}: fecha`} value={d.fecha} onChange={(e) => set(i, { fecha: e.target.value })} />
                  <small className="text-muted">{horarioLabel(d) === '24 horas' ? '24 horas' : ''}</small>
                </div>
              ) : (
                <span className="text-muted">Fechado</span>
              )}
            </div>
          )
        })}
      </div>
      <div className={styles.actions}>
        <Button type="button" size="sm" variant="ghost" icon={Copy} onClick={copiarSegunda}>
          Copiar segunda para terça a sexta
        </Button>
        <Button type="button" size="sm" variant="ghost" icon={Trash2} onClick={() => onChange(null)}>
          Remover horário
        </Button>
      </div>
      <small className="text-muted">Para funcionar 24 horas, use o mesmo horário para abrir e fechar (ex.: 00:00 às 00:00). Fechamento depois da meia-noite também vale.</small>
    </>
  )
}
