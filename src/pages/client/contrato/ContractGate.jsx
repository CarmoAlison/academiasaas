import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSignature, LogOut } from 'lucide-react'
import { useMemo, useState } from 'react'
import ContractView from '../../../components/contract/ContractView'
import { buildContractModel } from '../../../components/contract/contractModel'
import QueryError from '../../../components/feedback/QueryError'
import receiptModalStyles from '../../../components/receipt/ReceiptModal.module.css'
import { Button, Checkbox, Modal, SkeletonCard, useToast } from '../../../components/ui'
import { useLogout, useTenant } from '../../../hooks/useAuth'
import { useModules } from '../../../hooks/useModules'
import { acceptContract, getContract, myPendingContract } from '../../../services/contractService'
import { errorMessage } from '../../../utils/errors'

/**
 * Bloqueia a área do aluno até ele aceitar o contrato (com o termo de LGPD).
 * Aparece logo ao entrar, na frente de tudo, e não pode ser fechado.
 */
export default function ContractGate() {
  const { academyId, membership, impersonating } = useTenant()
  const { has } = useModules()
  const enabled = Boolean(academyId && membership?.student_id && has('contratos') && !impersonating)

  const pending = useQuery({
    queryKey: ['contrato-pendente', academyId],
    queryFn: () => myPendingContract(academyId),
    enabled,
    staleTime: 0,
  })

  if (!enabled || !pending.data) return null
  return <GateModal key={pending.data} contractId={pending.data} />
}

function GateModal({ contractId }) {
  const { academyId } = useTenant()
  const logout = useLogout()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const query = useQuery({ queryKey: ['contract', contractId], queryFn: () => getContract(contractId) })
  const model = useMemo(() => (query.data ? buildContractModel(query.data) : null), [query.data])

  const accept = async () => {
    setBusy(true)
    try {
      await acceptContract(contractId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['contrato-pendente', academyId] }),
        queryClient.invalidateQueries({ queryKey: ['contracts'] }),
        queryClient.invalidateQueries({ queryKey: ['contract', contractId] }),
      ])
      toast.success('Contrato aceito! Uma cópia fica em Perfil → Meus contratos.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      dismissible={false}
      onClose={() => {}}
      size="lg"
      title={model?.titulo ?? 'Contrato'}
      footer={
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, width: '100%', justifyContent: 'space-between' }}>
          <Checkbox
            label="Li e concordo com o contrato e com o termo de tratamento de dados (LGPD)"
            checked={agree}
            onChange={setAgree}
          />
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <Button variant="ghost" icon={LogOut} disabled={busy} onClick={logout}>
              Sair
            </Button>
            <Button icon={FileSignature} disabled={!agree || busy || !model} loading={busy} onClick={accept}>
              Aceitar e continuar
            </Button>
          </div>
        </div>
      }
    >
      <p className="text-muted" style={{ margin: '0 0 12px', fontSize: 14 }}>
        Para usar a área do aluno, leia e aceite o contrato da academia. Role até o final para ver o termo de proteção de dados
        (LGPD).
      </p>
      <div className={receiptModalStyles.desk}>
        {query.isPending ? (
          <SkeletonCard lines={10} height={420} />
        ) : query.isError ? (
          <QueryError error={query.error} onRetry={query.refetch} />
        ) : (
          <ContractView model={model} />
        )}
      </div>
    </Modal>
  )
}
