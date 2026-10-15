import { useQuery } from '@tanstack/react-query'
import { Ban, Eye, FileSignature, Settings2 } from 'lucide-react'
import { useState } from 'react'
import SaasContractModal from '../../../components/contract/SaasContractModal'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, Card, DataTable, useConfirm } from '../../../components/ui'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { cancelSaasContract, issueSaasContract, listSaasContracts } from '../../../services/saasContractService'
import { formatDateTime } from '../../../utils/formatters'

const SAAS_CONTRACT_STATUS = {
  pendente: { label: 'Aguardando assinatura', tone: 'warning' },
  aceito: { label: 'Assinado', tone: 'success' },
  cancelado: { label: 'Cancelado', tone: 'neutral' },
}

/** Super Admin → Academia → Contrato: gerar, acompanhar e cancelar o contrato do sistema */
export default function ContratoTab({ academyId }) {
  const [confirm, confirmDialog] = useConfirm()
  const [open, setOpen] = useState(null)
  const query = useQuery({ queryKey: ['saas-contracts', academyId], queryFn: () => listSaasContracts(academyId) })
  const list = query.data ?? []
  const pendente = list.some((c) => c.status === 'pendente')

  const issue = useMutationToast(() => issueSaasContract(academyId), {
    success: 'Contrato enviado. O admin da academia assina pelo painel dele.',
    invalidate: [['saas-contracts', academyId]],
    onSuccess: (id) => setOpen(id),
  })
  const cancel = useMutationToast(cancelSaasContract, { success: 'Contrato cancelado', invalidate: [['saas-contracts', academyId]] })

  const gerar = async () => {
    if (
      pendente &&
      !(await confirm({
        title: 'Gerar um novo contrato?',
        message: 'O contrato que está aguardando assinatura será cancelado e substituído pelo novo, com o texto atual do modelo.',
        confirmLabel: 'Gerar novo',
      }))
    )
      return
    issue.mutate()
  }

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <Card
      title="Contrato do sistema"
      subtitle="Contrato de uso do sistema que o admin da academia assina eletronicamente"
      padding={false}
      actions={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" size="sm" icon={Settings2} to="/super-admin/contrato">
            Editar modelo
          </Button>
          <Button size="sm" icon={FileSignature} loading={issue.isPending} onClick={gerar}>
            {list.length ? 'Gerar novo contrato' : 'Gerar contrato'}
          </Button>
        </div>
      }
    >
      {confirmDialog}
      <DataTable
        searchable={false}
        loading={query.isPending}
        data={list}
        pageSize={10}
        emptyTitle="Nenhum contrato enviado"
        emptyDescription="Gere o contrato: o admin da academia recebe um aviso no painel para assinar."
        columns={[
          { key: 'titulo', header: 'Contrato', render: (c) => <strong>{c.titulo}</strong> },
          { key: 'created_at', header: 'Enviado em', render: (c) => formatDateTime(c.created_at) },
          { key: 'status', header: 'Situação', render: (c) => <Badge tone={SAAS_CONTRACT_STATUS[c.status]?.tone}>{SAAS_CONTRACT_STATUS[c.status]?.label}</Badge> },
          {
            key: 'aceito_em',
            header: 'Assinatura',
            render: (c) =>
              c.aceito_em ? (
                <span>
                  {formatDateTime(c.aceito_em)}
                  <small className="text-muted" style={{ display: 'block' }}>
                    por {c.aceite_nome}
                  </small>
                </span>
              ) : (
                '—'
              ),
          },
          {
            key: 'acoes',
            header: '',
            align: 'right',
            sortable: false,
            render: (c) => (
              <div style={{ display: 'inline-flex', gap: 4 }}>
                <Button size="sm" variant="ghost" icon={Eye} onClick={() => setOpen(c.id)}>
                  Ver
                </Button>
                {c.status === 'pendente' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Ban}
                    loading={cancel.isPending && cancel.variables === c.id}
                    onClick={async () => {
                      if (await confirm({ title: 'Cancelar contrato?', message: 'A academia não poderá mais assinar este contrato.', danger: true, confirmLabel: 'Cancelar contrato' }))
                        cancel.mutate(c.id)
                    }}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            ),
          },
        ]}
      />
      <SaasContractModal contractId={open} onClose={() => setOpen(null)} />
    </Card>
  )
}
