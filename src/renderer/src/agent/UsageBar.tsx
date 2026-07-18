/**
 * UsageBar (acp A4): a slim per-session telemetry strip in the panel header —
 * a context-window fill meter (used / size) plus a cumulative token/cost line.
 * The glyph + numeric label carry the signal; the bar is a redundant visual
 * (design law: status is glyph+label, never color alone), and the fill stays
 * a neutral --info so the panel's ONE cobalt primary remains the Send button.
 * Renders NOTHING unless usage.context exists — codex may report no usage, and
 * an empty meter helps nobody.
 */
import type { AcpSessionView } from '../stores/agentPanel'

const fmt = (n: number): string => n.toLocaleString()

function fmtCost({ amount, currency }: { amount: number; currency: string }): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 4,
    }).format(amount)
  } catch {
    // unknown/non-ISO currency code — fall back to a bare figure + code
    return `${amount} ${currency}`
  }
}

export function UsageBar({ usage }: { usage?: AcpSessionView['usage'] }): React.JSX.Element | null {
  const ctx = usage?.context
  if (!ctx || ctx.size <= 0) return null
  const pct = Math.min(100, Math.max(0, Math.round((ctx.used / ctx.size) * 100)))
  const turn = usage?.turn
  const cost = usage?.cost

  return (
    <div className="agent-usage">
      <div
        className="agent-usage-meter"
        role="img"
        aria-label={`Context window: ${fmt(ctx.used)} of ${fmt(ctx.size)} tokens (${pct}%)`}
      >
        <span className="agent-usage-glyph" aria-hidden="true">
          ▣
        </span>
        <span className="agent-usage-label">context</span>
        <span className="agent-usage-track">
          <span className="agent-usage-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="agent-usage-num">
          {fmt(ctx.used)} / {fmt(ctx.size)}
        </span>
        <span className="agent-usage-pct">{pct}%</span>
      </div>
      {(turn || cost) && (
        <div className="agent-usage-turn">
          {turn && (
            <>
              <span className="agent-usage-glyph" aria-hidden="true">
                Σ
              </span>
              <span className="agent-usage-label">tokens</span>
              <span className="agent-usage-num">{fmt(turn.total)}</span>
              <span className="agent-usage-tok" title="input tokens">
                ↑ {fmt(turn.input)}
              </span>
              <span className="agent-usage-tok" title="output tokens">
                ↓ {fmt(turn.output)}
              </span>
              {turn.cached !== undefined && (
                <span className="agent-usage-tok" title="cached (read) tokens">
                  ⚡ {fmt(turn.cached)}
                </span>
              )}
              {turn.thought !== undefined && (
                <span className="agent-usage-tok" title="reasoning tokens">
                  … {fmt(turn.thought)}
                </span>
              )}
            </>
          )}
          {cost && (
            <span className="agent-usage-cost" title="session cost">
              {fmtCost(cost)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
