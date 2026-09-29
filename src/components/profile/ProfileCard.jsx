import { Camera, KeyRound } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useForm } from '../../hooks/useForm'
import { updateMyProfile, updateSuperAdminProfile, uploadAvatar } from '../../services/profileService'
import { errorMessage } from '../../utils/errors'
import { formatCPF, formatPhone } from '../../utils/formatters'
import { rules } from '../../utils/validators'
import ChangePasswordModal from '../auth/ChangePasswordModal'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import Card from '../ui/Card'
import FormGrid, { FormActions } from '../ui/FormGrid'
import Input from '../ui/Input'
import { useToast } from '../ui/Toast'
import styles from './ProfileCard.module.css'

/**
 * Dados do próprio usuário + troca de senha. Usado nas páginas de perfil de todas as áreas.
 * @param {{ profile?: object|null, superAdmin?: object|null, extra?: import('react').ReactNode }} props
 *   profile: linha de profiles (usuário de academia) · superAdmin: linha de super_admins
 */
export default function ProfileCard({ profile, superAdmin, extra }) {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const fileRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)

  const source = profile ?? superAdmin ?? {}
  const { field, handleSubmit } = useForm(
    {
      nome: source.nome ?? '',
      telefone: formatPhone(source.telefone ?? ''),
      email_contato: source.email_contato ?? source.email ?? '',
    },
    { nome: [rules.required()], email_contato: [rules.email()] },
  )

  const onSubmit = handleSubmit(async (values) => {
    setSaving(true)
    try {
      if (profile) await updateMyProfile(profile.id, values)
      else await updateSuperAdminProfile(superAdmin.id, { nome: values.nome, email: values.email_contato })
      await refresh()
      toast.success('Perfil atualizado')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  })

  const onAvatar = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !profile) return
    setUploading(true)
    try {
      const url = await uploadAvatar(user.id, file)
      await updateMyProfile(profile.id, { ...profile, avatar_url: url })
      await refresh()
      toast.success('Foto atualizada')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={styles.layout}>
      <Card className={styles.side}>
        <div className={styles.identity}>
          <div className={styles.avatarWrap}>
            <Avatar name={source.nome} src={profile?.avatar_url} size={96} />
            {profile && (
              <button
                type="button"
                className={styles.avatarBtn}
                onClick={() => fileRef.current?.click()}
                aria-label="Alterar foto"
                disabled={uploading}
              >
                <Camera size={16} />
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar} />
          </div>
          <strong className={styles.name}>{source.nome}</strong>
          <span className="text-muted">CPF {formatCPF(source.cpf ?? user?.email?.split('@')[0])}</span>
        </div>
        <Button variant="outline" icon={KeyRound} block onClick={() => setPasswordOpen(true)}>
          Trocar senha
        </Button>
        {extra}
      </Card>

      <Card title="Dados pessoais">
        <form onSubmit={onSubmit} noValidate>
          <FormGrid columns={2}>
            <Input label="Nome completo" required {...field('nome')} />
            <Input label="CPF (login)" value={formatCPF(source.cpf ?? '')} disabled hint="O CPF não pode ser alterado" />
            {profile && <Input label="Telefone" inputMode="tel" {...field('telefone', { mask: 'phone' })} />}
            <Input label="E-mail de contato" type="email" {...field('email_contato')} />
          </FormGrid>
          <div style={{ marginTop: 24 }}>
            <FormActions>
              <Button type="submit" loading={saving}>
                Salvar alterações
              </Button>
            </FormActions>
          </div>
        </form>
      </Card>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  )
}
