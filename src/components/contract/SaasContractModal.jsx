import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileSignature } from 'lucide-react'
import { useMemo, useState } from 'react'
import { acceptSaasContract, getSaasContract } from '../../services/saasContractService'
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
 * Contrato do SaaS com a academia: leitura, PDF e (para o Admin da academia) assinatura eletrônica.
 * @param {{ contractId: string|null, onClose: () => void, canSign?: boolean }} props
 */
export default function SaasContractModal({ contractId, onClose, canSign = false }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(null)
  const [agree, setAgree] = useState(false)
  const query = useQuery({ queryKey: ['saas-contract', contractId], queryFn: () => getSaasContract(contractId), enabled: Boolean(contractId) })
  const model = useMemo(() => (query.data ? buildContractModel(query.data) : null), [query.data])
  const pendingSign = canSign && model?.status === 'pendente'

  const pdf = async () => {
    setBusy('pdf')
    try {
      downloadBlob(await generateContractPdf(model), model.fileName)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const sign = async () => {
    setBusy('sign')
    try {
      await acceptSaasContract(contractId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['saas-contract', contractId] }),
        queryClient.invalidateQueries({ queryKey: ['saas-contracts'] }),
      ])
      toast.success('Contrato assinado! Você pode baixar a cópia em PDF quando quiser.')
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
        (pendingSign ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, width: '100%', justifyContent: 'space-between' }}>
            <Checkbox label="Li e concordo com todas as cláusulas, em nome da academia" checked={agree} onChange={setAgree} />
            <Button icon={FileSignature} disabled={!agree || Boolean(busy)} loading={busy === 'sign'} onClick={sign}>
              Assinar contrato
            </Button>
          </div>
        ) : (
          <Button icon={Download} loading={busy === 'pdf'} disabled={Boolean(busy)} onClick={pdf}>
            Baixar PDF
          </Button>
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
