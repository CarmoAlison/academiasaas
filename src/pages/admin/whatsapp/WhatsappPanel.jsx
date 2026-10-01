import { useQuery } from '@tanstack/react-query'
import { CheckCheck, MessageCircle, Settings } from 'lucide-react'
import { useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, DataTable, PageHeader, Tabs } from '../../../components/ui'
import { useAcademySettings } from '../../../hooks/useAcademySettings'
import { useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import { useWhatsappSend } from '../../../hooks/useWhatsapp'
import { lastSent, listPaymentQueue } from '../../../services/whatsappService'
import { addDays, formatCurrency, formatDate, formatDateTime, formatPhone, toISODate } from '../../../utils/formatters'
import { fillTemplate, paymentVars, templateFor } from '../../../utils/whatsapp'
import { ADMIN_ONLY } from '../layout/adminNav'

const TABS = [
  { key: 'lembrete', label: 'Vencendo' },
  { key: 'atraso', label: 'Em atraso' },
  { key: 'recibo', label: 'Recibos' },
]

const DESCRIPTIONS = {
  lembrete: (dias) => `Mensalidades pendentes que vencem nos próximos ${dias} dia(s).`,
  atraso: () => 'Mensalidades vencidas e ainda não pagas.',
  recibo: () => 'Pagamentos recebidos nos últimos 7 dias: envie o recibo ao aluno.',
}

/** Cobranças e recibos pelo WhatsApp: a mensagem abre pronta, é só tocar em enviar */
export default function WhatsappPanel() {
  const { academyId, academy } = useTenant()
  const { can } = usePermissions()
  const settings = useAcademySettings().data
  const send = useWhatsappSend()
  const [tipo, setTipo] = useState('lembrete')

  const diasLembrete = settings?.whatsapp_dias_lembrete ?? 3
  const hoje = toISODate()
  const query = useQuery({
    queryKey: ['whatsapp-queue', academyId, tipo, hoje, diasLembrete],
    queryFn: () =>
      listPaymentQueue(academyId, tipo, {
        hoje,
        ateLembrete: toISODate(addDays(new Date(), diasLembrete)),
        desdeRecibo: addDays(new Date(), -7).toISOString(),
      }),
    enabled: Boolean(settings),
  })
  const ids = (query.data ?? []).map((p) => p.id)
  const sent = useQuery({
    queryKey: ['whatsapp-sent', academyId, tipo, ids],
    queryFn: () => lastSent(academyId, tipo, { paymentIds: ids }),
    enabled: ids.length > 0,
  })

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  const message = (p) => fillTemplate(templateFor(settings, tipo), paymentVars(p, academy?.nome ?? ''))

  return (
    <>
      <PageHeader
        title="WhatsApp"
        subtitle="Lembretes, avisos de atraso e recibos com mensagem pronta"
        actions={
          can(ADMIN_ONLY) && (
            <Button variant="outline" icon={Settings} to="/admin/configuracoes">
              Editar mensagens
            </Button>
          )
        }
      />
      <Tabs items={TABS} value={tipo} onChange={setTipo} />
      <p className="text-muted" style={{ margin: '16px 0' }}>
        {DESCRIPTIONS[tipo](diasLembrete)} Ao clicar em <strong>Enviar</strong>, o WhatsApp abre com a mensagem pronta para o aluno.
      </p>
      <DataTable
        key={tipo}
        loading={query.isPending}
        data={query.data ?? []}
        searchKeys={['aluno_nome', 'descricao']}
        searchPlaceholder="Buscar aluno"
        emptyTitle={tipo === 'atraso' ? 'Nenhuma mensalidade em atraso 🎉' : 'Nada para enviar agora'}
        columns={[
          { key: 'aluno_nome', header: 'Aluno', render: (p) => <strong>{p.aluno_nome}</strong> },
          { key: 'aluno_telefone', header: 'Celular', sortable: false, render: (p) => (p.aluno_telefone ? formatPhone(p.aluno_telefone) : <Badge tone="warning">Sem celular</Badge>) },
          { key: 'valor', header: 'Valor', align: 'right', render: (p) => formatCurrency(p.valor) },
          tipo === 'recibo'
            ? { key: 'pago_em', header: 'Pago em', render: (p) => formatDate(p.pago_em) }
            : {
                key: 'vencimento',
                header: 'Vencimento',
                render: (p) => (tipo === 'atraso' ? <Badge tone="danger">{formatDate(p.vencimento)}</Badge> : formatDate(p.vencimento)),
              },
          {
            key: 'enviado',
            header: 'Último envio',
            sortable: false,
            render: (p) =>
              sent.data?.[p.id] ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <CheckCheck size={14} color="var(--color-success)" /> {formatDateTime(sent.data[p.id])}
                </span>
              ) : (
                <span className="text-muted">—</span>
              ),
          },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (p) => (
              <Button
                size="sm"
                variant={sent.data?.[p.id] ? 'outline' : 'primary'}
                icon={MessageCircle}
                disabled={!p.aluno_telefone}
                onClick={() => send({ studentId: p.student_id, paymentId: p.id, tipo, telefone: p.aluno_telefone, mensagem: message(p) })}
              >
                {sent.data?.[p.id] ? 'Reenviar' : 'Enviar'}
              </Button>
            ),
          },
        ]}
      />
    </>
  )
}
