/**
 * Right-dock agent panel (acp blueprint 2026-07-18): mounted as the last
 * child inside div.app — the row-axis analog of the terminal drawer's
 * column-axis mount — so the aside docks right across every view. Chat
 * chunks render as plain pre-wrap text (markdown deferred); tool rows are
 * mono machine lines showing tool TITLES only, never raw adapter output.
 * Width is fixed 340 in v1 (persisted field exists, drag deferred).
 */
import { useEffect, useRef, useState } from 'react'
import type { AcpSessionState } from '../../../shared/ipc-contract'
import { Button } from '../components/Button'
import { useAgentPanel, type AcpChatItem, type AcpSessionView } from '../stores/agentPanel'

/** Status = glyph + label, never color alone (design-fidelity law). */
const STATE_CHIP: Record<AcpSessionState, { glyph: string; label: string; cls: string }> = {
  starting: { glyph: '◌', label: 'starting', cls: 'is-start' },
  ready: { glyph: '●', label: 'ready', cls: 'is-ok' },
  auth_required: { glyph: '⚠', label: 'auth', cls: 'is-warn' },
  error: { glyph: '✕', label: 'error', cls: 'is-err' },
  exited: { glyph: '○', label: 'exited', cls: 'is-off' },
}

const TOOL_CHIP: Record<string, { glyph: string; label: string; cls: string }> = {
  pending: { glyph: '·', label: 'pending', cls: 'is-start' },
  in_progress: { glyph: '▸', label: 'running', cls: 'is-ok' },
  completed: { glyph: '✓', label: 'done', cls: 'is-ok' },
  failed: { glyph: '✕', label: 'failed', cls: 'is-err' },
}

function agentTag(agent: 'claude' | 'codex'): string {
  return agent === 'claude' ? 'CC' : 'CX'
}

function SessionRow({ s, active }: { s: AcpSessionView; active: boolean }): React.JSX.Element {
  const chip = STATE_CHIP[s.state]
  return (
    <div className="agent-session-row" aria-current={active ? 'true' : undefined}>
      <button
        type="button"
        className="agent-session-pick session-line-v3"
        title={s.title}
        onClick={() => useAgentPanel.getState().select(s.sessionId)}
      >
        <span className="agent-tag">[{agentTag(s.agent)}]</span> {s.title}
      </button>
      <span className={`agent-state-chip ${chip.cls}`}>
        {chip.glyph} {chip.label}
      </span>
      <button
        type="button"
        className="agent-session-close"
        title="End this session"
        aria-label="End this session"
        onClick={() => void useAgentPanel.getState().closeSession(s.sessionId)}
      >
        ×
      </button>
    </div>
  )
}

function ThreadItem({ item }: { item: AcpChatItem }): React.JSX.Element {
  if (item.type === 'tool') {
    const chip = TOOL_CHIP[item.status] ?? TOOL_CHIP.pending
    return (
      <div className="agent-tool-line" title={item.title}>
        <span className={`agent-state-chip ${chip.cls}`}>
          {chip.glyph} {chip.label}
        </span>
        {item.title}
      </div>
    )
  }
  const cls =
    item.type === 'user'
      ? 'agent-msg agent-msg-user'
      : item.type === 'thought'
        ? 'agent-msg agent-msg-thought'
        : 'agent-msg agent-msg-agent'
  return <div className={cls}>{item.text}</div>
}

/** Inline auth/error card — graceful, never a crash or modal. */
function StateNote({ s }: { s: AcpSessionView }): React.JSX.Element {
  const err = s.state === 'error'
  return (
    <div className={err ? 'agent-state-note is-err' : 'agent-state-note'}>
      <div className="agent-state-note-head">{err ? '✕ error' : '⚠ signed out'}</div>
      {s.detail && <div className="agent-state-note-detail">{s.detail}</div>}
      {!err && (
        <div className="agent-state-note-hint">
          Run `claude /login` (or `codex login`) in the terminal, then start a new session.
        </div>
      )}
    </div>
  )
}

export function AgentPanel(): React.JSX.Element | null {
  const open = useAgentPanel((s) => s.open)
  const width = useAgentPanel((s) => s.width)
  const agent = useAgentPanel((s) => s.agent)
  const sessions = useAgentPanel((s) => s.sessions)
  const activeId = useAgentPanel((s) => s.activeId)
  const active = sessions.find((v) => v.sessionId === activeId) ?? null

  const [draft, setDraft] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  // auto-scroll only while the user is already at the bottom — never yank
  // someone who scrolled up to read
  const stickRef = useRef(true)

  const itemCount = active?.items.length ?? 0
  useEffect(() => {
    const el = threadRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [itemCount, active?.items])

  if (!open) {
    // closed with no sessions → nothing (terminal-drawer precedent);
    // closed with sessions alive → only the reopen tab at the right edge
    if (sessions.length === 0) return null
    return (
      <button
        type="button"
        className="agent-panel-reopen"
        title="Show the agent panel (⌘J)"
        aria-label="Show the agent panel"
        onClick={() => useAgentPanel.getState().toggle()}
      >
        ‹
      </button>
    )
  }

  const canSend = active !== null && active.state === 'ready' && !active.busy

  function submit(): void {
    if (!canSend || !draft.trim()) return
    const text = draft
    setDraft('')
    void useAgentPanel.getState().send(text)
  }

  return (
    <aside className="agent-panel" style={{ width }} aria-label="Agent panel">
      <div className="agent-head">
        <span className="rail-label agent-head-label">AGENT</span>
        <div className="seg-control agent-head-seg" role="group" aria-label="Agent to start">
          {(['claude', 'codex'] as const).map((a) => (
            <button
              key={a}
              type="button"
              className="seg-option"
              aria-pressed={agent === a}
              onClick={() => useAgentPanel.getState().setAgent(a)}
            >
              {a === 'claude' ? 'Claude' : 'Codex'}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="agent-head-btn"
          title="New agent session (vault root)"
          aria-label="New agent session"
          onClick={() => void useAgentPanel.getState().openHere()}
        >
          +
        </button>
        <button
          type="button"
          className="rail-collapse"
          title="Collapse the agent panel (⌘J)"
          aria-label="Collapse the agent panel"
          onClick={() => useAgentPanel.getState().toggle()}
        >
          ›
        </button>
      </div>
      {sessions.length > 0 && (
        <div className="agent-sessions">
          {sessions.map((s) => (
            <SessionRow key={s.sessionId} s={s} active={s.sessionId === activeId} />
          ))}
        </div>
      )}
      <div
        className="agent-thread"
        ref={threadRef}
        onScroll={() => {
          const el = threadRef.current
          if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
        }}
      >
        {active === null ? (
          <div className="agent-empty">No session — press + or “Open agent here” (⌘K).</div>
        ) : (
          <>
            {active.items.map((item, i) => (
              // index keys are safe: the thread is append-only (the last item
              // grows in place, nothing reorders)
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
              <ThreadItem key={i} item={item} />
            ))}
            {(active.state === 'auth_required' || active.state === 'error') && (
              <StateNote s={active} />
            )}
          </>
        )}
      </div>
      {active !== null && active.plan.length > 0 && (
        <div className="agent-plan">
          {active.plan.map((p, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: plans replace wholesale
            <div key={i} className={p.status === 'completed' ? 'agent-plan-line is-done' : 'agent-plan-line'}>
              {p.status === 'completed' ? '✓' : p.status === 'in_progress' ? '▸' : '·'} {p.content}
            </div>
          ))}
        </div>
      )}
      <div className="agent-input">
        <textarea
          className="agent-input-field"
          rows={Math.min(6, draft.split('\n').length)}
          placeholder={canSend ? 'Message the agent…' : 'Needs a ready session'}
          value={draft}
          disabled={!canSend}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // ⌘↵ sends (Modal.tsx convention); Enter inserts a newline
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {active?.busy ? (
          <Button variant="danger" onClick={() => useAgentPanel.getState().cancel()}>
            Stop
          </Button>
        ) : (
          // the panel's ONE cobalt primary (one-per-view law)
          <Button variant="primary" kbd="⌘⏎" disabled={!canSend || !draft.trim()} onClick={submit}>
            Send
          </Button>
        )}
      </div>
    </aside>
  )
}
