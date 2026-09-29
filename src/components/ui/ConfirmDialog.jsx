import { useCallback, useRef, useState } from 'react'
import Button from './Button'
import Modal from './Modal'

/**
 * Confirmação baseada em Promise.
 * @example
 * const [confirm, confirmDialog] = useConfirm()
 * if (await confirm({ title: 'Excluir?', danger: true })) { ... }
 * return <>{confirmDialog}...</>
 */
export function useConfirm() {
  const [state, setState] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback(
    /** @param {{ title: string, message?: string, confirmLabel?: string, danger?: boolean }} options */
    (options) =>
      new Promise((resolve) => {
        resolver.current = resolve
        setState(options)
      }),
    [],
  )

  const close = (result) => {
    resolver.current?.(result)
    resolver.current = null
    setState(null)
  }

  const dialog = (
    <Modal
      open={Boolean(state)}
      onClose={() => close(false)}
      title={state?.title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {state?.confirmLabel ?? 'Confirmar'}
          </Button>
        </>
      }
    >
      <p className="text-muted">{state?.message ?? 'Deseja continuar?'}</p>
    </Modal>
  )

  return [confirm, dialog]
}
