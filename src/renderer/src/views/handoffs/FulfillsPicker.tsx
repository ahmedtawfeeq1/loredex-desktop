/**
 * "Fulfills a request…" picker (story 8.3): OPEN/accepted `kind: request`
 * handoffs addressed to the sending project — qualified id, objective and age
 * per option. Empty state is one serif sentence, no action noise (AC5).
 * Also hosts the retro-link modal: PR-11 ships no "set fulfills on existing
 * note" export, so linking an existing delivery composes a reply-with-fulfills
 * (the sanctioned write path — the app never touches frontmatter itself).
 */
import { useEffect, useState } from 'react'
import { formatAge, qualifiedId } from '../../../../shared/handoff-lanes'
import type { HandoffCard } from '../../../../shared/types'
import { Modal } from '../../components/Modal'
import { useHandoffs } from '../../stores/handoffs'
import { fulfillsCandidates } from './compose-form'

export function FulfillsPicker({
  candidates,
  value,
  onChange,
}: {
  candidates: HandoffCard[]
  /** note name of the picked request; '' = none */
  value: string
  onChange: (fulfills: string) => void
}): React.JSX.Element {
  if (candidates.length === 0) {
    return <p className="fulfills-empty">No open requests to this project right now.</p>
  }
  return (
    <select
      className="modal-input"
      aria-label="Fulfills a request"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">None — a standalone delivery</option>
      {candidates.map((c) => (
        <option key={c.id} value={c.id}>
          {qualifiedId(c)} — {c.objective || c.name} ({formatAge(c.ageDays)})
        </option>
      ))}
    </select>
  )
}

/**
 * Retro-link modal ("Link to request…" on a delivery without `fulfills`):
 * pick the request, then deep-link into a prefilled reply-with-fulfills
 * compose targeting it (AC2 — compose-time field is the one write path).
 */
export function LinkRequestModal(): React.JSX.Element | null {
  const delivery = useHandoffs((s) => s.linkRequestFor)
  if (!delivery) return null
  return <LinkRequestForm key={delivery.id} delivery={delivery} />
}

function LinkRequestForm({ delivery }: { delivery: HandoffCard }): React.JSX.Element {
  const cards = useHandoffs((s) => s.cards)
  const load = useHandoffs((s) => s.load)
  const closeLinkRequest = useHandoffs((s) => s.closeLinkRequest)
  const openCompose = useHandoffs((s) => s.openCompose)
  const [picked, setPicked] = useState('')

  useEffect(() => {
    if (cards === null) void load()
  }, [cards, load])

  // requests addressed to the delivery's sending project
  const candidates = fulfillsCandidates(cards ?? [], delivery.from)
  const request = candidates.find((c) => c.id === picked)

  return (
    <Modal
      title="Link to request"
      onClose={closeLinkRequest}
      onSubmit={() => {
        if (!request) return
        closeLinkRequest()
        // reply to the REQUEST, fulfills prefilled — a new linking delivery;
        // the existing delivery note is never rewritten (anti-second-engine)
        openCompose(request, {
          fulfills: request.id,
          objective: delivery.objective || delivery.id,
          body: `Fulfilled by the earlier delivery [[${delivery.id}]].`,
        })
      }}
      submitLabel="Compose the link"
      submitDisabled={!request}
      submitBlockedReason={!request ? "Pick the request this delivery fulfills." : null}
    >
      <p className="modal-banner">
        “{delivery.objective || delivery.id}”
        <span className="modal-banner-route">
          {delivery.from} ⟶ {delivery.to}
        </span>
      </p>
      <div className="modal-row">
        <span className="modal-label">Request</span>
        <FulfillsPicker candidates={candidates} value={picked} onChange={setPicked} />
      </div>
      <p className="modal-hint">
        This composes a short reply-delivery carrying the fulfills link — the original delivery
        note stays untouched.
      </p>
    </Modal>
  )
}
