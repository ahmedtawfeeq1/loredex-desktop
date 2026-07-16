/**
 * Agent presence chip (DESIGN v3 §4): pill with the sacred green live dot
 * (glow + pulse; reduced-motion renders it static via the global rule),
 * agent name at 600, mono meta (machine fact). Green is agents-only — this
 * chip is the ONLY place the live treatment ships from.
 */
export function AgentChip({
  name,
  meta,
  live = false,
}: {
  name: string
  /** mono machine-fact line, e.g. "claude · 2m ago" */
  meta?: string
  live?: boolean
}): React.JSX.Element {
  return (
    <span className="agent-chip">
      <span
        className={`agent-dot${live ? ' agent-dot-live' : ''}`}
        aria-hidden="true"
      />
      <span className="agent-name">{name}</span>
      {meta !== undefined && <span className="agent-meta">{meta}</span>}
      <span className="sr-only">{live ? 'live' : 'idle'}</span>
    </span>
  )
}
