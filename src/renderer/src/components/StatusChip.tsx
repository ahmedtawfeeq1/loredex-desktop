/**
 * Stamp chip (DESIGN.md signature): 10px mono uppercase, 1px border in state
 * color, transparent fill — a rubber stamp, not a pill. Renders arbitrary
 * status strings so M2 states drop in without rework (story 3.2 dev note).
 */
const STATE_CLASS: Record<string, string> = {
  open: 'chip-open',
  consumed: 'chip-consumed',
  stale: 'chip-stale',
}

export function StatusChip({
  status,
  pressed,
}: {
  status: string
  /** stamp-press animation trigger (story 3.4 consume) */
  pressed?: boolean
}): React.JSX.Element {
  const stateClass = STATE_CLASS[status] ?? 'chip-consumed'
  return (
    <span className={`status-chip ${stateClass}${pressed ? ' chip-pressed' : ''}`}>{status}</span>
  )
}
