import { ChevronRight, Dumbbell, ShieldCheck, UserRound } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import { useAuth, useLogout, useTenant } from '../../hooks/useAuth'
import { accessOptions, optionPath, setPreferredArea } from '../../routes/accessOptions'
import { logAccess } from '../../services/logService'
import { ROLE_SLUGS } from '../../utils/constants'
import styles from './AuthLayout.module.css'
import AuthLayout from './AuthLayout'

const iconBox = (bg, color) => ({ background: bg, color })

/** Escolha do acesso quando o CPF tem mais de um: várias academias e/ou equipe + aluno */
export default function SelecionarAcademia() {
  const { context } = useAuth()
  const { setAcademy } = useTenant()
  const logout = useLogout()
  const navigate = useNavigate()
  // link aberto antes do login (ex.: QR Code de check-in) — segue para ele se for da área escolhida
  const from = useLocation().state?.from

  const options = accessOptions(context)
  const academies = new Set(options.filter((o) => o.academyId).map((o) => o.academyId))

  const choose = async (option) => {
    setAcademy(option.academyId)
    setPreferredArea(option.area === 'super' ? null : option.area)
    if (option.academyId) await logAccess(option.academyId, 'login')
    const area = optionPath(option).split('/').slice(0, 2).join('/')
    navigate(from?.startsWith(`${area}/`) ? from : optionPath(option), { replace: true })
  }

  return (
    <AuthLayout
      title="Como deseja entrar?"
      subtitle={academies.size > 1 ? 'Seu CPF está vinculado a mais de uma academia.' : 'Seu CPF tem mais de um tipo de acesso.'}
    >
      <div className={styles.list}>
        {options.map((o) => {
          const m = o.membership
          let icon, title, detail
          if (o.area === 'super') {
            icon = (
              <span className={styles.logo} style={iconBox('var(--color-primary)', 'var(--color-on-primary)')}>
                <ShieldCheck size={18} />
              </span>
            )
            title = 'Painel Super Admin'
            detail = 'Gestão de todas as academias'
          } else {
            icon =
              o.area === 'client' ? (
                <span className={styles.logo} style={iconBox('var(--color-success-light)', 'var(--color-success-text)')}>
                  <UserRound size={18} />
                </span>
              ) : m.academy_logo ? (
                <Avatar name={m.academy_nome} src={m.academy_logo} size={40} />
              ) : (
                <span className={styles.logo} style={iconBox('var(--color-primary-light)', 'var(--color-primary)')}>
                  <Dumbbell size={18} />
                </span>
              )
            title = o.area === 'admin' ? `Gestão — ${m.academy_nome}` : `Área do aluno — ${m.academy_nome}`
            detail =
              o.area === 'admin'
                ? m.roles.filter((r) => r.slug !== ROLE_SLUGS.ALUNO).map((r) => r.nome).join(', ')
                : 'Meus treinos, aulas e mensalidades'
          }
          return (
            <button key={o.key} type="button" className={styles.choice} onClick={() => choose(o)}>
              {icon}
              <span className={styles.choiceText}>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
              <ChevronRight size={18} />
            </button>
          )
        })}
      </div>
      <div className={styles.footer}>
        <Button
          variant="ghost"
          onClick={async () => {
            await logout()
            navigate('/login', { replace: true })
          }}
        >
          Sair
        </Button>
      </div>
    </AuthLayout>
  )
}
