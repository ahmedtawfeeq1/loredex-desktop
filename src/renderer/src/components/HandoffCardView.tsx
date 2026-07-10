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
        {(onReply || onComment) && (
          <span className="handoff-actions">
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
