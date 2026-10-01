import { useQuery } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, DataTable, Input } from '../../../components/ui'
import { useAcademySettings } from '../../../hooks/useAcademySettings'
import { useTenant } from '../../../hooks/useAuth'
import { useDebounce } from '../../../hooks/useDebounce'
import { useWhatsappSend } from '../../../hooks/useWhatsapp'
import { absentStudents } from '../../../services/checkinService'
import { lastSent } from '../../../services/whatsappService'
import { firstName, formatDate, formatDateTime, formatPhone } from '../../../utils/formatters'
import { fillTemplate, templateFor } from '../../../utils/whatsapp'
import styles from './Checkin.module.css'

/** Alunos ativos sem check-in há X dias, com mensagem de WhatsApp em 1 clique */
export default function Sumidos() {
  const { academyId, academy } = useTenant()
  const navigate = useNavigate()
  const settings = useAcademySettings().data
  const [dias, setDias] = useState('')
  const debounced = useDebounce(dias, 400)
  const padrao = settings?.dias_sumido ?? 10
  const valor = Number(debounced) >= 1 ? Number(debounced) : null
  const send = useWhatsappSend()

  const query = useQuery({
    queryKey: ['absent-students', academyId, valor],
    queryFn: () => absentStudents(academyId, valor),
  })
  const ids = (query.data ?? []).map((s) => s.student_id)
  const sent = useQuery({
    queryKey: ['whatsapp-sent', academyId, 'sumido', ids],
    queryFn: () => lastSent(academyId, 'sumido', { studentIds: ids }),
    enabled: ids.length > 0,
  })

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  const message = (s) => fillTemplate(templateFor(settings, 'sumido'), { nome: firstName(s.nome), dias: s.dias_ausente, academia: academy?.nome ?? '' })

  return (
    <>
      <div className={styles.toolbar}>
        <Input
          label="Sem check-in há pelo menos (dias)"
          type="number"
          min="1"
          placeholder={String(padrao)}
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          style={{ maxWidth: 220 }}
        />
        <span className="text-muted" style={{ paddingBottom: 10 }}>
          Padrão da academia: {padrao} dias (Configurações)
        </span>
      </div>
      <DataTable
        loading={query.isPending}
        data={query.data ?? []}
        rowKey="student_id"
        searchKeys={['nome']}
        searchPlaceholder="Buscar aluno"
        initialSort={{ key: 'dias_ausente', dir: 'desc' }}
        onRowClick={(s) => navigate(`/admin/alunos/${s.student_id}`)}
        emptyTitle="Ninguém sumido 🎉"
        emptyDescription="Todos os alunos ativos fizeram check-in recentemente."
        columns={[
          { key: 'nome', header: 'Aluno', render: (s) => <strong>{s.nome}</strong> },
          { key: 'telefone', header: 'Celular', sortable: false, render: (s) => (s.telefone ? formatPhone(s.telefone) : '—') },
          {
            key: 'ultimo_checkin',
            header: 'Último check-in',
            render: (s) => (s.ultimo_checkin ? formatDate(s.ultimo_checkin) : <Badge>Nunca</Badge>),
          },
          {
            key: 'dias_ausente',
            header: 'Ausente há',
            align: 'right',
            render: (s) => <Badge tone={s.dias_ausente >= padrao * 2 ? 'danger' : 'warning'}>{s.dias_ausente} dias</Badge>,
          },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (s) => (
              <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {sent.data?.[s.student_id] && (
                  <span className="text-muted" style={{ fontSize: 12 }} title="Última mensagem enviada">
                    Enviado {formatDateTime(sent.data[s.student_id])}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  icon={MessageCircle}
                  disabled={!s.telefone}
                  onClick={() => send({ studentId: s.student_id, tipo: 'sumido', telefone: s.telefone, mensagem: message(s) })}
                >
                  WhatsApp
                </Button>
              </span>
            ),
          },
        ]}
      />
    </>
  )
}
