/**
 * Snooze-until picker (story 8.1 AC2): DESIGN v2 modal — date input
 * (min tomorrow) + quick options. Snooze is a vault write (snoozed_until);
 * expiry is derived by readers, never auto-written back.
 */
import { useState } from 'react'
import type { HandoffCard } from '../../../../shared/types'
import { Modal } from '../../components/Modal'
import { useHandoffs } from '../../stores/handoffs'
import { localDay, minSnoozeDate, snoozeProblem, snoozeQuickOptions } from './lifecycle'

function SnoozeForm({ card }: { card: HandoffCard }): React.JSX.Element {
  const closeSnooze = useHandoffs((s) => s.closeSnooze)
  const setStatus = useHandoffs((s) => s.setStatus)
  const today = localDay()
  const [until, setUntil] = useState(minSnoozeDate(today))
  const problem = snoozeProblem(until, today)
  return (
    <Modal
      title="Snooze this handoff"
      onClose={closeSnooze}
      onSubmit={() => {
        if (!problem) void setStatus(card, { to: 'snoozed', until })
      }}
      submitLabel="Snooze"
      submitDisabled={problem !== null}
    >
      <p className="modal-banner">
        “{card.objective || card.id}”
        <span className="modal-banner-route">
          {card.from} ⟶ {card.to}
        </span>
      </p>
      <div className="modal-row">
        <span className="modal-label">Until</span>
        <input
          type="date"
          className="modal-input"
          min={minSnoozeDate(today)}
          value={until}
          onChange={(e) => setUntil(e.target.value)}
        />
      </div>
      <div className="modal-row">
        <span className="modal-label" />
        <div className="snooze-quick">
          {snoozeQuickOptions(today).map((opt) => (
            <button
              key={opt.label}
              type="button"
              className="button-secondary button-small"
              aria-pressed={until === opt.until}
              onClick={() => setUntil(opt.until)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {problem && <p className="modal-error">{problem}</p>}
      <p className="modal-hint">
        The card sleeps until {until || 'the date you pick'}, then sorts back with open handoffs —
        reopening stays a one-click human action.
      </p>
    </Modal>
  )
}

/** Mounted once at App level; opens via the handoffs store. */
export function SnoozeUntilPicker(): React.JSX.Element | null {
  const card = useHandoffs((s) => s.snoozeFor)
  if (!card) return null
  return <SnoozeForm key={card.id} card={card} />
}
