import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge, StatusBadge } from '../../../components/ui'
import { academyModules, listModules } from '../../../services/moduleService'
import { academiesOverview, getAcademy } from '../../../services/saasService'
import { formatCurrency, formatDate } from '../../../utils/formatters'
import styles from './Chamados.module.css'

/**
 * Contexto da academia no chamado: plano, situação e módulos liberados
 * (muitas dúvidas do tipo "não acho a tela" são módulo desligado).
 */
export default function TicketAcademyInfo({ academyId }) {
  const academy = useQuery({ queryKey: ['academy', academyId], queryFn: () => getAcademy(academyId) })
  const modules = useQuery({ queryKey: ['academy-modules', academyId], queryFn: () => academyModules(academyId) })
  const catalog = useQuery({ queryKey: ['saas-modules'], queryFn: listModules })
  const overview = useQuery({ queryKey: ['academies', 'overview'], queryFn: academiesOverview })

  const a = academy.data
  if (!a) return null
  const ov = overview.data?.[academyId] ?? {}
  const on = new Set(modules.data ?? [])
  const optional = (catalog.data ?? []).filter((m) => m.ativo && !m.essencial)
  const off = optional.filter((m) => !on.has(m.slug))

  return (
    <div className={styles.info}>
      <div className={styles.infoRow}>
        <Link to={`/super-admin/academias/${a.id}`}>
          <strong>{a.nome}</strong>
        </Link>
        <StatusBadge status={a.status} />
        <span>
          Plano {a.saas_plan?.nome ?? '—'}
          {a.ciclo === 'anual' ? ' · anual' : ''}
        </span>
        {ov.limite_alunos ? (
          <span>
            {ov.alunos_ativos}/{ov.limite_alunos} alunos
          </span>
        ) : null}
        {ov.faturas_atrasadas > 0 ? <Badge tone="danger">Fatura atrasada · {formatCurrency(ov.valor_atrasado)}</Badge> : <Badge tone="success">Em dia</Badge>}
        {ov.ultimo_acesso && <span className="text-muted">admin acessou em {formatDate(ov.ultimo_acesso)}</span>}
      </div>
      {modules.data && (
        <div className={styles.infoRow}>
          <span className="text-muted">Módulos desligados:</span>
          {off.length ? (
            off.map((m) => (
              <Badge key={m.slug} tone="warning">
                {m.nome}
              </Badge>
            ))
          ) : (
            <span>nenhum (tudo liberado)</span>
          )}
          <Link to={`/super-admin/academias/${a.id}?tab=modulos`} className={styles.small}>
            ajustar
          </Link>
        </div>
      )}
    </div>
  )
}
