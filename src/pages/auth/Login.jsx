import { AlertCircle, IdCard } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import PasswordInput from '../../components/auth/PasswordInput'
import FullPageLoader from '../../components/feedback/FullPageLoader'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { useAuth, useTenant } from '../../hooks/useAuth'
import { useForm } from '../../hooks/useForm'
import { resolveHome } from '../../routes/resolveHome'
import { logAccess } from '../../services/logService'
import { isSupabaseConfigured } from '../../services/supabaseClient'
import { errorMessage } from '../../utils/errors'
import { rules } from '../../utils/validators'
import styles from './AuthLayout.module.css'
import AuthLayout from './AuthLayout'

export default function Login() {
  const { signIn, signOut, session, context, loading } = useAuth()
  const { setAcademy, academyId } = useTenant()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { field, handleSubmit } = useForm(
    { cpf: '', senha: '' },
    { cpf: [rules.required('Informe seu CPF'), rules.cpf()], senha: [rules.required('Informe sua senha')] },
  )

  const onSubmit = handleSubmit(async ({ cpf, senha }) => {
    setError('')
    setSubmitting(true)
    try {
      const ctx = await signIn(cpf, senha)
      const from = location.state?.from?.pathname

      if (ctx.super_admin) {
        setAcademy(null)
        await logAccess(null, 'login')
        navigate(from?.startsWith('/super-admin') ? from : '/super-admin/dashboard', { replace: true })
        return
      }
      if (ctx.memberships.length === 0) {
        await signOut()
        setError('Seu usuário não possui acesso ativo a nenhuma academia.')
        return
      }
      if (ctx.memberships.length > 1) {
        navigate('/selecionar-academia', { replace: true })
        return
      }
      const [membership] = ctx.memberships
      setAcademy(membership.academy_id)
      await logAccess(membership.academy_id, 'login')
      navigate(resolveHome(ctx, membership.academy_id), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  })

  if (loading && session) return <FullPageLoader />
  if (session && context && !submitting) return <Navigate to={resolveHome(context, academyId)} replace />

  return (
    <AuthLayout title="Entrar" subtitle="Acesse com seu CPF e senha.">
      {!isSupabaseConfigured && (
        <div className={styles.warning}>
          Supabase não configurado. Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no arquivo
          <code> .env</code>.
        </div>
      )}
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {error && (
          <div className={styles.alert} role="alert">
            <AlertCircle size={18} /> {error}
          </div>
        )}
        <Input
          label="CPF"
          icon={IdCard}
          placeholder="000.000.000-00"
          inputMode="numeric"
          autoComplete="username"
          autoFocus
          {...field('cpf', { mask: 'cpf' })}
        />
        <PasswordInput label="Senha" autoComplete="current-password" placeholder="Sua senha" {...field('senha')} />
        <div className={styles.row}>
          <Link to="/recuperar-senha">Esqueci minha senha</Link>
        </div>
        <Button type="submit" size="lg" block loading={submitting}>
          Entrar
        </Button>
      </form>
      <p className={`${styles.footer} text-muted`}>
        Primeiro acesso? Sua senha são os 6 primeiros dígitos do CPF.
      </p>
    </AuthLayout>
  )
}
