import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

type SalonModalProps = {
  title: string
  description: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
}

export function SalonModal({
  title,
  description,
  children,
  onClose,
  busy = false,
}: SalonModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    dialog?.showModal()
    dialog
      ?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled)')
      ?.focus()
    return () => {
      dialog?.close()
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [])

  return (
    <dialog
      className="salon-modal"
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="salon-modal-panel">
        <header className="salon-modal-header">
          <div>
            <span className="salon-eyebrow">Área do salão</span>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fechar formulário"
          >
            ×
          </button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
