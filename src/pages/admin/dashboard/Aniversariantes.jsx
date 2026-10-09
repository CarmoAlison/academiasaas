import { useQuery } from '@tanstack/react-query'
import { CheckCheck, Gift, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Avatar, Badge, Button, Card, EmptyState, SkeletonCard } from '../../../components/ui'
import { useAcademySettings } from '../../../hooks/useAcademySettings'
import { useTenant } from '../../../hooks/useAuth'
import { useModules } from '../../../hooks/useModules'
import { useWhatsappSend } from '../../../hooks/useWhatsapp'
import { listBirthdays } from '../../../services/studentService'
import { lastSent } from '../../../services/whatsappService'
import { firstName } from '../../../utils/formatters'
import { fillTemplate, templateFor, waPhone } from '../../../utils/whatsapp'
import styles from './Aniversariantes.module.css'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Aniversariantes do mês, com parabéns em 1 clique pelo WhatsApp */
export default function Aniversariantes() {
  const { academyId, academy } = useTenant()
  const mod = useModules()
  const settings = useAcademySettings().data
  const send = useWhatsappSend()
  const now = new Date()
  const mes = now.getMonth() + 1
  const hoje = now.getDate()
  const wa = mod.has('whatsapp')

  const query = useQuery({ queryKey: ['students', academyId, 'birthdays', mes], queryFn: () => listBirthdays(academyId, mes) })
  const ids = (query.data ?? []).map((s) => s.id)
  // parabéns já enviados neste ano
  const sent = useQuery({
    queryKey: ['whatsapp-sent', academyId, 'aniversario', ids],
    queryFn: () => lastSent(academyId, 'aniversario', { studentIds: ids }),
    enabled: wa && ids.length > 0,
  })
  const enviadoEsteAno = (id) => sent.data?.[id] && new Date(sent.data[id]).getFullYear() === now.getFullYear()

  const parabens = (s) => {
    const idade = s.data_nascimento ? now.getFullYear() - Number(s.data_nascimento.slice(0, 4)) : ''
    const mensagem = fillTemplate(templateFor(settings, 'aniversario'), { nome: firstName(s.nome), idade, academia: academy?.nome ?? '' })
    send({ studentId: s.id, tipo: 'aniversario', telefone: s.telefone, mensagem })
  }

  const lista = query.data ?? []
  // hoje primeiro, depois os próximos, por último os que já passaram
  const ordered = [...lista.filter((s) => s.nasc_dia >= hoje), ...lista.filter((s) => s.nasc_dia < hoje)]

  return (
    <Card
      title={
        <span className={styles.title}>
          <Gift size={18} /> Aniversariantes de {MESES[mes - 1]}
        </span>
      }
      subtitle={query.data ? `${lista.length} aluno(s) ativo(s)` : undefined}
      actions={
        lista.length > 6 && (
          <Button size="sm" variant="ghost" to="/admin/alunos?status=aniversariantes">
            Ver todos
          </Button>
        )
      }
    >
      {query.isPending ? (
        <SkeletonCard lines={3} height={80} />
      ) : !lista.length ? (
        <EmptyState compact title="Nenhum aniversariante este mês" description="Preencha a data de nascimento no cadastro dos alunos." />
      ) : (
        <ul className={styles.list}>
          {ordered.slice(0, 6).map((s) => {
            const isHoje = s.nasc_dia === hoje
            const passou = s.nasc_dia < hoje
            return (
              <li key={s.id} className={`${isHoje ? styles.today : ''} ${passou ? styles.past : ''}`}>
                <span className={styles.day}>
                  <strong>{String(s.nasc_dia).padStart(2, '0')}</strong>
                  <small>{MESES[mes - 1].slice(0, 3)}</small>
                </span>
                <Avatar name={s.nome} src={s.avatar_url} size={32} />
                <Link to={`/admin/alunos/${s.id}`} className={styles.name}>
                  {s.nome}
                </Link>
                {isHoje && <Badge tone="success">Hoje 🎉</Badge>}
                {wa &&
                  (enviadoEsteAno(s.id) ? (
                    <span className={styles.sent} title="Parabéns já enviado">
                      <CheckCheck size={14} /> Enviado
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant={isHoje ? 'primary' : 'outline'}
                      icon={MessageCircle}
                      disabled={!waPhone(s.telefone)}
                      title={waPhone(s.telefone) ? undefined : 'Aluno sem celular cadastrado'}
                      onClick={() => parabens(s)}
                    >
                      Parabéns
                    </Button>
                  ))}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
