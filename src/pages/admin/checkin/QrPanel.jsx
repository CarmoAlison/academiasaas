import { useQuery } from '@tanstack/react-query'
import { Maximize2, RefreshCw, ShieldAlert } from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import { Button, Card, Spinner, useConfirm } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { checkinQr, checkinUrl, resetCheckinQr } from '../../../services/checkinService'
import { ADMIN_ONLY } from '../layout/adminNav'
import styles from './Checkin.module.css'

/**
 * QR Code dinâmico para a tela/tablet da recepção. Muda a cada 30 s:
 * foto do QR não serve para fazer check-in de casa.
 */
export default function QrPanel() {
  const { academyId, academy } = useTenant()
  const { can } = usePermissions()
  const [confirm, confirmDialog] = useConfirm()
  const [image, setImage] = useState(null)
  const [left, setLeft] = useState(null)
  const boxRef = useRef(null)

  const query = useQuery({
    queryKey: ['checkin-qr', academyId],
    queryFn: () => checkinQr(academyId),
    // renova logo depois de expirar
    refetchInterval: (q) => ((q.state.data?.expira_em ?? 30) + 0.5) * 1000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  })
  const reset = useMutationToast(() => resetCheckinQr(academyId), {
    success: 'Novo QR Code gerado. Os códigos anteriores deixaram de valer.',
    invalidate: [['checkin-qr', academyId]],
  })

  const codigo = query.data?.codigo
  useEffect(() => {
    if (!codigo) return
    let alive = true
    QRCode.toDataURL(checkinUrl(academyId, codigo), { width: 640, margin: 1, errorCorrectionLevel: 'M' }).then((url) => alive && setImage(url))
    return () => {
      alive = false
    }
  }, [academyId, codigo])

  // contagem regressiva até o próximo código
  useEffect(() => {
    if (!query.data) return
    const until = query.dataUpdatedAt + query.data.expira_em * 1000
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [query.data, query.dataUpdatedAt])

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <Card>
      {confirmDialog}
      <div ref={boxRef} className={styles.qrBox}>
        <h2>{academy?.nome}</h2>
        <p className={styles.qrHint}>Aponte a câmera do celular para o código e faça o check-in</p>
        <div className={styles.qrImage}>{image ? <img src={image} alt="QR Code de check-in" /> : <Spinner />}</div>
        <p className="text-muted">{left !== null ? `Novo código em ${left}s` : ' '}</p>
      </div>
      <div className={styles.qrActions}>
        <Button variant="outline" icon={Maximize2} onClick={() => boxRef.current?.requestFullscreen?.()}>
          Tela cheia
        </Button>
        {can(ADMIN_ONLY) && (
          <Button
            variant="ghost"
            icon={RefreshCw}
            loading={reset.isPending}
            onClick={async () => {
              if (
                await confirm({
                  title: 'Gerar novo QR Code',
                  message: 'Os códigos atuais param de funcionar imediatamente. Use se suspeitar de uso indevido.',
                  confirmLabel: 'Gerar novo',
                })
              ) {
                reset.mutate()
              }
            }}
          >
            Gerar novo segredo
          </Button>
        )}
      </div>
      <p className={styles.qrNote}>
        <ShieldAlert size={16} /> Deixe esta tela aberta num tablet ou monitor na recepção. O código muda sozinho a cada 30 segundos, então uma foto
        dele não funciona depois. O aluno precisa estar logado no celular.
      </p>
    </Card>
  )
}
