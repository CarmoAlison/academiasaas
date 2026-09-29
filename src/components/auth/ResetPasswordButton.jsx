import { RotateCcw } from 'lucide-react'
import { useMutationToast } from '../../hooks/useMutationToast'
import { resetPassword } from '../../services/authService'
import Button from '../ui/Button'
import { useConfirm } from '../ui/ConfirmDialog'

/**
 * Reseta a senha de um usuário para os 6 primeiros dígitos do CPF.
 * @param {{ profileId: string, nome: string, size?: 'sm'|'md' }} props
 */
export default function ResetPasswordButton({ profileId, nome, size = 'md' }) {
  const [confirm, dialog] = useConfirm()
  const mutation = useMutationToast(() => resetPassword(profileId), {
    success: 'Senha redefinida para o padrão (6 primeiros dígitos do CPF)',
  })

  const onClick = async () => {
    const ok = await confirm({
      title: 'Resetar senha',
      message: `A senha de ${nome} voltará a ser os 6 primeiros dígitos do CPF e será exigida a troca no próximo acesso.`,
      confirmLabel: 'Resetar senha',
    })
    if (ok) mutation.mutate()
  }

  return (
    <>
      <Button variant="outline" size={size} icon={RotateCcw} loading={mutation.isPending} onClick={onClick}>
        Resetar senha
      </Button>
      {dialog}
    </>
  )
}
