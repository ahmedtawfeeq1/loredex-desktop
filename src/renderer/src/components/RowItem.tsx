/**
 * List row primitive (DESIGN v3 §4): 40px two-line anatomy — glyph left,
 * title 12.5/550 over a mono sub line (--text-3), trailing meta right,
 * hover --bg-hover, selected = 2px cobalt left bar. Never color alone:
 * the glyph slot carries the state, the title carries the words.
 */
export function RowItem({
  title,
  sub,
  glyph,
  trailing,
  selected = false,
  dimmed = false,
  onActivate,
}: {
  title: React.ReactNode
  /** mono machine-fact sub line (route, date, id, path) */
  sub?: React.ReactNode
  /** leading glyph slot — a StatusChip glyph, emoji, or small icon */
  glyph?: React.ReactNode
  /** trailing slot — avatar, time, count */
  trailing?: React.ReactNode
  selected?: boolean
  /** terminal states render at 60% (reference 02 declined/consumed rows) */
  dimmed?: boolean
  onActivate?: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`row-item${dimmed ? ' is-dim' : ''}`}
      aria-current={selected ? 'true' : undefined}
      onClick={onActivate}
    >
      {glyph !== undefined && (
        <span className="row-glyph" aria-hidden="true">
          {glyph}
        </span>
      )}
      <span className="row-main">
        <span className="row-title">{title}</span>
        {sub !== undefined && <span className="row-sub">{sub}</span>}
      </span>
      {trailing !== undefined && <span className="row-trailing">{trailing}</span>}
    </button>
  )
}
