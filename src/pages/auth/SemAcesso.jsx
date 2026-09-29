import { ShieldOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { useLogout } from '../../hooks/useAuth'
import styles from './AuthLayout.module.css'
import AuthLayout from './AuthLayout'

/** Usuário autenticado sem nenhum vínculo ativo */
export default function SemAcesso() {
  const logout = useLogout()
  const navigate = useNavigate()
  return (
    <AuthLayout title="Sem acesso" subtitle="Seu usuário não possui um perfil ativo.">
      <div className={styles.info}>
        <ShieldOff size={18} />
        <p>Procure a administração da sua academia para verificar seu cadastro ou perfil de acesso.</p>
      </div>
      <Button
        block
        variant="outline"
        onClick={async () => {
          await logout()
          navigate('/login', { replace: true })
        }}
      >
        Voltar para o login
      </Button>
    </AuthLayout>
  )
}
