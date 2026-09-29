import { ChevronRight, Dumbbell, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import { useAuth, useLogout, useTenant } from '../../hooks/useAuth'
import { resolveHome } from '../../routes/resolveHome'
import { logAccess } from '../../services/logService'
import styles from './AuthLayout.module.css'
import AuthLayout from './AuthLayout'

/** Escolha da academia quando o CPF possui vínculo com mais de uma */
export default function SelecionarAcademia() {
  const { context } = useAuth()
  const { setAcademy } = useTenant()
  const logout = useLogout()
  const navigate = useNavigate()

  const choose = async (academyId) => {
    setAcademy(academyId)
    await logAccess(academyId, 'login')
    navigate(resolveHome(context, academyId), { replace: true })
  }

  return (
    <AuthLayout title="Selecione a academia" subtitle="Seu CPF está vinculado a mais de uma academia.">
      <div className={styles.list}>
        {context?.super_admin && (
          <button
            type="button"
            className={styles.choice}
            onClick={() => {
              setAcademy(null)
              navigate('/super-admin/dashboard', { replace: true })
            }}
          >
            <span className={styles.logo} style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>
              <ShieldCheck size={18} />
            </span>
            <span className={styles.choiceText}>
              <strong>Painel Super Admin</strong>
              <small>Gestão de todas as academias</small>
            </span>
            <ChevronRight size={18} />
          </button>
        )}
        {context?.memberships.map((m) => (
          <button key={m.academy_id} type="button" className={styles.choice} onClick={() => choose(m.academy_id)}>
            {m.academy_logo ? (
              <Avatar name={m.academy_nome} src={m.academy_logo} size={40} />
            ) : (
              <span className={styles.logo} style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
                <Dumbbell size={18} />
              </span>
            )}
            <span className={styles.choiceText}>
              <strong>{m.academy_nome}</strong>
              <small>{m.roles.map((r) => r.nome).join(', ') || 'Sem perfil'}</small>
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
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
