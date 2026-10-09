import { Pause, Play, RotateCcw, Timer, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { mmss } from '../../../utils/progresso'
import styles from './RestTimer.module.css'

/** Bipe curto ao fim do descanso (sem arquivo de áudio) */
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    ;[0, 0.25, 0.5].forEach((t) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.25, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.2)
    })
    setTimeout(() => ctx.close(), 1000)
  } catch {
    // sem áudio: fica só a vibração e o aviso na tela
  }
}

/**
 * Cronômetro de descanso flutuante (acima do menu inferior).
 * O tempo conta pelo relógio (não por ticks), então continua certo com a tela bloqueada.
 * @param {{ seconds: number, label?: string, onClose: () => void }} props
 */
export default function RestTimer({ seconds, label, onClose }) {
  const [total, setTotal] = useState(seconds)
  const [endAt, setEndAt] = useState(() => Date.now() + seconds * 1000)
  const [pausedLeft, setPausedLeft] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const avisou = useRef(false)

  const left = pausedLeft ?? Math.max(0, Math.ceil((endAt - now) / 1000))
  const done = left === 0

  useEffect(() => {
    if (pausedLeft !== null || done) return undefined
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [pausedLeft, done])

  useEffect(() => {
    if (done && !avisou.current) {
      avisou.current = true
      navigator.vibrate?.([300, 150, 300])
      beep()
    }
  }, [done])

  const restart = (secs = total) => {
    avisou.current = false
    setTotal(secs)
    setPausedLeft(null)
    setNow(Date.now())
    setEndAt(Date.now() + secs * 1000)
  }
  const add = (delta) => {
    if (pausedLeft !== null) setPausedLeft(Math.max(0, pausedLeft + delta))
    else {
      avisou.current = false
      setEndAt((e) => Math.max(Date.now(), e) + delta * 1000)
      setNow(Date.now())
    }
    setTotal((t) => Math.max(1, t + delta))
  }
  const togglePause = () => {
    if (pausedLeft !== null) {
      setNow(Date.now())
      setEndAt(Date.now() + pausedLeft * 1000)
      setPausedLeft(null)
    } else setPausedLeft(left)
  }

  const pct = total ? ((total - left) / total) * 100 : 100

  return (
    <div className={`${styles.timer} ${done ? styles.done : ''}`} role="timer" aria-live="polite">
      <div className={styles.bar}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.row}>
        <Timer size={20} aria-hidden />
        <div className={styles.info}>
          <strong>{done ? 'Bora para a próxima série! 💪' : mmss(left)}</strong>
          <small>{done ? 'Descanso concluído' : `Descanso${label ? ` · ${label}` : ''}`}</small>
        </div>
        {done ? (
          <button type="button" onClick={() => restart()} aria-label="Repetir descanso">
            <RotateCcw size={18} />
          </button>
        ) : (
          <>
            <button type="button" onClick={() => add(-15)} aria-label="Menos 15 segundos">
              −15
            </button>
            <button type="button" onClick={() => add(15)} aria-label="Mais 15 segundos">
              +15
            </button>
            <button type="button" onClick={togglePause} aria-label={pausedLeft !== null ? 'Continuar' : 'Pausar'}>
              {pausedLeft !== null ? <Play size={18} /> : <Pause size={18} />}
            </button>
          </>
        )}
        <button type="button" onClick={onClose} aria-label="Fechar cronômetro">
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
