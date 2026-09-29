import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import ReceiptCustomizer from '../../../components/receipt/ReceiptCustomizer'
import { sampleReceiptData } from '../../../components/receipt/receiptModel'
import { PageHeader } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { unitService } from '../../../services/catalogServices'
import { getReceiptSettings, saveReceiptSettings, uploadReceiptImage } from '../../../services/receiptService'
import { getAcademy } from '../../../services/saasService'

/** Personalização do recibo que a academia emite para os alunos */
export default function PersonalizarRecibo() {
  const { academyId, membership } = useTenant()
  const settings = useQuery({ queryKey: ['receipt-settings', academyId], queryFn: () => getReceiptSettings(academyId) })
  const academy = useQuery({ queryKey: ['academy', academyId], queryFn: () => getAcademy(academyId) })
  const units = useQuery({ queryKey: ['units', academyId], queryFn: () => unitService.list(academyId) })

  const mutation = useMutationToast((v) => saveReceiptSettings(academyId, v), {
    success: 'Recibo personalizado salvo. Os próximos recibos (e os já emitidos) usam este visual.',
    invalidate: [['receipt-settings', academyId], ['receipt']],
  })

  const sample = useMemo(
    () =>
      academy.data
        ? sampleReceiptData({
            academia: academy.data,
            unidade: units.data?.[0] ?? null,
            recebidoPor: membership?.profile?.nome ?? 'Recepção',
          })
        : null,
    [academy.data, units.data, membership],
  )

  const error = settings.error || academy.error
  return (
    <>
      <PageHeader
        title="Personalizar recibo"
        subtitle="Visual do recibo enviado aos alunos após o pagamento"
        breadcrumb={[{ label: 'Financeiro', to: '/admin/financeiro' }, { label: 'Personalizar recibo' }]}
      />
      {error ? (
        <QueryError error={error} onRetry={() => Promise.all([settings.refetch(), academy.refetch()])} />
      ) : settings.isPending || !sample ? (
        <PageLoader />
      ) : (
        <ReceiptCustomizer
          settings={settings.data}
          sample={sample}
          onSave={(v) => mutation.mutate(v)}
          saving={mutation.isPending}
          onUpload={(file, kind) => uploadReceiptImage(academyId, file, kind)}
          meName={membership?.profile?.nome}
        />
      )}
    </>
  )
}
