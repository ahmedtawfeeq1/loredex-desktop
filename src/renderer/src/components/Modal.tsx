/**
 * DESIGN v2 modal shell: centered card 480–560px, radius 16px, title 17px/600,
 * footer = Cancel (outline) left, one gold primary right. Keyboard-complete:
 * Esc cancels, ⌘Enter submits, focus lands inside on open.
 */
import { useEffect, useRef } from 'react'

export function Modal({
  title,
  onClose,
  onSubmit,
  submitLabel,
  submitDisabled,
  children,
}: {
  title: string
  onClose: () => void
  onSubmit: () => void
  submitLabel: string
  submitDisabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // focus the first form control so tab order starts inside the modal
    const first = cardRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button:not(.modal-close)',
    )
    first?.focus()
  }, [])

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (!submitDisabled) onSubmit()
    }
  }

  return (
    // biome-ignore lint: backdrop click-to-dismiss; the keyboard path is Escape
    <div className="modal-backdrop" onMouseDown={onClose} onKeyDown={onKeyDown}>
      <div
        ref={cardRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{title}</h2>
        {children}
        <div className="modal-footer">
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={submitDisabled}
            title={`${submitLabel} (⌘⏎)`}
            onClick={onSubmit}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
