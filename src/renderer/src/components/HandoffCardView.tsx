/**
 * The routing-slip handoff card (DESIGN.md signature element): stamp chip +
 * mono route line, serif objective, mono footer. Card click opens the brief
 * in the reader; consume action arrives with story 3.4.
 */
import { formatAge } from '../../../shared/handoff-lanes'
import type { HandoffCard } from '../../../shared/types'
import { StatusChip } from './StatusChip'

export function HandoffCardView({
  card,
  onOpen,
  onConsume,
  actionsSlot,
  pressed,
  onReply,
  onComment,
  fulfilledBy,
  onLinkRequest,
}: {
  card: HandoffCard
  onOpen: (card: HandoffCard) => void
  /** ⌘⏎ on the focused card (story 3.4); the visible buttons live in actionsSlot */
  onConsume?: (card: HandoffCard) => void
  /** lifecycle action row (stories 3.4/8.1) — state-legal recipient actions */
  actionsSlot?: React.ReactNode
  /** stamp-press animation trigger — every state change (stories 3.4/8.1) */
  pressed?: boolean
  /** story 7.3: thread actions — secondary pills, the gold primary stays with accept */
  onReply?: (card: HandoffCard) => void
  onComment?: (card: HandoffCard) => void
  /** story 8.3 AC3: deliveries that fulfill this request (derived, never a status write) */
  fulfilledBy?: string[]
  /** story 8.3 AC2: retro-link a delivery without `fulfills` to its request */
  onLinkRequest?: (card: HandoffCard) => void
}): React.JSX.Element {
  const notes = card.readingOrder.length
  const snoozed = card.status === 'snoozed'
  return (
    <div
      className="handoff-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(card)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.target !== e.currentTarget) return
        if (e.metaKey && onConsume) onConsume(card)
        else onOpen(card)
      }}
    >
      <div className="handoff-card-top">
        <StatusChip status={card.status} pressed={pressed} />
        {/* story 8.2 AC1: request cards carry a navy REQUEST chip beside the
            stamp; kind absent in v1 notes defaults to delivery (lib) */}
        {card.kind === 'request' && <span className="status-chip chip-request">request</span>}
        {/* story 8.3 AC3: derived FULFILLED badge — the request's own status
            is never auto-written; closing it for real stays a recipient act */}
        {fulfilledBy && fulfilledBy.length > 0 && (
          <span className="status-chip chip-fulfilled" title={`by ${fulfilledBy.join(', ')}`}>
            fulfilled by {fulfilledBy[0]}
            {fulfilledBy.length > 1 ? ` +${fulfilledBy.length - 1}` : ''}
          </span>
        )}
        {/* AC4 (story 8.1): expired snooze is a DERIVED treatment — the vault
            status stays snoozed until a human reopens it */}
        {snoozed && card.expired && <span className="snooze-expired">expired</span>}
        <span className="handoff-route">
          {card.from} ⟶ {card.to}
        </span>
        <span className="handoff-date">{card.date || formatAge(card.ageDays)}</span>
      </div>
      <p className="handoff-objective">{card.objective || card.name}</p>
      <div className="handoff-foot">
        <span>
          {notes === 1 ? '1 note' : `${notes} notes`} · {formatAge(card.ageDays)}
          {snoozed && card.snoozedUntil ? ` · until ${card.snoozedUntil}` : ''}
        </span>
        {(onReply || onComment || onLinkRequest) && (
          <span className="handoff-actions">
            {onLinkRequest && (
              <button
                type="button"
                className="button-secondary button-small"
                title="Link this delivery to the request it fulfills"
                onClick={(e) => {
                  e.stopPropagation()
                  onLinkRequest(card)
                }}
              >
                Link request
              </button>
            )}
            {onReply && (
              <button
                type="button"
                className="button-secondary button-small"
                title="Reply — a new handoff routed back"
                onClick={(e) => {
                  e.stopPropagation()
                  onReply(card)
                }}
              >
                Reply
              </button>
            )}
            {onComment && (
              <button
                type="button"
                className="button-secondary button-small"
                title="Comment — thread note, the handoff stays untouched"
                onClick={(e) => {
                  e.stopPropagation()
                  onComment(card)
                }}
              >
                Comment
              </button>
            )}
          </span>
        )}
        {actionsSlot}
      </div>
    </div>
  )
}
