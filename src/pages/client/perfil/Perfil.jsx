import { useQuery } from '@tanstack/react-query'
import { AtSign, Building2, Clock, Globe, IdCard, Mail, MapPin, MessageCircle, Palette } from 'lucide-react'
import ProfileCard from '../../../components/profile/ProfileCard'
import { ThemeSelector } from '../../../components/shell/ThemeToggle'
import { Button, PageHeader, SkeletonCard, StatusBadge } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useModules } from '../../../hooks/useModules'
import { getMyAcademyData } from '../../../services/academySettingsService'
import { firstName, formatCurrency, formatDate, formatPhone, toISODate } from '../../../utils/formatters'
import { DIAS_SEMANA, horarioLabel, isOpenNow } from '../../../utils/horarios'
import { waLink, waPhone } from '../../../utils/whatsapp'
import { ContractsLink } from '../contrato/Contratos'
import styles from '../client.module.css'
import { useAcademySettings, useMyPayments, useMyStudent } from '../useStudent'
import ps from './Perfil.module.css'

const ORDEM = [1, 2, 3, 4, 5, 6, 0]

const mapsUrl = (a) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([a.endereco, a.bairro, a.cidade, a.uf, a.cep].filter(Boolean).join(', '))}`
const instagramUrl = (v) => `https://instagram.com/${String(v).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')}`
const siteUrl = (v) => (/^https?:\/\//.test(v) ? v : `https://${v}`)

/** Contato, endereço, redes e horário da academia */
function MinhaAcademia({ nomeAluno }) {
  const { academyId } = useTenant()
  const settings = useAcademySettings().data
  const query = useQuery({ queryKey: ['academy-data', academyId], queryFn: () => getMyAcademyData(academyId) })
  if (query.isPending) return <SkeletonCard lines={4} />
  const a = query.data
  if (!a) return null

  const horarios = Array.isArray(settings?.horarios) && settings.horarios.length === 7 ? settings.horarios : null
  const aberta = horarios ? isOpenNow(horarios) : null
  const temEndereco = a.endereco || a.cidade
  const hoje = new Date().getDay()

  return (
    <section className={styles.tile}>
      <span className={styles.tileTitle}>
        <Building2 size={16} /> Minha academia
      </span>
      <span className={styles.big}>{a.nome}</span>

      <div className={ps.actions}>
        {waPhone(a.telefone) && (
          <Button icon={MessageCircle} href={waLink(a.telefone, `Olá! Sou ${nomeAluno}, aluno(a) da ${a.nome}.`)} target="_blank" rel="noopener">
            Falar no WhatsApp
          </Button>
        )}
        {temEndereco && (
          <Button variant="outline" icon={MapPin} href={mapsUrl(a)} target="_blank" rel="noopener">
            Abrir no mapa
          </Button>
        )}
      </div>

      <ul className={ps.info}>
        {temEndereco && (
          <li>
            <MapPin size={16} />
            <span>
              {[a.endereco, a.bairro].filter(Boolean).join(' · ')}
              {a.cidade && (
                <span className={styles.muted}>
                  {a.endereco ? <br /> : null}
                  {a.cidade}
                  {a.uf ? `/${a.uf}` : ''}
                </span>
              )}
            </span>
          </li>
        )}
        {a.telefone && (
          <li>
            <MessageCircle size={16} />
            <span>{formatPhone(a.telefone)}</span>
          </li>
        )}
        {a.instagram && (
          <li>
            <AtSign size={16} />
            <a href={instagramUrl(a.instagram)} target="_blank" rel="noopener noreferrer">
              {a.instagram.startsWith('@') ? a.instagram : `@${a.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')}`}
            </a>
          </li>
        )}
        {a.site && (
          <li>
            <Globe size={16} />
            <a href={siteUrl(a.site)} target="_blank" rel="noopener noreferrer">
              {a.site.replace(/^https?:\/\//, '')}
            </a>
          </li>
        )}
        {a.email && (
          <li>
            <Mail size={16} />
            <a href={`mailto:${a.email}`}>{a.email}</a>
          </li>
        )}
      </ul>

      {horarios && (
        <div className={ps.hours}>
          <span className={ps.hoursTitle}>
            <Clock size={16} /> Horário de funcionamento
            <span className={aberta ? ps.open : ps.closed}>{aberta ? 'Aberta agora' : 'Fechada agora'}</span>
          </span>
          <ul>
            {ORDEM.map((i) => (
              <li key={i} className={i === hoje ? ps.today : ''}>
                <span>{DIAS_SEMANA[i]}</span>
                <span className={horarios[i]?.aberto ? '' : styles.muted}>{horarioLabel(horarios[i])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** Plano, valor, validade e próximo vencimento */
function MeuPlano() {
  const { has } = useModules()
  const student = useMyStudent()
  const payments = useMyPayments()
  if (student.isPending) return <SkeletonCard lines={3} />
  const s = student.data
  if (!s) return null
  const hoje = toISODate()
  const proxima = has('financeiro')
    ? (payments.data ?? []).filter((p) => p.status === 'pendente').sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0]
    : null

  return (
    <section className={styles.tile}>
      <div className={styles.tileHeader}>
        <span className={styles.tileTitle}>
          <IdCard size={16} /> Meu plano
        </span>
        <StatusBadge status={s.status} />
      </div>
      <span className={styles.big}>{s.plan?.nome ?? 'Sem plano'}</span>
      <ul className={ps.info}>
        {s.plan && (
          <li>
            <span className={styles.muted}>Valor</span>
            <strong>{formatCurrency(s.plan.valor)}</strong>
          </li>
        )}
        <li>
          <span className={styles.muted}>Validade</span>
          <strong style={s.plano_valido_ate && s.plano_valido_ate < hoje ? { color: 'var(--color-danger)' } : undefined}>
            {s.plano_valido_ate ? (s.plano_valido_ate < hoje ? `Venceu em ${formatDate(s.plano_valido_ate)}` : `Até ${formatDate(s.plano_valido_ate)}`) : 'Definida no 1º pagamento'}
          </strong>
        </li>
        {proxima && (
          <li>
            <span className={styles.muted}>Próximo vencimento</span>
            <strong>
              {formatCurrency(proxima.valor)} em {formatDate(proxima.vencimento)}
            </strong>
          </li>
        )}
        <li>
          <span className={styles.muted}>Aluno desde</span>
          <strong>{formatDate(s.data_matricula)}</strong>
        </li>
      </ul>
      {has('financeiro') && (
        <div>
          <Button variant="secondary" size="sm" to="/client/financeiro">
            Ver pagamentos
          </Button>
        </div>
      )}
    </section>
  )
}

export default function Perfil() {
  const { membership, academy } = useTenant()
  const { has } = useModules()
  return (
    <>
      <PageHeader title="Meu perfil" subtitle={academy?.nome} />
      <div className={styles.stack}>
        {membership && <ProfileCard profile={membership.profile} />}
        <div className={styles.grid}>
          <MeuPlano />
          <MinhaAcademia nomeAluno={firstName(membership?.profile?.nome)} />
        </div>
        <section className={styles.tile}>
          <span className={styles.tileTitle}>
            <Palette size={16} /> Aparência
          </span>
          <span className={styles.muted}>Escolha o tema do app. "Sistema" acompanha o modo do seu celular.</span>
          <div>
            <ThemeSelector />
          </div>
        </section>
        {has('contratos') && <ContractsLink />}
      </div>
    </>
  )
}
