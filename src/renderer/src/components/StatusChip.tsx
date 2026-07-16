/**
 * Status chip (DESIGN v3 §4): status = glyph + label, never color alone.
 * Glyph states render a 15px rounded-square tinted box (✓ ready/consumable,
 * ✕ declined, ! stale/drift, – consumed/done/snoozed-muted); OPEN is the
 * brass-free amber ring-dot chip (● OPEN); REQUEST is the info-bordered mono
 * chip. Arbitrary status strings still render (M2 forward-compat) as the
 * muted glyph chip. The 120ms stamp-press animation survives from v2.
 */
interface ChipSpec {
  cls: string
  glyph: string
}

const STATE: Record<string, ChipSpec> = {
  open: { cls: 'chip-open', glyph: '●' },
  request: { cls: 'chip-request', glyph: '' },
  accepted: { cls: 'chip-accepted', glyph: '✓' },
  declined: { cls: 'chip-declined', glyph: '✕' },
  stale: { cls: 'chip-stale', glyph: '!' },
  expired: { cls: 'chip-stale', glyph: '!' },
  consumed: { cls: 'chip-consumed', glyph: '–' },
  done: { cls: 'chip-done', glyph: '–' },
  snoozed: { cls: 'chip-snoozed', glyph: '–' },
}

/** Just the tinted glyph square — RowItem-sized state marker (v3 §4 rows). */
export function StatusGlyph({ status }: { status: string }): React.JSX.Element {
  const spec = STATE[status] ?? { cls: 'chip-consumed', glyph: '–' }
  return (
    <span className={`status-glyph ${spec.cls}`} title={status}>
      <span className="chip-glyph" aria-hidden="true">
        {spec.glyph || '•'}
      </span>
    </span>
  )
}

export function StatusChip({
  status,
  pressed,
}: {
  status: string
  /** stamp-press animation trigger (story 3.4 consume) */
  pressed?: boolean
}): React.JSX.Element {
  const spec = STATE[status] ?? { cls: 'chip-consumed', glyph: '–' }
  return (
    <span className={`status-chip ${spec.cls}${pressed ? ' chip-pressed' : ''}`}>
      {spec.glyph !== '' && (
        <span className="chip-glyph" aria-hidden="true">
          {spec.glyph}
        </span>
      )}
      {status}
    </span>
  )
}
