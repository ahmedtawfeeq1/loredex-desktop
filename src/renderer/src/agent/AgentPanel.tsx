/**
 * Right-dock agent panel (acp blueprint 2026-07-18): mounted as the last
 * child inside div.app — the row-axis analog of the terminal drawer's
 * column-axis mount — so the aside docks right across every view. Chat
 * bubbles render sanitized, syntax-highlighted markdown (agent/agentMarkdown);
 * thinking is a dimmed collapsible; tool rows are mono machine lines (ToolCallRow)
 * that expand to before/after diffs + clickable file-refs when output arrives.
 * Width drags 280–480 via the left-edge PanelResizeHandle (persisted).
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { AcpAgent, AcpSessionState } from '../../../shared/ipc-contract'
import { Button } from '../components/Button'
import {
  useAgentPanel,
  visibleSessions,
  type AcpChatItem,
  type AcpSessionView,
  type ProviderAuth,
} from '../stores/agentPanel'
import { renderAgentMarkdown } from './agentMarkdown'
import { PanelResizeHandle } from './PanelResizeHandle'
import { SessionInfoPanel } from './SessionInfoPanel'
import { SlashCommandMenu } from './SlashCommandMenu'
import { filterCommands, slashQuery } from './slashCommands'
import { ToolCallRow } from './ToolCallRow'
import { UsageBar } from './UsageBar'

/** Status = glyph + label, never color alone (design-fidelity law). */
const STATE_CHIP: Record<AcpSessionState, { glyph: string; label: string; cls: string }> = {
  starting: { glyph: '◌', label: 'starting', cls: 'is-start' },
  ready: { glyph: '●', label: 'ready', cls: 'is-ok' },
  auth_required: { glyph: '⚠', label: 'auth', cls: 'is-warn' },
  error: { glyph: '✕', label: 'error', cls: 'is-err' },
  exited: { glyph: '○', label: 'exited', cls: 'is-off' },
}

/** Per-provider display metadata. A Record over the AcpAgent union — the ONE
 *  place providers are enumerated for the UI, so a Phase-2 provider (gemini)
 *  is a compile error until listed and then rides the picker automatically
 *  (no literal ['claude','codex'] tuple to forget). */
const AGENT_META: Record<AcpAgent, { label: string; tag: string }> = {
  claude: { label: 'Claude', tag: 'CC' },
  codex: { label: 'Codex', tag: 'CX' },
}
const AGENTS = Object.keys(AGENT_META) as AcpAgent[]

/** Login-state auth dot — glyph shape differs per state (never color alone):
 *  ○ not started · ● signed in · ⚠ needs login. Full label rides the chip's
 *  accessible name + tooltip. */
const AUTH_DOT: Record<ProviderAuth, { glyph: string; label: string; cls: string }> = {
  unknown: { glyph: '○', label: 'not started', cls: 'is-off' },
  ok: { glyph: '●', label: 'signed in', cls: 'is-ok' },
  auth_required: { glyph: '⚠', label: 'needs login', cls: 'is-warn' },
}

function agentTag(agent: AcpAgent): string {
  return AGENT_META[agent].tag
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

/** One thread bubble. Memoized because commitChunks preserves the object
 *  reference of every SETTLED item and only replaces the growing last one, so
 *  memo skips re-parsing markdown for the whole backlog on each streaming rAF
 *  frame — only the live bubble re-renders (the plan's per-item memo, achieved
 *  by reference equality instead of a hand-rolled key). */
export const ThreadItem = memo(function ThreadItem({ item }: { item: AcpChatItem }): React.JSX.Element {
  if (item.type === 'tool') {
    return <ToolCallRow item={item} />
  }
  // thinking: dimmed, collapsed by default — reasoning shouldn't crowd the reply
  if (item.type === 'thought') {
    return (
      <details className="agent-msg agent-msg-thought agent-thought">
        <summary className="agent-thought-summary">Thinking</summary>
        <div className="agent-md">{renderAgentMarkdown(item.text)}</div>
      </details>
    )
  }
  // user + agent bubbles: sanitized, syntax-highlighted markdown
  const cls =
    item.type === 'user' ? 'agent-msg agent-msg-user agent-md' : 'agent-msg agent-msg-agent agent-md'
  return <div className={cls}>{renderAgentMarkdown(item.text)}</div>
})

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
  const filter = useAgentPanel((s) => s.filter)
  const providerAuth = useAgentPanel((s) => s.providerAuth)
  const sessions = useAgentPanel((s) => s.sessions)
  const activeId = useAgentPanel((s) => s.activeId)
  const active = sessions.find((v) => v.sessionId === activeId) ?? null
  // filter narrows only the list; the active thread below is found from the
  // full list, so a filtered-out active session still shows its conversation
  const shown = visibleSessions(sessions, filter)

  // draft lives in the store (A8) so addContext (add-to-chat) can pre-fill it
  const draft = useAgentPanel((s) => s.draft)
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
    useAgentPanel.getState().setDraft('')
    void useAgentPanel.getState().send(text)
  }

  // Slash-command autocomplete (the agent's advertised commands, A7). The menu
  // opens while the draft is a bare `/token`; picking inserts `/name ` (the
  // trailing space closes the menu) and the user adds args + sends normally.
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [slashSel, setSlashSel] = useState(0)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const query = slashQuery(draft)
  const slashMatches = useMemo(
    () => (query !== null && active?.commands ? filterCommands(active.commands, query) : []),
    [query, active?.commands],
  )
  const slashOpen = slashMatches.length > 0 && !slashDismissed
  // reset selection as the match set shifts; re-arm the menu once the draft
  // leaves slash mode so a later `/` reopens it
  useEffect(() => {
    setSlashSel(0)
  }, [query])
  useEffect(() => {
    if (query === null) setSlashDismissed(false)
  }, [query])

  function pickSlash(name: string): void {
    useAgentPanel.getState().setDraft(`/${name} `)
    setSlashDismissed(true)
    inputRef.current?.focus()
  }

  return (
    <aside className="agent-panel" style={{ width }} aria-label="Agent panel">
      <PanelResizeHandle />
      <div className="agent-head">
        <span className="rail-label agent-head-label">AGENT</span>
        <div
          className="seg-control agent-head-seg"
          role="group"
          aria-label="Filter sessions and pick the agent to start"
        >
          <button
            type="button"
            className="seg-option"
            aria-pressed={filter === 'all'}
            title="Show every provider's sessions"
            onClick={() => useAgentPanel.getState().setFilter('all')}
          >
            All
          </button>
          {AGENTS.map((a) => {
            // one chip per provider (union-driven — gemini drops in for free):
            // picking it filters the list to that provider AND makes it the
            // agent the + button starts. The auth dot shows its login state.
            const dot = AUTH_DOT[providerAuth[a]]
            return (
              <button
                key={a}
                type="button"
                className="seg-option agent-provider-opt"
                aria-pressed={filter === a}
                aria-label={`${AGENT_META[a].label} — ${dot.label}`}
                title={`${AGENT_META[a].label} — ${dot.label}`}
                onClick={() => {
                  const st = useAgentPanel.getState()
                  st.setFilter(a)
                  st.setAgent(a)
                }}
              >
                <span className={`agent-auth-dot ${dot.cls}`} aria-hidden="true">
                  {dot.glyph}
                </span>
                {AGENT_META[a].label}
              </button>
            )
          })}
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
      {shown.length > 0 && (
        <div className="agent-sessions">
          {shown.map((s) => (
            <SessionRow key={s.sessionId} s={s} active={s.sessionId === activeId} />
          ))}
        </div>
      )}
      {active !== null && <UsageBar usage={active.usage} authMode={active.authMode} />}
      {active !== null && <SessionInfoPanel session={active} />}
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
      {slashOpen && (
        <SlashCommandMenu
          items={slashMatches}
          selected={slashSel}
          onHover={setSlashSel}
          onPick={pickSlash}
        />
      )}
      <div className="agent-input">
        <textarea
          ref={inputRef}
          className="agent-input-field"
          rows={Math.min(6, draft.split('\n').length)}
          placeholder={canSend ? 'Message the agent…  (↵ send · ⇧↵ newline)' : 'Needs a ready session'}
          value={draft}
          disabled={!canSend}
          onChange={(e) => useAgentPanel.getState().setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Shift+↵ inserts a newline (chat convention); everything else on
            // Enter sends. ⌘/Ctrl+↵ always sends, even with the slash menu open.
            if (e.key === 'Enter' && e.shiftKey) return
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
              return
            }
            // slash menu steals nav keys while open
            if (slashOpen) {
              const n = slashMatches.length
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSlashSel((s) => (s + 1) % n)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSlashSel((s) => (s - 1 + n) % n)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                // Enter/Tab picks the highlighted command
                e.preventDefault()
                pickSlash(slashMatches[slashSel].name)
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setSlashDismissed(true)
                return
              }
            }
            // plain ↵ (menu closed) sends
            if (e.key === 'Enter') {
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
          <Button variant="primary" kbd="↵" disabled={!canSend || !draft.trim()} onClick={submit}>
            Send
          </Button>
        )}
      </div>
    </aside>
  )
}
