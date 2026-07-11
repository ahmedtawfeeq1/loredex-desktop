/**
 * Decline-reason modal (story 8.1 AC2): DESIGN v2 modal, single-line reason
 * REQUIRED before the rust confirm enables. Destructive-styled but reversible
 * (reopen is allowed) — the copy says so.
 */
import { useState } from 'react'
import type { HandoffCard } from '../../../../shared/types'
import { Modal } from '../../components/Modal'
import { useHandoffs } from '../../stores/handoffs'

function DeclineForm({ card }: { card: HandoffCard }): React.JSX.Element {
  const closeDecline = useHandoffs((s) => s.closeDecline)
  const setStatus = useHandoffs((s) => s.setStatus)
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  return (
    <Modal
      title="Decline this handoff"
      onClose={closeDecline}
      onSubmit={() => {
        if (trimmed) void setStatus(card, { to: 'declined', reason: trimmed })
      }}
      submitLabel="Decline"
      submitDisabled={!trimmed}
      submitBlockedReason={!trimmed ? "Write a reason so the sender knows why." : null}
      destructive
    >
      <p className="modal-banner">
        “{card.objective || card.id}”
        <span className="modal-banner-route">
          {card.from} ⟶ {card.to}
        </span>
      </p>
      <div className="modal-row">
        <span className="modal-label">Reason</span>
        <input
          className="modal-input"
          placeholder="Why this handoff won't be taken up (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <p className="modal-hint">
        The sender sees this reason on the card. Declining is reversible — the handoff can be
        reopened later.
      </p>
    </Modal>
  )
}

/** Mounted once at App level; opens via the handoffs store. */
export function DeclineReasonModal(): React.JSX.Element | null {
  const card = useHandoffs((s) => s.declineFor)
  if (!card) return null
  // key remounts a fresh form per target — no stale reason between opens
  return <DeclineForm key={card.id} card={card} />
}
