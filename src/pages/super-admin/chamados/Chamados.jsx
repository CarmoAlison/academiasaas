import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, LifeBuoy, LogIn } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import TicketList from '../../../components/support/TicketList'
import TicketThread from '../../../components/support/TicketThread'
import split from '../../../components/support/SupportSplit.module.css'
import { Button, Card, Input, PageHeader, Select } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { patchTicketInCache } from '../../../hooks/useSupportRealtime'
import { useSuperRole } from '../../../hooks/useSuperRole'
import { listTickets, setTicketStatus, TICKET_STATUS } from '../../../services/supportService'

const FILTERS = [
  { key: 'abertos', label: 'Em aberto' },
  { key: 'aberto', label: 'Aguardando suporte' },
  { key: 'respondido', label: 'Respondidos' },
  { key: 'resolvido', label: 'Finalizados' },
  { key: 'todos', label: 'Todos' },
]

/** Central de chamados das academias (papéis Administrador e Suporte) */
export default function Chamados() {
  const queryClient = useQueryClient()
  const { id } = useParams()
  const navigate = useNavigate()
  const { setAcademy } = useTenant()
  const { superCan } = useSuperRole()
  const [filtro, setFiltro] = useState('abertos')
  const [busca, setBusca] = useState('')

  const tickets = useQuery({
    queryKey: ['tickets', 'suporte', filtro],
    queryFn: () => listTickets({ status: filtro === 'todos' ? null : filtro }),
    refetchInterval: 60000, // reserva: o normal é chegar pelo Realtime
  })
  const all = useQuery({ queryKey: ['tickets', 'suporte', 'todos'], queryFn: () => listTickets(), enabled: Boolean(id) })
  const selected = tickets.data?.find((t) => t.id === id) ?? all.data?.find((t) => t.id === id)

  const list = useMemo(() => {
    const term = busca.trim().toLowerCase()
    const rows = tickets.data ?? []
    if (!term) return rows
    return rows.filter((t) => `#${t.numero} ${t.assunto} ${t.academy?.nome ?? ''} ${t.aberto_por_nome ?? ''}`.toLowerCase().includes(term))
  }, [tickets.data, busca])

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
      success: 'Status atualizado',
      invalidate: [['tickets'], ['tickets-unread']],
    },
  )

  if (tickets.isError) return <QueryError error={tickets.error} onRetry={tickets.refetch} />

  return (
    <>
      <PageHeader title="Chamados" subtitle="Dúvidas, problemas e sugestões enviados pelas academias" />
      <div className={`${split.split} ${id ? split.hasSelection : split.noSelection}`}>
        <div className={split.listCol}>
          <div className={split.toolbar}>
            <Select aria-label="Filtrar chamados" value={filtro} onChange={(e) => setFiltro(e.target.value)} options={FILTERS.map((f) => ({ value: f.key, label: f.label }))} />
            <Input placeholder="Buscar nº, assunto ou academia" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar chamado" />
          </div>
          <TicketList tickets={list} loading={tickets.isPending} side="suporte" selectedId={id} onSelect={(t) => navigate(`/super-admin/chamados/${t.id}`)} />
        </div>
        <div className={split.detailCol}>
          <Button className={split.back} variant="ghost" size="sm" icon={ArrowLeft} to="/super-admin/chamados">
            Voltar
          </Button>
          <Card>
            {selected ? (
              <TicketThread
                key={selected.id}
                ticket={selected}
                side="suporte"
                actions={
                  <>
                    <Select
                      aria-label="Status do chamado"
                      value={selected.status}
                      options={TICKET_STATUS.map((s) => ({ value: s.value, label: s.label }))}
                      onChange={(e) => statusMutation.mutate({ ticketId: selected.id, status: e.target.value })}
                    />
                    {superCan('acessar') && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={LogIn}
                        onClick={() => {
                          setAcademy(selected.academy_id)
                          navigate('/admin')
                        }}
                      >
                        Acessar academia
                      </Button>
                    )}
                  </>
                }
              />
            ) : (
              <div className={split.placeholder}>
                <div>
                  <LifeBuoy size={36} />
                  <p>Selecione um chamado para responder.</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
