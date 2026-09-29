import { useQuery } from '@tanstack/react-query'
import { Download, Printer, Share2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { getReceipt, getSaasReceipt } from '../../services/receiptService'
import { errorMessage } from '../../utils/errors'
import QueryError from '../feedback/QueryError'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { SkeletonCard } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'
import { canShareFiles, downloadBlob, generateReceiptPdf } from './pdfExport'
import { buildReceiptModel } from './receiptModel'
import styles from './ReceiptModal.module.css'
import ReceiptView from './ReceiptView'

const SOURCES = {
  aluno: getReceipt, // mensalidade do aluno (payments)
  saas: getSaasReceipt, // fatura da assinatura do sistema (saas_invoices)
}

/**
 * Visualização do recibo + download/compartilhamento do PDF.
 * Usado pelo financeiro da academia, pela área do aluno e pelo financeiro do Super Admin.
 * @param {{ paymentId: string|null, onClose: () => void, source?: 'aluno'|'saas' }} props
 */
export default function ReceiptModal({ paymentId, onClose, source = 'aluno' }) {
  const toast = useToast()
  const [busy, setBusy] = useState(null) // 'download' | 'share' | 'print'
  const query = useQuery({
    queryKey: ['receipt', source, paymentId],
    queryFn: () => SOURCES[source](paymentId),
    enabled: Boolean(paymentId),
  })
  const model = useMemo(() => (query.data ? buildReceiptModel(query.data) : null), [query.data])

  const run = (action) => async () => {
    setBusy(action)
    // a aba precisa ser aberta no clique (antes do await) para não ser bloqueada como pop-up
    const tab = action === 'print' ? window.open('', '_blank') : null
    try {
      const blob = await generateReceiptPdf(model)
      if (action === 'download') {
        downloadBlob(blob, model.fileName)
      } else if (action === 'share') {
        const file = new File([blob], model.fileName, { type: 'application/pdf' })
        await navigator.share({ files: [file], title: `Recibo nº ${model.numero}` })
      } else if (tab) {
        tab.location.href = URL.createObjectURL(blob)
      } else {
        downloadBlob(blob, model.fileName)
      }
    } catch (err) {
      tab?.close()
      if (err?.name !== 'AbortError') toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      open={Boolean(paymentId)}
      onClose={onClose}
      title={model ? `Recibo nº ${model.numero}` : 'Recibo'}
      size="lg"
      footer={
        model && (
          <>
            <Button variant="outline" icon={Printer} loading={busy === 'print'} disabled={Boolean(busy)} onClick={run('print')}>
              Abrir / imprimir
            </Button>
            {canShareFiles() && (
              <Button variant="outline" icon={Share2} loading={busy === 'share'} disabled={Boolean(busy)} onClick={run('share')}>
                Compartilhar
              </Button>
            )}
            <Button icon={Download} loading={busy === 'download'} disabled={Boolean(busy)} onClick={run('download')}>
              Baixar PDF
            </Button>
          </>
        )
      }
    >
      <div className={styles.desk}>
        {query.isPending ? (
          <SkeletonCard lines={8} height={420} />
        ) : query.isError ? (
          <QueryError error={query.error} onRetry={query.refetch} />
        ) : (
          <ReceiptView model={model} />
        )}
      </div>
    </Modal>
  )
}
