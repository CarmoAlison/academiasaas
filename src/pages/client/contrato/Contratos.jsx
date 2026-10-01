import { useQuery } from '@tanstack/react-query'
import { FileSignature, FileText } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import ContractModal from '../../../components/contract/ContractModal'
import QueryError from '../../../components/feedback/QueryError'
import { Button, EmptyState, PageHeader, SkeletonCard, StatusBadge } from '../../../components/ui'
import { listStudentContracts } from '../../../services/contractService'
import { formatDate } from '../../../utils/formatters'
import styles from '../client.module.css'
import { useStudentId } from '../useStudent'

export function useMyContracts() {
  const { studentId } = useStudentId()
  return useQuery({ queryKey: ['contracts', studentId], queryFn: () => listStudentContracts(studentId), enabled: Boolean(studentId) })
}

/** Aviso no início quando há contrato aguardando aceite */
export function ContractBanner() {
  const contracts = useMyContracts()
  const [open, setOpen] = useState(null)
  const pendente = contracts.data?.find((c) => c.status === 'pendente')
  if (!pendente) return null
  return (
    <>
      <div className={`${styles.alertBanner} ${styles.infoBanner}`} role="status">
        <FileSignature size={20} />
        <div>
          <strong>Você tem um contrato para aceitar</strong>
          <span>
            Leia o contrato da academia e confirme o aceite.{' '}
            <button type="button" className={styles.linkButton} onClick={() => setOpen(pendente.id)}>
              Ler e aceitar
            </button>
          </span>
        </div>
      </div>
      <ContractModal contractId={open} canAccept onClose={() => setOpen(null)} />
    </>
  )
}

/** Contratos do aluno (aceite e PDF) */
export default function Contratos() {
  const contracts = useMyContracts()
  const [open, setOpen] = useState(null)

  if (contracts.isError) return <QueryError error={contracts.error} onRetry={contracts.refetch} />
  const list = (contracts.data ?? []).filter((c) => c.status !== 'cancelado')

  return (
    <>
      <PageHeader title="Contratos" subtitle="Seu contrato com a academia" />
      {contracts.isPending ? (
        <SkeletonCard />
      ) : !list.length ? (
        <EmptyState icon={FileText} title="Nenhum contrato" description="Quando a academia enviar um contrato, ele aparece aqui." />
      ) : (
        <ul className={styles.list}>
          {list.map((c) => (
            <li key={c.id} className={styles.listItem}>
              <span className={styles.dateBox}>
                <FileSignature size={20} />
              </span>
              <div>
                <strong>{c.titulo}</strong>
                <div className={styles.muted}>{c.status === 'aceito' ? `Aceito em ${formatDate(c.aceito_em)}` : `Enviado em ${formatDate(c.created_at)}`}</div>
              </div>
              <div className={styles.receiptActions}>
                <StatusBadge status={c.status} />
                <Button size="sm" variant={c.status === 'pendente' ? 'primary' : 'secondary'} onClick={() => setOpen(c.id)}>
                  {c.status === 'pendente' ? 'Ler e aceitar' : 'Ver / PDF'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ContractModal contractId={open} canAccept onClose={() => setOpen(null)} />
    </>
  )
}

/** Atalho para a página de contratos (perfil do aluno) */
export function ContractsLink() {
  return (
    <p style={{ marginTop: 16 }}>
      <Link to="/client/contrato" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <FileText size={16} /> Meus contratos
      </Link>
    </p>
  )
}
