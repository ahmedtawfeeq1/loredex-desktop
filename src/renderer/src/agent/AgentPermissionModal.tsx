/**
 * Agent permission modal (acp blueprint 2026-07-18): raised by an
 * acp.permission CoreEvent, one button per option the adapter offered —
 * built the RecurateDialog way (raw modal classes, custom footer) because
 * the option set is dynamic. Dismissing (Esc / backdrop / ✕) is rejecting:
 * respondPermission(null) → the 'cancelled' outcome. NO default-allow.
 *
 * WP-B: for a client-scoped request with a known tool kind, an 'always allow
 * <kind> for <client>' toggle persists a rule (allow_once semantics) so the same
 * (client, kind) auto-answers next time — the native `allow_always` button, an
 * ACP option, is left as-is and NOT reconciled with our rules (§5.4).
 */
import { useEffect, useState } from 'react'
import type { AcpToolContent } from '../../../shared/ipc-contract'
import { Button, type ButtonVariant } from '../components/Button'
import { useAgentPanel } from '../stores/agentPanel'
import { ToolDiff } from './ToolCallRow'

/** allow_once → primary is applied to the FIRST such option only (one cobalt
 *  primary per view); any duplicate allow_once falls back to secondary. */
const KIND_VARIANT: Record<string, ButtonVariant> = {
  allow_once: 'secondary',
  allow_always: 'secondary',
  reject_once: 'quiet',
  reject_always: 'quiet',
}

export function AgentPermissionModal(): React.JSX.Element | null {
  const permission = useAgentPanel((s) => s.permission)
  const sessions = useAgentPanel((s) => s.sessions)
  const [remember, setRemember] = useState(false)
  // BL-13: the diff starts tall-but-capped; expand shows the whole thing
  const [diffOpen, setDiffOpen] = useState(false)
  // the toggle only makes sense with a client scope AND a tool kind (the rule key)
  const canRemember = Boolean(permission?.clientSlug && permission?.toolKind)

  // a fresh request resets the toggle (never carries a remember across requests)
  useEffect(() => {
    setRemember(false)
    setDiffOpen(false)
  }, [permission?.requestId])

  // Esc rejects; ⌘⏎ picks the first allow_once (mirrors Modal.tsx keys).
  // Capture phase beats App's global handler; App already suppresses registry
  // shortcuts while .modal-backdrop is open.
  useEffect(() => {
    if (!permission) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopPropagation()
        useAgentPanel.getState().respondPermission(null)
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        const allow = permission?.options.find((o) => o.kind === 'allow_once')
        if (allow) {
          e.preventDefault()
          useAgentPanel.getState().respondPermission(allow.optionId, remember)
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [permission, remember])

  if (!permission) return null
  const session = sessions.find((v) => v.sessionId === permission.sessionId)
  const firstAllowOnce = permission.options.findIndex((o) => o.kind === 'allow_once')
  // the proposed change the adapter attached — surface the before/after diff so
  // the user reviews the edit before allowing it (A3). Reuses the A2 ToolDiff.
  const diffs = (permission.content ?? []).filter(
    (c): c is Extract<AcpToolContent, { kind: 'diff' }> => c.kind === 'diff',
  )

  return (
    // biome-ignore lint: backdrop click dismisses = rejects; keyboard path is Esc
    <div
      className="modal-backdrop"
      onMouseDown={() => useAgentPanel.getState().respondPermission(null)}
    >
      <div
        className="modal agent-perm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Agent permission request"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-title agent-perm-title-row">
          Agent permission request
          {permission.clientSlug && (
            <span className="agent-client-chip" title={`Client: ${permission.clientSlug}`}>
              ◈ {permission.clientSlug}
            </span>
          )}
          <button
            type="button"
            className="agent-perm-close"
            title="Dismiss (rejects the request)"
            aria-label="Dismiss (rejects the request)"
            onClick={() => useAgentPanel.getState().respondPermission(null)}
          >
            ✕
          </button>
        </div>
        <div className="modal-row">
          <span className="modal-label">Tool</span>
          <span className="agent-perm-value">{permission.title}</span>
        </div>
        {permission.toolKind && (
          <div className="modal-row">
            <span className="modal-label">Kind</span>
            <span className="agent-perm-value">{permission.toolKind}</span>
          </div>
        )}
        <div className="modal-row">
          <span className="modal-label">Session</span>
          <span className="agent-perm-value">
            {session
              ? `[${session.agent === 'claude' ? 'CC' : 'CX'}] ${session.title}`
              : permission.sessionId.slice(0, 8)}
          </span>
        </div>
        {diffs.length > 0 && (
          // BL-13: the diff is the thing you're actually judging — it gets the
          // room, and expands to full height when a summary isn't enough.
          <div className={`modal-row agent-perm-diff${diffOpen ? ' is-expanded' : ''}`}>
            <span className="modal-label agent-perm-diff-head">
              Proposed change
              <button
                type="button"
                className="agent-perm-diff-toggle"
                aria-expanded={diffOpen}
                title={diffOpen ? 'Collapse the diff' : 'Expand to see the whole diff'}
                onClick={() => setDiffOpen(!diffOpen)}
              >
                {diffOpen ? '▾ collapse' : '▸ expand'}
              </button>
            </span>
            {diffs.map((d, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: diff content is positional, append-only
              <ToolDiff key={i} diff={d} />
            ))}
          </div>
        )}
        <div className="modal-footer agent-perm-actions">
          {/* BL-13: the always-allow toggle belongs ON the decision line, not
              floating in its own centered row above the buttons. */}
          {canRemember && (
            <label className="agent-perm-remember">
              <input
                type="checkbox"
                role="switch"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>
                Always allow <b>{permission.toolKind}</b> for <b>{permission.clientSlug}</b>
              </span>
            </label>
          )}
          <span className="agent-perm-actions-spacer" />
          {permission.options.map((o, i) => (
            <Button
              key={o.optionId}
              className="agent-perm-opt"
              variant={i === firstAllowOnce ? 'primary' : (KIND_VARIANT[o.kind] ?? 'quiet')}
              kbd={i === firstAllowOnce ? '⌘⏎' : undefined}
              title={o.name}
              onClick={() => useAgentPanel.getState().respondPermission(o.optionId, remember)}
            >
              {o.name}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
