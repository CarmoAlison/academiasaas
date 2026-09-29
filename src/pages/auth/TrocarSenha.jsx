import { ShieldAlert } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ChangePasswordForm } from '../../components/auth/ChangePasswordModal'
import Button from '../../components/ui/Button'
import { useAuth, useLogout, useTenant } from '../../hooks/useAuth'
import { resolveHome } from '../../routes/resolveHome'
import styles from './AuthLayout.module.css'
import AuthLayout from './AuthLayout'

/** Troca de senha obrigatória no primeiro acesso / após reset */
export default function TrocarSenha() {
  const { context, mustChangePassword } = useAuth()
  const { academyId } = useTenant()
  const logout = useLogout()
  const navigate = useNavigate()

  const goHome = () => navigate(resolveHome(context, academyId), { replace: true })

  return (
    <AuthLayout title="Crie uma nova senha" subtitle="Por segurança, defina uma senha pessoal para continuar.">
      {mustChangePassword && (
        <div className={styles.info}>
          <ShieldAlert size={18} />
          <p>
            Você está usando a senha padrão. Informe-a como <strong>senha atual</strong> (6 primeiros dígitos do CPF) e escolha
            uma nova.
          </p>
        </div>
      )}
      <ChangePasswordForm onDone={goHome} submitLabel="Salvar e continuar" />
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
