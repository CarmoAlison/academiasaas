import { useQuery } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import ReceiptCustomizer from '../../../components/receipt/ReceiptCustomizer'
import { sampleSaasReceiptData } from '../../../components/receipt/receiptModel'
import { PageHeader } from '../../../components/ui'
import { useAuth } from '../../../hooks/useAuth'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { getSaasReceiptSettings, saveSaasReceiptSettings, uploadReceiptImage } from '../../../services/receiptService'

/** Personalização do recibo que o SaaS emite para as academias (faturas da assinatura) */
export default function PersonalizarRecibo() {
  const { context } = useAuth()
  const meName = context?.super_admin?.nome
  const query = useQuery({ queryKey: ['saas-receipt-settings'], queryFn: getSaasReceiptSettings })

  const mutation = useMutationToast(saveSaasReceiptSettings, {
    success: 'Recibo personalizado salvo. Vale para todas as faturas, inclusive as já pagas.',
    invalidate: [['saas-receipt-settings'], ['saas-settings'], ['receipt']],
  })

  const sample = useMemo(
    () => (query.data ? sampleSaasReceiptData({ settings: query.data.dados, recebidoPor: meName ?? 'Financeiro' }) : null),
    [query.data, meName],
  )

  return (
    <>
      <PageHeader
        title="Personalizar recibo"
        subtitle="Visual do recibo enviado às academias quando a fatura da assinatura é paga"
        breadcrumb={[{ label: 'Financeiro', to: '/super-admin/financeiro' }, { label: 'Personalizar recibo' }]}
      />
      <p className="text-muted" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 20, fontSize: 13 }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Nome, CNPJ, endereço e contato do emissor vêm de{' '}
          <Link to="/super-admin/configuracoes">Configurações → Dados do SaaS</Link>.
        </span>
      </p>
      {query.isError ? (
        <QueryError error={query.error} onRetry={query.refetch} />
      ) : !sample ? (
        <PageLoader />
      ) : (
        <ReceiptCustomizer
          settings={query.data.recibo}
          sample={sample}
          onSave={(v) => mutation.mutate(v)}
          saving={mutation.isPending}
          onUpload={(file, kind) => uploadReceiptImage('saas', file, kind)}
          meName={meName}
          labels={{
            mensagem: 'Mensagem à academia',
            mensagemPlaceholder: 'Ex.: Obrigado por confiar no nosso sistema!',
            rodapePlaceholder: 'Ex.: Dúvidas sobre sua assinatura? Fale com o suporte.',
            cidadePlaceholder: 'Padrão: cidade em Configurações',
            endereco: 'Exibir endereço da empresa',
          }}
        />
      )}
    </>
  )
}
