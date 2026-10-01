import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../components/ui'
import { logWhatsapp } from '../services/whatsappService'
import { errorMessage } from '../utils/errors'
import { waLink, waPhone } from '../utils/whatsapp'
import { useTenant } from './useAuth'

/**
 * Envio em 1 clique: abre o WhatsApp com a mensagem pronta e registra o envio.
 * Chamar direto no clique (o navegador só permite abrir janela em resposta ao usuário).
 */
export function useWhatsappSend() {
  const { academyId } = useTenant()
  const queryClient = useQueryClient()
  const toast = useToast()

  return ({ studentId = null, paymentId = null, tipo, telefone, mensagem }) => {
    if (!waPhone(telefone)) {
      toast.error('Aluno sem celular válido cadastrado')
      return
    }
    window.open(waLink(telefone, mensagem), '_blank', 'noopener')
    logWhatsapp(academyId, { studentId, paymentId, tipo, telefone, mensagem })
      .then(() => queryClient.invalidateQueries({ queryKey: ['whatsapp-sent', academyId] }))
      .catch((err) => toast.error(`Mensagem aberta, mas o envio não foi registrado: ${errorMessage(err)}`))
  }
}
