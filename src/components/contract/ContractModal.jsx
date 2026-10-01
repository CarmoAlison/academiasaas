import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileSignature, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { acceptContract, getContract } from '../../services/contractService'
import { errorMessage } from '../../utils/errors'
import QueryError from '../feedback/QueryError'
import { downloadBlob, generateContractPdf } from '../receipt/pdfExport'
import receiptModalStyles from '../receipt/ReceiptModal.module.css'
import Button from '../ui/Button'
import Checkbox from '../ui/Checkbox'
import Modal from '../ui/Modal'
import { SkeletonCard } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'
import { buildContractModel } from './contractModel'
import ContractView from './ContractView'

/**
 * Contrato: leitura, PDF e (para o aluno, quando pendente) aceite eletrônico.
 * @param {{ contractId: string|null, onClose: () => void, canAccept?: boolean }} props
 */
export default function ContractModal({ contractId, onClose, canAccept = false }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(null)
  const [agree, setAgree] = useState(false)
  const query = useQuery({
    queryKey: ['contract', contractId],
    queryFn: () => getContract(contractId),
    enabled: Boolean(contractId),
  })
  const model = useMemo(() => (query.data ? buildContractModel(query.data) : null), [query.data])
  const pendingAccept = canAccept && model?.status === 'pendente'

  const pdf = (action) => async () => {
    setBusy(action)
    const tab = action === 'print' ? window.open('', '_blank') : null
    try {
      const blob = await generateContractPdf(model)
      if (tab) tab.location.href = URL.createObjectURL(blob)
      else downloadBlob(blob, model.fileName)
    } catch (err) {
      tab?.close()
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const accept = async () => {
    setBusy('accept')
    try {
      await acceptContract(contractId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contract', contractId] }),
        queryClient.invalidateQueries({ queryKey: ['contracts'] }),
      ])
      toast.success('Contrato aceito! Uma cópia fica disponível aqui para baixar.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const close = () => {
    setAgree(false)
    onClose()
  }

  return (
    <Modal
      open={Boolean(contractId)}
      onClose={close}
      title={model?.titulo ?? 'Contrato'}
      size="lg"
      footer={
        model &&
        (pendingAccept ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, width: '100%', justifyContent: 'space-between' }}>
            <Checkbox label="Li e concordo com todas as cláusulas deste contrato" checked={agree} onChange={setAgree} />
            <Button icon={FileSignature} disabled={!agree || Boolean(busy)} loading={busy === 'accept'} onClick={accept}>
              Aceitar contrato
            </Button>
          </div>
        ) : (
          <>
            <Button variant="outline" icon={Printer} loading={busy === 'print'} disabled={Boolean(busy)} onClick={pdf('print')}>
              Abrir / imprimir
            </Button>
            <Button icon={Download} loading={busy === 'download'} disabled={Boolean(busy)} onClick={pdf('download')}>
              Baixar PDF
            </Button>
          </>
        ))
      }
    >
      <div className={receiptModalStyles.desk}>
        {query.isPending ? (
          <SkeletonCard lines={10} height={480} />
        ) : query.isError ? (
          <QueryError error={query.error} onRetry={query.refetch} />
        ) : (
          <ContractView model={model} />
        )}
      </div>
    </Modal>
  )
}
