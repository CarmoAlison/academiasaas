import { AlertCircle, IdCard } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import PasswordInput from '../../components/auth/PasswordInput'
import Turnstile, { TURNSTILE_SITE_KEY } from '../../components/auth/Turnstile'
import FullPageLoader from '../../components/feedback/FullPageLoader'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { useAuth, useTenant } from '../../hooks/useAuth'
import { useForm } from '../../hooks/useForm'
import { accessOptions, optionPath, setPreferredArea } from '../../routes/accessOptions'
import { resolveHome } from '../../routes/resolveHome'
import { LoginError } from '../../services/authService'
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
  const [captchaToken, setCaptchaToken] = useState(null)
  const captchaRef = useRef(null)

  const { field, handleSubmit } = useForm(
    { cpf: '', senha: '' },
    { cpf: [rules.required('Informe seu CPF'), rules.cpf()], senha: [rules.required('Informe sua senha')] },
  )

  const onSubmit = handleSubmit(async ({ cpf, senha }) => {
    setError('')
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Confirme a verificação de segurança abaixo.')
      return
    }
    setSubmitting(true)
    try {
      const ctx = await signIn(cpf, senha, captchaToken)
      const fromLoc = location.state?.from
      const from = fromLoc ? `${fromLoc.pathname}${fromLoc.search ?? ''}` : undefined

      const options = accessOptions(ctx)
      if (options.length === 0) {
        await signOut()
        setError('Seu usuário não possui acesso ativo a nenhuma academia.')
        return
      }
      // mais de um acesso (várias academias, ou equipe que também é aluno): o usuário escolhe
      if (options.length > 1) {
        navigate('/selecionar-academia', { replace: true, state: from ? { from } : undefined })
        return
      }
      const [option] = options
      setAcademy(option.academyId)
      setPreferredArea(option.area === 'super' ? null : option.area)
      await logAccess(option.academyId, 'login')
      const fallback = option.area === 'super' ? optionPath(option) : resolveHome(ctx, option.academyId)
      navigate(from?.startsWith(optionPath(option).split('/').slice(0, 2).join('/')) ? from : fallback, { replace: true })
    } catch (err) {
      setError(err instanceof LoginError ? err.message : errorMessage(err))
      captchaRef.current?.reset() // cada token de CAPTCHA vale para uma tentativa só
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
        <Turnstile ref={captchaRef} onToken={setCaptchaToken} />
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
