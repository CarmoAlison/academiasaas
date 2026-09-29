import { ArrowLeft, Info } from 'lucide-react'
import Button from '../../components/ui/Button'
import styles from './AuthLayout.module.css'
import AuthLayout from './AuthLayout'

export default function RecuperarSenha() {
  return (
    <AuthLayout title="Recuperar senha" subtitle="O acesso é feito por CPF, sem e-mail cadastrado.">
      <div className={styles.info}>
        <Info size={18} />
        <div>
          <p>
            Procure a <strong>recepção ou o administrador da sua academia</strong> e peça o reset da senha.
          </p>
          <p style={{ marginTop: 8 }}>
            Após o reset, sua senha volta a ser os <strong>6 primeiros dígitos do seu CPF</strong> e você deverá criar uma
            nova senha no próximo acesso.
          </p>
        </div>
      </div>
      <Button to="/login" variant="outline" icon={ArrowLeft} block>
        Voltar para o login
      </Button>
    </AuthLayout>
  )
}
