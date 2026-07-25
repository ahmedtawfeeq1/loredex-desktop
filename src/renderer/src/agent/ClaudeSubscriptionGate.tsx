/**
 * The Claude-on-subscription guardrail.
 *
 * Anthropic's Consumer Terms (Feb 2026) prohibit using a Pro/Max subscription
 * OAuth token in any third-party product — including the Agent SDK loredex
 * drives. A Claude session with no ANTHROPIC_API_KEY authenticates with exactly
 * that consumer login, so before the FIRST such session this warns and requires
 * a typed acknowledgment. An API key, or a prior acknowledgment, never sees this.
 *
 * The phrase is deliberately a short sentence the user must type by hand — a
 * button alone is a reflex click; typing "use my subscription" is a small,
 * conscious act of consent, and it is recorded once (per device) so it never
 * nags again. Codex and Gemini are not gated.
 */
import { useEffect, useState } from 'react'
import { Button } from '../components/Button'
import { useAgentPanel } from '../stores/agentPanel'

/** Three words, meaningful, must be typed verbatim (case/space-insensitive). */
const PHRASE = 'use my subscription'
const normalize = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function ClaudeSubscriptionGate(): React.JSX.Element | null {
  const gate = useAgentPanel((s) => s.claudeGate)
  const [typed, setTyped] = useState('')
  // reset the field each time the gate is (re)raised
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset per raise
  useEffect(() => setTyped(''), [gate])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') useAgentPanel.getState().cancelClaudeGate()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!gate) return null
  const ok = normalize(typed) === PHRASE

  return (
    // biome-ignore lint/a11y: backdrop click-away cancels; Esc bound above
    <div
      className="ctx-menu-backdrop cs-gate-backdrop"
      onMouseDown={() => useAgentPanel.getState().cancelClaudeGate()}
    >
      <div className="cs-gate" role="alertdialog" aria-label="Claude subscription warning" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cs-gate-head">
          <span className="cs-gate-glyph" aria-hidden="true">
            ⚠
          </span>
          <span className="cs-gate-title">Running Claude on your subscription</span>
        </div>
        <p className="cs-gate-body">
          No Anthropic <b>API key</b> is set, so this Claude session would sign in with your{' '}
          <b>Pro/Max subscription</b>. Anthropic's Consumer Terms{' '}
          <b>prohibit using a subscription login in a third-party app like loredex</b> — it can lead
          to your request being blocked or your account suspended.
        </p>
        <p className="cs-gate-body">
          The safe path is an <b>API key</b> (billed per token): add one under{' '}
          <span className="mono">Settings › AI providers</span> and this warning disappears.{' '}
          <b>Codex and Gemini are unaffected.</b>
        </p>
        <label className="cs-gate-field">
          <span>
            To use your subscription anyway and accept the risk, type <b>{PHRASE}</b>:
          </span>
          <input
            className="settings-input"
            // biome-ignore lint/a11y/noAutofocus: single-purpose consent field
            autoFocus
            placeholder={PHRASE}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ok) void useAgentPanel.getState().approveClaudeGate()
            }}
          />
        </label>
        <div className="cs-gate-actions">
          <Button variant="secondary" onClick={() => useAgentPanel.getState().cancelClaudeGate()}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!ok}
            title={ok ? undefined : `Type “${PHRASE}” to confirm`}
            onClick={() => void useAgentPanel.getState().approveClaudeGate()}
          >
            I accept — use my subscription
          </Button>
        </div>
      </div>
    </div>
  )
}
