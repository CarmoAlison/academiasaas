import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, EmptyState, Input, Modal, Textarea, useConfirm } from '../../../components/ui'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { listMacros, removeMacro, saveMacro } from '../../../services/supportService'
import styles from './Chamados.module.css'

/** Cadastro das respostas prontas do suporte */
export default function MacrosModal({ open, onClose }) {
  const query = useQuery({ queryKey: ['support-macros'], queryFn: listMacros, enabled: open })
  const [editing, setEditing] = useState(null) // null = lista; {} = nova
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [confirm, confirmDialog] = useConfirm()

  const edit = (m) => {
    setEditing(m)
    setTitulo(m.titulo ?? '')
    setTexto(m.texto ?? '')
  }
  const save = useMutationToast(() => saveMacro(editing?.id, { titulo, texto }), {
    success: 'Resposta salva',
    invalidate: [['support-macros']],
    onSuccess: () => setEditing(null),
  })
  const remove = useMutationToast(removeMacro, { success: 'Resposta excluída', invalidate: [['support-macros']] })

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Respostas prontas"
      footer={
        editing ? (
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Voltar
            </Button>
            <Button loading={save.isPending} disabled={titulo.trim().length < 2 || !texto.trim()} onClick={() => save.mutate()}>
              Salvar
            </Button>
          </>
        ) : (
          <Button icon={Plus} onClick={() => edit({})}>
            Nova resposta
          </Button>
        )
      }
    >
      {confirmDialog}
      {editing ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <Input label="Título" value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Esqueci a senha" />
          <Textarea label="Texto" rows={7} maxLength={5000} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
      ) : !query.data?.length ? (
        <EmptyState compact title="Nenhuma resposta pronta" description="Crie textos para dúvidas frequentes e insira com 1 clique na conversa." />
      ) : (
        <ul className={styles.macroList}>
          {query.data.map((m) => (
            <li key={m.id}>
              <div>
                <strong>{m.titulo}</strong>
                <p>{m.texto}</p>
              </div>
              <span>
                <Button variant="ghost" size="sm" icon={Pencil} aria-label="Editar" onClick={() => edit(m)} />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  aria-label="Excluir"
                  onClick={async () => {
                    if (await confirm({ title: 'Excluir resposta', message: `Excluir "${m.titulo}"?`, danger: true, confirmLabel: 'Excluir' })) remove.mutate(m.id)
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
