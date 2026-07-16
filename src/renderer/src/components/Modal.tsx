/**
 * DESIGN v2 modal shell: centered card 480–560px, radius 16px, title 17px/600,
 * footer = Cancel (outline) left, one gold primary right. Keyboard-complete:
 * Esc cancels, ⌘Enter submits, focus lands inside on open.
 */
import { Button } from './Button'
import { useEffect, useRef } from 'react'

export function Modal({
  title,
  onClose,
  onSubmit,
  submitLabel,
  submitDisabled,
  submitBlockedReason,
  destructive,
  children,
}: {
  title: string
  onClose: () => void
  onSubmit: () => void
  submitLabel: string
  submitDisabled?: boolean
  /** D1 amendment 8: WHY submit is blocked — no silent dead buttons. Rendered as
   *  a rust hint by the footer and as the disabled button's tooltip. Forms that
   *  already compute a problem string pass it here instead of discarding it. */
  submitBlockedReason?: string | null
  /** story 8.1 (decline): the confirm renders as a rust outline, not gold */
  destructive?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const blocked = Boolean(submitDisabled && submitBlockedReason)
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
          {/* D1 amendment 8: the reason a submit is blocked is always visible —
              never a dead button with no explanation. */}
          {blocked && (
            <span className="modal-block-reason" role="status">
              {submitBlockedReason}
            </span>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            kbd="⌘⏎"
            disabled={submitDisabled}
            title={blocked ? (submitBlockedReason ?? undefined) : `${submitLabel} (⌘⏎)`}
            aria-describedby={blocked ? 'modal-block-reason' : undefined}
            onClick={onSubmit}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
