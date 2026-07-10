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
  consumeSlot,
  pressed,
  onReply,
  onComment,
}: {
  card: HandoffCard
  onOpen: (card: HandoffCard) => void
  /** ⌘⏎ on the focused card (story 3.4); the visible button lives in consumeSlot */
  onConsume?: (card: HandoffCard) => void
  /** story 3.4 mounts the consume action here; 3.6 will add the read-state dot */
  consumeSlot?: React.ReactNode
  /** stamp-press animation trigger (story 3.4) */
  pressed?: boolean
  /** story 7.3: thread actions — secondary pills, the gold primary stays with consume */
  onReply?: (card: HandoffCard) => void
  onComment?: (card: HandoffCard) => void
}): React.JSX.Element {
  const notes = card.readingOrder.length
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
        <span className="handoff-route">
          {card.from} ⟶ {card.to}
        </span>
        <span className="handoff-date">{card.date || formatAge(card.ageDays)}</span>
      </div>
      <p className="handoff-objective">{card.objective || card.name}</p>
      <div className="handoff-foot">
        <span>
          {notes === 1 ? '1 note' : `${notes} notes`} · {formatAge(card.ageDays)}
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
        {consumeSlot}
      </div>
    </div>
  )
}
