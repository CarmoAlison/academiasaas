import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, LifeBuoy, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import TicketList from '../../../components/support/TicketList'
import TicketThread from '../../../components/support/TicketThread'
import split from '../../../components/support/SupportSplit.module.css'
import { Button, Card, FormGrid, FullRow, Input, Modal, PageHeader, Select, Tabs, Textarea } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { patchTicketInCache } from '../../../hooks/useSupportRealtime'
import { listTickets, openTicket, setTicketStatus, TICKET_CATEGORIES, TICKET_PRIORITIES } from '../../../services/supportService'
import { rules } from '../../../utils/validators'

function NewTicketModal({ onClose, onCreated }) {
  const { academyId } = useTenant()
  const { field, handleSubmit } = useForm(
    { assunto: '', categoria: 'duvida', prioridade: 'normal', mensagem: '' },
    {
      assunto: [rules.required('Informe o assunto'), (v) => (v.trim().length < 3 ? 'Mínimo de 3 caracteres' : undefined)],
      mensagem: [rules.required('Descreva o que aconteceu')],
    },
  )
  const mutation = useMutationToast((v) => openTicket(academyId, v), {
    success: 'Chamado aberto! Você recebe a resposta aqui mesmo.',
    invalidate: [['tickets']],
    onSuccess: (id) => onCreated(id),
  })
  const submit = handleSubmit((v) => mutation.mutate(v))

  return (
    <Modal
      open
      onClose={onClose}
      title="Novo chamado"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Abrir chamado
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <FullRow>
            <Input label="Assunto" required maxLength={150} placeholder="Ex.: Recibo não abre no celular" {...field('assunto')} />
          </FullRow>
          <Select label="Categoria" options={TICKET_CATEGORIES} {...field('categoria')} />
          <Select label="Prioridade" options={TICKET_PRIORITIES} {...field('prioridade')} />
          <FullRow>
            <Textarea
              label="Mensagem"
              required
              rows={6}
              maxLength={5000}
              placeholder="Conte o que aconteceu, em qual tela e, se possível, o passo a passo para repetir."
              {...field('mensagem')}
            />
          </FullRow>
        </FormGrid>
      </form>
    </Modal>
  )
}

/** Central de suporte da academia: chamados com a equipe do SaaS */
export default function Suporte() {
  const queryClient = useQueryClient()
  const { academyId } = useTenant()
  const { id } = useParams()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [filtro, setFiltro] = useState('abertos')

  const tickets = useQuery({
    queryKey: ['tickets', academyId, filtro],
    queryFn: () => listTickets({ academyId, status: filtro === 'todos' ? null : 'abertos' }),
    refetchInterval: 60000, // reserva: o normal é chegar pelo Realtime
  })
  const all = useQuery({ queryKey: ['tickets', academyId, 'todos'], queryFn: () => listTickets({ academyId }), enabled: Boolean(id) })
  const selected = tickets.data?.find((t) => t.id === id) ?? all.data?.find((t) => t.id === id)

  // status muda na tela na hora; se o servidor recusar, a lista é recarregada
  const statusMutation = useMutationToast(
    async ({ ticketId, status }) => {
      patchTicketInCache(queryClient, ticketId, { status })
      try {
        return await setTicketStatus(ticketId, status)
      } catch (err) {
        queryClient.invalidateQueries({ queryKey: ['tickets'] })
        throw err
      }
    },
    {
      success: (_, v) => (v.status === 'resolvido' ? 'Chamado marcado como finalizado' : 'Chamado reaberto'),
      invalidate: [['tickets']],
    },
  )

  if (tickets.isError) return <QueryError error={tickets.error} onRetry={tickets.refetch} />

  return (
    <>
      <PageHeader
        title="Suporte"
        subtitle="Fale com a equipe do sistema: dúvidas, problemas e sugestões"
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            Novo chamado
          </Button>
        }
      />
      <div className={`${split.split} ${id ? split.hasSelection : split.noSelection}`}>
        <div className={split.listCol}>
          <div className={split.toolbar}>
            <Tabs
              items={[
                { key: 'abertos', label: 'Em aberto' },
                { key: 'todos', label: 'Todos' },
              ]}
              value={filtro}
              onChange={setFiltro}
            />
          </div>
          <TicketList tickets={tickets.data} loading={tickets.isPending} side="academia" selectedId={id} onSelect={(t) => navigate(`/admin/suporte/${t.id}`)} />
        </div>
        <div className={split.detailCol}>
          <Button className={split.back} variant="ghost" size="sm" icon={ArrowLeft} to="/admin/suporte">
            Voltar
          </Button>
          <Card>
            {selected ? (
              <TicketThread
                key={selected.id}
                ticket={selected}
                side="academia"
                actions={
                  selected.status === 'resolvido' ? (
                    <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => statusMutation.mutate({ ticketId: selected.id, status: 'aberto' })}>
                      Reabrir
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" icon={CheckCircle2} onClick={() => statusMutation.mutate({ ticketId: selected.id, status: 'resolvido' })}>
                      Finalizar chamado
                    </Button>
                  )
                }
              />
            ) : (
              <div className={split.placeholder}>
                <div>
                  <LifeBuoy size={36} />
                  <p>Selecione um chamado ou abra um novo.</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
      {creating && (
        <NewTicketModal
          onClose={() => setCreating(false)}
          onCreated={(newId) => {
            setCreating(false)
            setFiltro('abertos')
            navigate(`/admin/suporte/${newId}`)
          }}
        />
      )}
    </>
  )
}
