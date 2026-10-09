import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, QrCode, ScanLine, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, EmptyState, PageHeader, SkeletonCard, Spinner } from '../../../components/ui'
import { useAuth, useTenant } from '../../../hooks/useAuth'
import { doCheckin } from '../../../services/checkinService'
import { errorMessage } from '../../../utils/errors'
import { formatTime } from '../../../utils/formatters'
import styles from '../client.module.css'
import { useMyCheckins } from '../useStudent'

const hora = (iso) => formatTime(new Date(iso).toTimeString())

/** Resultado da leitura do QR Code da recepção */
function CheckinResult({ state }) {
  if (state.status === 'pending') {
    return (
      <section className={`${styles.tile} ${styles.checkinResult}`}>
        <Spinner />
        <strong>Registrando seu check-in…</strong>
      </section>
    )
  }
  if (state.status === 'error') {
    return (
      <section className={`${styles.tile} ${styles.checkinResult} ${styles.checkinError}`}>
        <XCircle size={48} />
        <strong>Não foi possível fazer o check-in</strong>
        <span>{state.message}</span>
        <span className={styles.muted}>Leia novamente o QR Code que está na tela da recepção.</span>
      </section>
    )
  }
  const r = state.result
  return (
    <section className={`${styles.tile} ${styles.checkinResult} ${styles.checkinOk}`}>
      <CheckCircle2 size={56} />
      <strong>{r.repetido ? 'Você já fez check-in' : 'Check-in confirmado!'}</strong>
      <span>{r.repetido ? `Sua entrada foi registrada às ${hora(r.em)}.` : `Entrada às ${hora(r.em)}. Bom treino! 💪`}</span>
      {r.inadimplente && (
        <span className={styles.checkinWarn}>
          <AlertTriangle size={16} /> Há mensalidade em atraso. Procure a recepção.
        </span>
      )}
    </section>
  )
}

export default function Checkin() {
  const { context } = useAuth()
  const { academyId, setAcademy } = useTenant()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState(null)
  const started = useRef(false)

  const history = useMyCheckins()

  const mutation = useMutation({
    mutationFn: ({ a, c }) => doCheckin(a, c),
    onMutate: () => setState({ status: 'pending' }),
    onSuccess: (result) => {
      setState({ status: 'ok', result })
      queryClient.invalidateQueries({ queryKey: ['my-checkins'] })
      queryClient.invalidateQueries({ queryKey: ['my-progress'] })
    },
    onError: (err) => setState({ status: 'error', message: errorMessage(err) }),
  })

  // QR lido: registra uma única vez e limpa o código da URL (recarregar não repete)
  useEffect(() => {
    const a = params.get('a')
    const c = params.get('c')
    if (!a || !c || started.current) return
    started.current = true
    // aluno em mais de uma academia: passa para a academia do QR
    if (a !== academyId && context?.memberships.some((m) => m.academy_id === a)) setAcademy(a)
    mutation.mutate({ a, c })
    setParams({}, { replace: true })
  }, [params, academyId, context, setAcademy, setParams, mutation])

  const list = history.data ?? []
  const now = new Date()
  const doMes = list.filter((c) => {
    const d = new Date(c.created_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  const ultimos30 = list.filter((c) => now - new Date(c.created_at) <= 30 * 86400000).length

  return (
    <>
      <PageHeader title="Check-in" subtitle="Sua entrada na academia e sua frequência" />
      <div className={styles.stack}>
        {state ? (
          <CheckinResult state={state} />
        ) : (
          <section className={`${styles.tile} ${styles.highlight}`}>
            <span className={styles.tileTitle}>
              <ScanLine size={16} /> Como fazer check-in
            </span>
            <span className={styles.big}>Aponte a câmera para o QR Code da recepção</span>
            <span className={styles.muted}>Use a câmera do celular (ou um leitor de QR). O link abre aqui e registra sua entrada.</span>
          </section>
        )}

        <section className={styles.tile}>
          <div className={styles.tileHeader}>
            <span className={styles.tileTitle}>
              <QrCode size={16} /> Minha frequência
            </span>
          </div>
          {history.isPending ? (
            <SkeletonCard lines={2} />
          ) : (
            <>
              <span className={styles.big}>
                {doMes} {doMes === 1 ? 'treino' : 'treinos'} este mês
              </span>
              <span className={styles.muted}>{ultimos30} nos últimos 30 dias</span>
            </>
          )}
        </section>

        {!history.isPending &&
          (list.length ? (
            <ul className={styles.list}>
              {list.slice(0, 20).map((c) => {
                const d = new Date(c.created_at)
                return (
                  <li key={c.id} className={styles.listItem}>
                    <span className={styles.dateBox}>
                      <strong>{d.getDate()}</strong>
                      <small>{d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small>
                    </span>
                    <div>
                      <strong style={{ textTransform: 'capitalize' }}>{d.toLocaleDateString('pt-BR', { weekday: 'long' })}</strong>
                      <div className={styles.muted}>Entrada às {hora(c.created_at)}</div>
                    </div>
                    <Badge tone={c.origem === 'qr' ? 'info' : 'neutral'}>{c.origem === 'qr' ? 'QR Code' : 'Recepção'}</Badge>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState compact icon={ScanLine} title="Nenhum check-in ainda" description="Sua primeira entrada aparece aqui." />
          ))}
      </div>
    </>
  )
}
