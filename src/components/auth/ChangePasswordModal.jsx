import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useForm } from '../../hooks/useForm'
import { changePassword } from '../../services/authService'
import { errorMessage } from '../../utils/errors'
import { rules } from '../../utils/validators'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Modal from '../ui/Modal'
import { useToast } from '../ui/Toast'
import PasswordInput from './PasswordInput'

const EMPTY = { atual: '', nova: '', confirmar: '' }

/**
 * Formulário de troca de senha (reutilizado no modal e na página /trocar-senha)
 * @param {{ onDone?: () => void, onCancel?: () => void, submitLabel?: string }} props
 */
export function ChangePasswordForm({ onDone, onCancel, submitLabel = 'Salvar nova senha' }) {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const cpf = user?.email?.split('@')[0] ?? ''

  const { field, handleSubmit, reset, setErrors } = useForm(EMPTY, {
    atual: [rules.required('Informe a senha atual')],
    nova: [
      rules.required('Informe a nova senha'),
      rules.minLength(6, 'A senha deve ter ao menos 6 caracteres'),
      (v) => (v === cpf.slice(0, 6) ? 'A nova senha não pode ser a senha padrão' : undefined),
      (v, all) => (v === all.atual ? 'A nova senha deve ser diferente da atual' : undefined),
    ],
    confirmar: [(v, all) => (v !== all.nova ? 'As senhas não conferem' : undefined)],
  })

  const onSubmit = handleSubmit(async (values) => {
    setSaving(true)
    try {
      await changePassword({ email: user.email, current: values.atual, next: values.nova })
      await refresh()
      toast.success('Senha alterada com sucesso')
      reset(EMPTY)
      onDone?.()
    } catch (err) {
      if (/atual/i.test(err.message)) setErrors({ atual: err.message })
      else toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate style={{ display: 'grid', gap: 16 }}>
      <PasswordInput label="Senha atual" autoComplete="current-password" required {...field('atual')} />
      <PasswordInput label="Nova senha" autoComplete="new-password" hint="Mínimo de 6 caracteres" required {...field('nova')} />
      <Input label="Confirmar nova senha" type="password" autoComplete="new-password" required {...field('confirmar')} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

/**
 * Modal global de troca de senha (acessível pelo menu do usuário e pelo perfil)
 * @param {{ open: boolean, onClose: () => void }} props
 */
export default function ChangePasswordModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Trocar senha" size="sm">
      <ChangePasswordForm onDone={onClose} onCancel={onClose} />
    </Modal>
  )
}
