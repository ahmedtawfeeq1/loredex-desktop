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
import { pathForFile } from '../api'
import { Button } from '../components/Button'
import {
  lastUserText,
  useAgentPanel,
  visibleSessions,
  type AcpChatItem,
  type AcpSessionView,
  type AgentAttachment,
  type ProviderAuth,
} from '../stores/agentPanel'
import { AgentLoginCard } from './AgentLoginCard'
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
  gemini: { label: 'Gemini', tag: 'GM' },
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

/** B4: a File's bytes as raw base64 (the "data:<mime>;base64," prefix stripped)
 *  for an image attachment that rides the prompt JSON. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = typeof reader.result === 'string' ? reader.result : ''
      resolve(res.slice(res.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** B4 attachment tray: the staged attachments as removable chips above the
 *  composer (🖼 image · 📄 file). Kind is a glyph, not color alone. */
function AttachmentTray({ items }: { items: AgentAttachment[] }): React.JSX.Element {
  return (
    <div className="agent-attach-tray" role="list" aria-label="Attachments">
      {items.map((a, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: staged list, remove-by-index
        <span
          key={i}
          className="agent-attach-chip"
          role="listitem"
          title={a.type === 'resource' ? a.path : a.name}
        >
          <span className="agent-attach-kind" aria-hidden="true">
            {a.type === 'image' ? '🖼' : '📄'}
          </span>
          <span className="agent-attach-name">{a.name}</span>
          <button
            type="button"
            className="agent-attach-remove"
            aria-label={`Remove ${a.name}`}
            onClick={() => useAgentPanel.getState().removeAttachment(i)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
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

/** Copy control (chat-completeness COPY): writes `text` to the clipboard with a
 *  brief "Copied" acknowledgement (glyph + word, never color alone). Same
 *  navigator.clipboard.writeText the settings device-flow uses. */
function CopyButton({
  text,
  className,
  label,
}: {
  text: string
  className: string
  label: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={className}
      title={label}
      aria-label={label}
      onClick={() => {
        try {
          void navigator.clipboard?.writeText(text)
        } catch {
          // no clipboard (node/test) — best-effort, never throw
        }
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
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
  // user bubble: sanitized, syntax-highlighted markdown (no copy button — the
  // user wrote it; fenced code inside still gets its own copy affordance)
  if (item.type === 'user') {
    return <div className="agent-msg agent-msg-user agent-md">{renderAgentMarkdown(item.text)}</div>
  }
  // agent bubble: markdown + a hover copy button (COPY: raw markdown of the reply)
  return (
    <div className="agent-msg agent-msg-agent agent-md">
      {renderAgentMarkdown(item.text)}
      <CopyButton text={item.text} className="agent-copy-msg" label="Copy message" />
    </div>
  )
})

/** B2 cross-provider continuation (the killer feature): continue the ACTIVE
 *  conversation in a DIFFERENT provider. One button per provider that isn't the
 *  active session's current agent; clicking runs agent.continue (a new session
 *  bound to the SAME transcript), never a fresh openHere. Rendered only for a
 *  session with a persisted conversation (conversationId) — a no-db session has
 *  no transcript to carry. NOT a cobalt primary (Send owns the one-per-view). */
function ContinueControl({ active }: { active: AcpSessionView }): React.JSX.Element | null {
  if (!active.conversationId) return null
  const others = AGENTS.filter((a) => a !== active.agent)
  if (others.length === 0) return null
  return (
    <div
      className="agent-continue"
      role="group"
      aria-label="Continue this conversation in another agent"
    >
      <span className="agent-continue-label">Continue in</span>
      {others.map((a) => (
        <button
          key={a}
          type="button"
          className="agent-continue-btn"
          title={`Continue this conversation in ${AGENT_META[a].label} (carries the transcript)`}
          aria-label={`Continue in ${AGENT_META[a].label}`}
          onClick={() => void useAgentPanel.getState().continueIn(a)}
        >
          <span className="agent-tag">[{agentTag(a)}]</span> {AGENT_META[a].label}
        </button>
      ))}
    </div>
  )
}

/** Inline auth/error card — graceful, never a crash or modal. */
function StateNote({ s }: { s: AcpSessionView }): React.JSX.Element {
  const err = s.state === 'error'
  return (
    <div className={err ? 'agent-state-note is-err' : 'agent-state-note'}>
      <div className="agent-state-note-head">{err ? '✕ error' : '⚠ signed out'}</div>
      {s.detail && <div className="agent-state-note-detail">{s.detail}</div>}
      {!err && <AgentLoginCard agent={s.agent} />}
    </div>
  )
}

export function AgentPanel(): React.JSX.Element | null {
  const open = useAgentPanel((s) => s.open)
  const width = useAgentPanel((s) => s.width)
  const filter = useAgentPanel((s) => s.filter)
  const providerAuth = useAgentPanel((s) => s.providerAuth)
  const popout = useAgentPanel((s) => s.popout)
  const sessions = useAgentPanel((s) => s.sessions)
  const activeId = useAgentPanel((s) => s.activeId)
  const active = sessions.find((v) => v.sessionId === activeId) ?? null
  // filter narrows only the list; the active thread below is found from the
  // full list, so a filtered-out active session still shows its conversation
  const shown = visibleSessions(sessions, filter)

  // draft lives in the store (A8) so addContext (add-to-chat) can pre-fill it
  const draft = useAgentPanel((s) => s.draft)
  // staged attachments (B4) live in the store so paste + the picker share them
  const attachments = useAgentPanel((s) => s.attachments)
  const threadRef = useRef<HTMLDivElement>(null)
  // auto-scroll only while the user is already at the bottom — never yank
  // someone who scrolled up to read
  const stickRef = useRef(true)
  // state twin of stickRef (chat-completeness JUMP): stickRef is a ref (no
  // re-render), so mirror it into state to drive the jump-to-newest button's
  // visibility. true = pinned to bottom → button hidden.
  const [atBottom, setAtBottom] = useState(true)

  const itemCount = active?.items.length ?? 0
  useEffect(() => {
    const el = threadRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [itemCount, active?.items])

  const canSend = active !== null && active.state === 'ready' && !active.busy
  const hasContent = draft.trim().length > 0 || attachments.length > 0
  // chat-completeness RETRY: offered only when the session is idle AND there is
  // a prior user turn with resendable text (an attachment-only turn strips to '')
  const retryText = active ? lastUserText(active.items) : null
  const canRetry = canSend && retryText !== null && retryText.trim().length > 0

  // B4 attach: paste (ClipboardEvent images/files) + an attach button that opens
  // a hidden file input; images ride as base64, other files as their real path
  // (webUtils.getPathForFile — the adapter reads it, no `fs` client capability).
  // URLs paste as plain text (default textarea behavior — no special handling).
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachNotice, setAttachNotice] = useState<string | null>(null)

  function submit(): void {
    if (!canSend || !hasContent) return
    const text = draft
    useAgentPanel.getState().setDraft('')
    setAttachNotice(null)
    // send reads (and clears) the staged attachments from the store
    void useAgentPanel.getState().send(text)
  }

  async function ingestFiles(files: File[]): Promise<void> {
    let imageBlocked = false
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        // gate on the active session's advertised image capability: a known
        // false blocks with a notice; undefined (not yet ready) allows
        // optimistically — the core drops it defensively if still unsupported
        if (active?.imageInput === false) {
          imageBlocked = true
          continue
        }
        try {
          const dataB64 = await fileToBase64(file)
          useAgentPanel.getState().addAttachment({
            type: 'image',
            mimeType: file.type || 'image/png',
            dataB64,
            name: file.name || 'pasted image',
          })
        } catch {
          // unreadable clipboard image — skip it silently, never crash the paste
        }
      } else {
        let path = ''
        try {
          path = pathForFile(file)
        } catch {
          path = '' // no bridge / not a real file — can't attach a path
        }
        if (!path) continue
        useAgentPanel
          .getState()
          .addAttachment({ type: 'resource', path, name: file.name || path })
      }
    }
    const label = active ? AGENT_META[active.agent].label : 'This agent'
    setAttachNotice(imageBlocked ? `${label} doesn’t accept image attachments.` : null)
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>): void {
    const files = Array.from(e.clipboardData.files)
    if (files.length === 0) return // plain text / URL → default paste inserts it
    e.preventDefault() // handling the files ourselves — don't also paste their names
    void ingestFiles(files)
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>): void {
    void ingestFiles(Array.from(e.target.files ?? []))
    e.target.value = '' // reset so re-picking the same file fires change again
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

  // Early return placed AFTER every hook above (Rules of Hooks): a conditional
  // return ahead of the hooks changes the hook count between the closed and open
  // renders (13 → 21) and unmounts the whole tree with "Rendered more hooks than
  // during the previous render". All hooks are declared unconditionally; only the
  // rendered output branches on `open`.
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
        {active?.conversationId && (
          // B3 pop-out: hand the active conversation to its OWN standalone window
          // (its own core, same vault app.db → resumed from the transcript).
          // Shown only for a session with a persisted conversation to carry.
          <button
            type="button"
            className="agent-head-btn"
            title="Pop out this conversation into its own window (⇧⌘O)"
            aria-label="Pop out this conversation"
            onClick={() => void useAgentPanel.getState().popOut()}
          >
            ⧉
          </button>
        )}
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
      {popout && (
        // B3 single-port limitation (see main/index.ts open-agent): this pop-out
        // is a secondary window, so its core can't claim the one fixed in-app
        // MCP port — the popped-out session runs without the loredex MCP tools.
        <div className="agent-popout-note" role="note">
          ⧉ Popped-out window — the in-app MCP server binds one port claimed by the
          main window, so this conversation has no loredex MCP tools here.
        </div>
      )}
      {shown.length > 0 && (
        <div className="agent-sessions">
          {shown.map((s) => (
            <SessionRow key={s.sessionId} s={s} active={s.sessionId === activeId} />
          ))}
        </div>
      )}
      {active !== null && <ContinueControl active={active} />}
      {active !== null && <UsageBar usage={active.usage} authMode={active.authMode} />}
      {active !== null && <SessionInfoPanel session={active} />}
      <div
        className="agent-thread"
        ref={threadRef}
        onScroll={() => {
          const el = threadRef.current
          if (!el) return
          const stuck = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          stickRef.current = stuck
          setAtBottom(stuck)
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
        {active !== null && !atBottom && (
          // chat-completeness JUMP: a sticky pill pinned to the bottom of the
          // thread viewport, shown only while scrolled up — click scrolls to the
          // newest message and re-arms auto-scroll.
          <button
            type="button"
            className="agent-jump-bottom"
            title="Jump to newest"
            aria-label="Jump to newest message"
            onClick={() => {
              const el = threadRef.current
              if (!el) return
              el.scrollTop = el.scrollHeight
              stickRef.current = true
              setAtBottom(true)
            }}
          >
            ↓ Newest
          </button>
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
      {attachments.length > 0 && <AttachmentTray items={attachments} />}
      {attachNotice && (
        <div className="agent-attach-notice" role="note">
          ⚠ {attachNotice}
        </div>
      )}
      {active !== null && (
        // chat-completeness NEW + RETRY: conversation-level actions above the
        // composer. "New conversation" is the labeled twin of the header + icon
        // (both reuse openHere — a new session IS a fresh transcript, B0);
        // Retry re-sends the last user turn. Hairline text buttons, never the
        // cobalt primary (Send owns the one-per-view).
        <div className="agent-composer-tools" role="group" aria-label="Conversation actions">
          <button
            type="button"
            className="agent-new-convo"
            title="Start a new conversation (a fresh session at the vault root)"
            aria-label="New conversation"
            onClick={() => void useAgentPanel.getState().openHere()}
          >
            ＋ New conversation
          </button>
          {canRetry && (
            <button
              type="button"
              className="agent-retry-btn"
              title="Re-send the last message"
              aria-label="Retry last message"
              onClick={() => void useAgentPanel.getState().retry()}
            >
              ↻ Retry
            </button>
          )}
        </div>
      )}
      <div className="agent-input">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="agent-attach-input"
          aria-hidden="true"
          tabIndex={-1}
          onChange={onPickFiles}
        />
        <button
          type="button"
          className="agent-attach-btn"
          title="Attach files or images"
          aria-label="Attach files or images"
          disabled={!canSend}
          onClick={() => fileInputRef.current?.click()}
        >
          📎
        </button>
        <textarea
          ref={inputRef}
          className="agent-input-field"
          rows={Math.min(6, draft.split('\n').length)}
          placeholder={canSend ? 'Message the agent…  (↵ send · ⇧↵ newline)' : 'Needs a ready session'}
          value={draft}
          disabled={!canSend}
          onPaste={onPaste}
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
          <Button variant="primary" kbd="↵" disabled={!canSend || !hasContent} onClick={submit}>
            Send
          </Button>
        )}
      </div>
    </aside>
  )
}
