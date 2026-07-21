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
import type { AcpAgent, AcpConvSummary, AcpSessionState } from '../../../shared/ipc-contract'
import { invoke, pathForFile } from '../api'
import { Button } from '../components/Button'
import {
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
import {
  filterCommands,
  recognizedCommands,
  removeCommand,
  slashQuery,
} from './slashCommands'
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
/** exported so other surfaces (e.g. the client page's Chat Here picker) name the
 *  providers exactly the way the panel does — one source of truth. */
export const AGENT_META: Record<AcpAgent, { label: string; tag: string }> = {
  claude: { label: 'Claude', tag: 'CC' },
  codex: { label: 'Codex', tag: 'CX' },
  gemini: { label: 'Gemini', tag: 'GM' },
}
export const AGENTS = Object.keys(AGENT_META) as AcpAgent[]

/** Small monochrome provider mark (currentColor, theme-safe): Claude = the
 *  Anthropic burst, Codex = the OpenAI knot ring, Gemini = the 4-point spark. */
function ProviderMark({ agent, size = 13 }: { agent: AcpAgent; size?: number }): React.JSX.Element {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true } as const
  if (agent === 'claude') {
    return (
      <svg {...common} fill="currentColor">
        <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1M12 3.5l1.6 6.9 6.9 1.6-6.9 1.6L12 20.5l-1.6-6.9L3.5 12l6.9-1.6z" />
      </svg>
    )
  }
  if (agent === 'gemini') {
    return (
      <svg {...common} fill="currentColor">
        <path d="M12 2c.6 5.2 4.8 9.4 10 10-5.2.6-9.4 4.8-10 10-.6-5.2-4.8-9.4-10-10 5.2-.6 9.4-4.8 10-10z" />
      </svg>
    )
  }
  // codex / OpenAI — a simple knotted ring approximation
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v16M4 12h16" strokeWidth="1.4" />
    </svg>
  )
}

/** WP-A: the ◈ client-scope chip — shown when a session/conversation runs under
 *  an agent-ops client (`projects/<slug>/`). Absent for vault-root/research. */
function ClientChip({ slug }: { slug?: string | null }): React.JSX.Element | null {
  if (!slug) return null
  return (
    <span className="agent-client-chip" title={`Client: ${slug}`}>
      ◈ {slug}
    </span>
  )
}

function relTime(iso: string, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

/** History dropdown: the clock button + a menu of persisted conversations
 *  (agent.conv.list, newest first). Persisted in the vault's app.db, so it
 *  survives restarts. Click a row → reopen it in this panel. */
function ConvHistoryMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [convs, setConvs] = useState<AcpConvSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const refresh = (): void => {
    setConvs(null)
    void invoke('agent.conv.list', { limit: 200 })
      .then(setConvs)
      .catch(() => setConvs([]))
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload each open
  useEffect(() => {
    if (!open) {
      setQuery('')
      setRenaming(null)
      setConfirmDel(null)
      return
    }
    refresh()
  }, [open])

  const filtered = (convs ?? []).filter((c) =>
    (c.title ?? 'Untitled conversation').toLowerCase().includes(query.trim().toLowerCase()),
  )

  async function rename(id: string, title: string): Promise<void> {
    await invoke('agent.conv.rename', { conversationId: id, title }).catch(() => {})
    setRenaming(null)
    refresh()
  }
  async function del(id: string): Promise<void> {
    await invoke('agent.conv.delete', { conversationId: id }).catch(() => {})
    setConfirmDel(null)
    refresh()
  }

  return (
    <div className="agent-history">
      <button
        type="button"
        className="agent-head-btn"
        title="Conversation history"
        aria-label="Conversation history"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {/* clock glyph */}
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 4.5V8l2.4 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        // biome-ignore lint/a11y: menu closes on backdrop click; rows are buttons
        <>
          <div className="agent-history-backdrop" onMouseDown={() => setOpen(false)} />
          <div className="agent-history-menu" role="menu">
            <div className="agent-history-title">History · this device</div>
            <input
              className="agent-history-search"
              placeholder="Search conversations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {convs === null ? (
              <div className="agent-history-empty">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="agent-history-empty">
                {convs.length === 0 ? 'No past conversations yet.' : 'No matches.'}
              </div>
            ) : (
              filtered.map((c) => (
                <div key={c.id} className="agent-history-row">
                  <span className="agent-history-mark">
                    <ProviderMark agent={c.lastProvider} size={12} />
                  </span>
                  {renaming === c.id ? (
                    <input
                      className="agent-history-rename"
                      // biome-ignore lint/a11y/noAutofocus: inline rename field
                      autoFocus
                      defaultValue={c.title ?? ''}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void rename(c.id, (e.target as HTMLInputElement).value)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      onBlur={(e) => void rename(c.id, e.target.value)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="agent-history-open"
                      onClick={() => {
                        setOpen(false)
                        void useAgentPanel.getState().openConversation(c.id)
                      }}
                    >
                      <span className="agent-history-name">
                        {c.title ?? 'Untitled conversation'}
                        <ClientChip slug={c.clientSlug} />
                      </span>
                      <span className="agent-history-time">{relTime(c.updatedAt, Date.now())}</span>
                    </button>
                  )}
                  {renaming !== c.id && (
                    <span className="agent-history-actions">
                      <button
                        type="button"
                        className="agent-history-act"
                        title="Rename"
                        aria-label="Rename conversation"
                        onClick={() => {
                          setConfirmDel(null)
                          setRenaming(c.id)
                        }}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className={`agent-history-act${confirmDel === c.id ? ' is-danger' : ''}`}
                        title={confirmDel === c.id ? 'Click again to delete' : 'Delete'}
                        aria-label="Delete conversation"
                        onClick={() =>
                          confirmDel === c.id ? void del(c.id) : setConfirmDel(c.id)
                        }
                      >
                        🗑
                      </button>
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

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
            {a.type === 'image' ? '▦' : '▤'}
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
      <ClientChip slug={s.clientSlug} />
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

/**
 * BL-7: the header chrome as ONE collapsed line. Collapsed it still carries the
 * live essentials — provider tag, title, ◈ client chip, run state and close —
 * so nothing you need at a glance is hidden. Expanding reveals every session
 * row, the provider-switch (CONTINUE IN) controls, and the pop-out note.
 */
function SessionStrip({
  sessions,
  activeId,
  active,
  popout,
}: {
  sessions: AcpSessionView[]
  activeId: string | null
  active: AcpSessionView | null
  popout: boolean
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (sessions.length === 0 && !popout) return null
  const chip = active ? STATE_CHIP[active.state] : null
  return (
    <div className="agent-strip">
      <div className="agent-strip-line">
        <button
          type="button"
          className="agent-strip-toggle"
          aria-expanded={open}
          title={open ? 'Hide session details' : 'Show all sessions and provider switch'}
          aria-label={open ? 'Hide session details' : 'Show all sessions and provider switch'}
          onClick={() => setOpen(!open)}
        >
          {open ? '▾' : '▸'}
        </button>
        {active ? (
          <>
            <span className="agent-strip-title" title={active.title}>
              <span className="agent-tag">[{agentTag(active.agent)}]</span> {active.title}
            </span>
            <ClientChip slug={active.clientSlug} />
            {chip && (
              <span className={`agent-state-chip ${chip.cls}`}>
                {chip.glyph} {chip.label}
              </span>
            )}
            {popout && (
              <span
                className="agent-strip-popout"
                title="Popped-out window — using the main window's loredex MCP server."
              >
                ⧉
              </span>
            )}
            <button
              type="button"
              className="agent-session-close"
              title="End this session"
              aria-label="End this session"
              onClick={() => void useAgentPanel.getState().closeSession(active.sessionId)}
            >
              ×
            </button>
          </>
        ) : (
          <span className="agent-strip-title agent-strip-muted">No active session</span>
        )}
      </div>
      {open && (
        <div className="agent-strip-body">
          {popout && (
            // The pop-out core can't bind the single MCP port, but its agent
            // sessions connect to the MAIN window's running host via the
            // discovery file — so this window has the full loredex toolset too.
            <div className="agent-popout-note" role="note">
              ⧉ Popped-out window — using the main window's loredex MCP server.
            </div>
          )}
          {sessions.length > 0 && (
            <div className="agent-sessions">
              {sessions.map((s) => (
                <SessionRow key={s.sessionId} s={s} active={s.sessionId === activeId} />
              ))}
            </div>
          )}
          {active !== null && <ContinueControl active={active} />}
        </div>
      )}
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
  // BL-5: a client-scoped thread gets asked WHERE to continue — its own folder
  // (so the client's .mcp.json servers load again) or the vault root. An
  // unscoped thread has no choice to make, so it switches straight away.
  const [pending, setPending] = useState<AcpAgent | null>(null)
  if (!active.conversationId) return null
  const others = AGENTS.filter((a) => a !== active.agent)
  if (others.length === 0) return null
  const scoped = Boolean(active.clientSlug)

  const go = (a: AcpAgent, atVaultRoot: boolean): void => {
    setPending(null)
    void useAgentPanel.getState().continueIn(a, atVaultRoot)
  }

  if (pending) {
    return (
      <div className="agent-continue" role="group" aria-label="Where to continue">
        <span className="agent-continue-label">Start in</span>
        <button
          type="button"
          className="agent-continue-btn"
          title={`Continue in the ${active.clientSlug} folder — its MCP servers load again`}
          onClick={() => go(pending, false)}
        >
          ◈ {active.clientSlug}
        </button>
        <button
          type="button"
          className="agent-continue-btn"
          title="Continue at the vault root (the client's MCP servers will NOT load)"
          onClick={() => go(pending, true)}
        >
          Vault root
        </button>
        <button
          type="button"
          className="agent-continue-btn"
          title="Cancel"
          aria-label="Cancel"
          onClick={() => setPending(null)}
        >
          ×
        </button>
      </div>
    )
  }

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
          onClick={() => (scoped ? setPending(a) : go(a, false))}
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

/** BL-25: composer height bounds — one line's worth at the bottom, 45% of the
 *  viewport at the top so a dragged composer can never swallow the thread (the
 *  same ceiling the old `max-height: 45vh` enforced). */
export function clampComposer(px: number, viewportH = window.innerHeight): number {
  return Math.max(32, Math.min(px, viewportH * 0.45))
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

  // Composing and sending are different rights (BL-2): you may type, edit,
  // paste and attach while the agent is mid-answer — only the SEND is held
  // until the turn ends. Enter during a turn no-ops (submit() re-checks
  // canSend) and leaves the draft intact rather than dropping it.
  const canCompose = active !== null && active.state === 'ready'
  const canSend = canCompose && !active.busy
  const hasContent = draft.trim().length > 0 || attachments.length > 0

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
  // BL-25: a hand-set composer height. null = auto-grow from the row count (the
  // default); a number wins until double-click resets it.
  const [composerHeight, setComposerHeight] = useState<number | null>(null)
  const [slashSel, setSlashSel] = useState(0)
  const [slashDismissed, setSlashDismissed] = useState(false)
  const query = slashQuery(draft)
  const slashMatches = useMemo(
    () => (query !== null && active?.commands ? filterCommands(active.commands, query) : []),
    [query, active?.commands],
  )
  const slashOpen = slashMatches.length > 0 && !slashDismissed
  // the draft INVOKES a real command — true even with arguments after it, which
  // is exactly when the autocomplete menu closes and all other signal is lost
  const invoked = useMemo(
    () => recognizedCommands(draft, active?.commands ?? []),
    [draft, active?.commands],
  )
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
                <span className="agent-provider-mark">
                  <ProviderMark agent={a} size={13} />
                </span>
                <span className={`agent-auth-dot ${dot.cls}`} aria-hidden="true">
                  {dot.glyph}
                </span>
                {AGENT_META[a].label}
              </button>
            )
          })}
        </div>
        <ConvHistoryMenu />
        <button
          type="button"
          className="agent-head-btn agent-head-new"
          title="New conversation"
          aria-label="New conversation"
          onClick={() => void useAgentPanel.getState().openHere()}
        >
          ＋
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
      {/* BL-7: pop-out note + session rows + CONTINUE IN collapse into ONE line.
          What stays visible by default is only: providers (header, above),
          CONTEXT (UsageBar) and the session/tools/MCP summary below. */}
      <SessionStrip sessions={shown} activeId={activeId} active={active} popout={popout} />
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
            {/* Nothing rendered between hitting send and the first chunk
                arriving, so a slow first token read as a dead UI. The wait is
                real — the model is starting up server-side and ACP has nothing
                to report yet — so this is a LOCAL indicator, shown only while
                the tail of the thread is still the user's own turn. */}
            {active.busy && active.items[active.items.length - 1]?.type === 'user' && (
              <div className="agent-working" role="status" aria-live="polite">
                <span className="agent-working-ring" aria-hidden />
                Working…
              </div>
            )}
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
      {/* BL-1: the composer action strip is gone — "New conversation" lives in
          the header ＋ (its labeled twin), and Retry was redundant with simply
          re-typing. The thread keeps the vertical space instead. */}
      {/* A textarea cannot render a chip inline, so the recognition lives on its
          own line directly above — visible for as long as the draft is a
          command, arguments included. */}
      {/* Queued while the turn runs. ACP cannot inject mid-turn, so these are
          held and fired in order when it ends — the same thing Claude Code's TUI
          does. Shown so they are never a silent promise. */}
      {(active?.queued?.length ?? 0) > 0 && (
        <div className="agent-queued" role="status">
          {active?.queued?.map((q, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only queue
            <div className={`agent-queued-row is-${q.kind}`} key={i}>
              <span className="agent-queued-kind">
                {q.kind === 'btw' ? 'by the way' : 'next'}
              </span>
              <span className="agent-queued-text">{q.text}</span>
              <button
                type="button"
                className="agent-cmd-x"
                title="Remove this queued message"
                aria-label="Remove queued message"
                onClick={() => {
                  const s2 = useAgentPanel.getState()
                  const sess = s2.sessions.find((v) => v.sessionId === s2.activeId)
                  if (!sess) return
                  useAgentPanel.setState({
                    sessions: s2.sessions.map((v) =>
                      v.sessionId === sess.sessionId
                        ? { ...v, queued: (v.queued ?? []).filter((_, j) => j !== i) }
                        : v,
                    ),
                  })
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {invoked.length > 0 && (
        <div className="agent-cmd-strip" role="status">
          {invoked.map((inv) => (
            <div className="agent-cmd-row" key={`${inv.command.name}:${inv.start}`}>
              <span className="agent-cmd-chip">
                /{inv.command.name}
                <button
                  type="button"
                  className="agent-cmd-x"
                  title="Remove this command from the message"
                  aria-label={`Remove /${inv.command.name}`}
                  onClick={() => useAgentPanel.getState().setDraft(removeCommand(draft, inv))}
                >
                  ×
                </button>
              </span>
              <span className="agent-cmd-desc">{inv.command.description}</span>
            </div>
          ))}
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
          disabled={!canCompose}
          onClick={() => fileInputRef.current?.click()}
        >
          ⊕
        </button>
        <div className="agent-input-wrap">
          {/* BL-25: the native `resize: vertical` grip is always bottom-right and
              only grows DOWNWARD — but the composer is pinned to the bottom of
              the panel, so there is nothing below to grow into. This handle sits
              on the composer's TOP edge and grows it upward, into the thread. */}
          <div
            className="agent-input-grip"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Drag to resize the message box"
            title="Drag up to make the message box taller (double-click to reset)"
            onDoubleClick={() => setComposerHeight(null)}
            onPointerDown={(e) => {
              const el = inputRef.current
              if (!el) return
              e.preventDefault()
              const startY = e.clientY
              const startH = el.getBoundingClientRect().height
              const grip = e.currentTarget
              grip.setPointerCapture(e.pointerId)
              const onMove = (ev: PointerEvent): void => {
                // dragging UP (smaller clientY) must make it TALLER
                setComposerHeight(clampComposer(startH + (startY - ev.clientY)))
              }
              const onUp = (): void => {
                grip.removeEventListener('pointermove', onMove)
                grip.removeEventListener('pointerup', onUp)
              }
              grip.addEventListener('pointermove', onMove)
              grip.addEventListener('pointerup', onUp)
            }}
          />
        <textarea
          ref={inputRef}
          className="agent-input-field"
          style={composerHeight === null ? undefined : { height: `${composerHeight}px` }}
          // BL-10: auto-grow further before you need the drag handle (a long
          // dictated/pasted message used to sit in a 6-row peephole)
          rows={Math.min(12, Math.max(1, draft.split('\n').length))}
          placeholder={
            !canCompose
              ? 'Needs a ready session'
              : active.busy
                ? 'Type your next message…  (sends when the turn ends)'
                : 'Message the agent…  (↵ send · ⇧↵ newline)'
          }
          value={draft}
          disabled={!canCompose}
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
        </div>
        {active?.busy ? (
          <span className="agent-queue-actions">
            {/* Two intents, never mixed: more work to start next, versus a small
                aside about what is running now. */}
            <Button
              className="button-small"
              disabled={!hasContent}
              title="Queue as the next task — sent when this turn ends"
              onClick={() => {
                useAgentPanel.getState().setQueueKind('next')
                submit()
              }}
            >
              Queue
            </Button>
            <Button
              className="button-small"
              disabled={!hasContent}
              title="A quick side question about what's running — not a new task"
              onClick={() => {
                useAgentPanel.getState().setQueueKind('btw')
                submit()
              }}
            >
              BTW
            </Button>
            <Button variant="danger" className="button-small" onClick={() => useAgentPanel.getState().cancel()}>
              Stop
            </Button>
          </span>
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
