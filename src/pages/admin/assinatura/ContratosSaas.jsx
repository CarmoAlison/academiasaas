import { useQuery } from '@tanstack/react-query'
import { Eye, FileSignature } from 'lucide-react'
import { useState } from 'react'
import SaasContractModal from '../../../components/contract/SaasContractModal'
import { Badge, Button, Card, DataTable } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { listSaasContracts } from '../../../services/saasContractService'
import { formatDateTime } from '../../../utils/formatters'

const STATUS = {
  pendente: { label: 'Aguardando sua assinatura', tone: 'warning' },
  aceito: { label: 'Assinado', tone: 'success' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
}

/** Contratos do sistema enviados à academia (Admin assina e baixa o PDF) */
export function useSaasContracts() {
  const { academyId, impersonating } = useTenant()
  return useQuery({
    queryKey: ['saas-contracts', academyId],
    queryFn: () => listSaasContracts(academyId),
    enabled: Boolean(academyId),
    refetchOnWindowFocus: !impersonating,
  })
}

/** Aviso no topo do painel quando há contrato para assinar */
export function SaasContractBanner({ className }) {
  const query = useSaasContracts()
  const [open, setOpen] = useState(null)
  const pendente = (query.data ?? []).find((c) => c.status === 'pendente')
  if (!pendente) return null
  return (
    <>
      <div className={className} role="status">
        <span>
          <strong>Contrato do sistema aguardando sua assinatura.</strong> Leia e assine eletronicamente em poucos segundos.
        </span>
        <Button size="sm" icon={FileSignature} onClick={() => setOpen(pendente.id)}>
          Ler e assinar
        </Button>
      </div>
      <SaasContractModal contractId={open} onClose={() => setOpen(null)} canSign />
    </>
  )
}

/** Lista de contratos na página "Assinatura do sistema" */
export default function ContratosSaas() {
  const { impersonating } = useTenant()
  const query = useSaasContracts()
  const [open, setOpen] = useState(null)
  const list = query.data ?? []
  if (!query.isPending && !list.length) return null

  return (
    <Card title="Contrato do sistema" subtitle="Contrato de uso do sistema com a sua academia" padding={false}>
      <DataTable
        searchable={false}
        loading={query.isPending}
        data={list}
        pageSize={5}
        emptyTitle="Nenhum contrato"
        columns={[
          { key: 'titulo', header: 'Contrato', render: (c) => <strong>{c.titulo}</strong> },
          { key: 'created_at', header: 'Recebido em', render: (c) => formatDateTime(c.created_at) },
          { key: 'status', header: 'Situação', render: (c) => <Badge tone={STATUS[c.status]?.tone}>{STATUS[c.status]?.label}</Badge> },
          { key: 'aceito_em', header: 'Assinado em', render: (c) => (c.aceito_em ? `${formatDateTime(c.aceito_em)} · ${c.aceite_nome}` : '—') },
          {
            key: 'acoes',
            header: '',
            align: 'right',
            sortable: false,
            render: (c) =>
              c.status === 'pendente' && !impersonating ? (
                <Button size="sm" icon={FileSignature} onClick={() => setOpen(c.id)}>
                  Ler e assinar
                </Button>
              ) : (
                <Button size="sm" variant="ghost" icon={Eye} onClick={() => setOpen(c.id)}>
                  Ver / PDF
                </Button>
              ),
          },
        ]}
      />
      {/* em "acessar como" o Super Admin só lê: quem assina é o admin da academia */}
      <SaasContractModal contractId={open} onClose={() => setOpen(null)} canSign={!impersonating} />
    </Card>
  )
}
