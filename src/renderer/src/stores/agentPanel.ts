/**
 * Agent panel store (acp blueprint 2026-07-18): right-dock panel open/width,
 * the ACP sessions with their chat threads, and the permission FIFO — all fed
 * by the acp.* CoreEvents. Rails-pattern persistence: {open, width} ride the
 * per-vault `agentPanel` app_settings row (width drags 280–480 via the
 * left-edge handle, mirroring the reader list pane). Unlike pty output, chat text
 * lives IN state; chunks batch through a module-scope sink and one
 * rAF-coalesced commit so React renders at frame rate, not per event
 * (core already batches at 8ms).
 */
import { create } from 'zustand'
import {
  isErrEnvelope,
  type AcpAgent,
  type AcpAttachment,
  type AcpCommand,
  type AcpConvMessage,
  type AcpMcpServer,
  type AcpMode,
  type AcpPermissionOption,
  type AcpPlanEntry,
  type AcpSessionState,
  type AcpToolContent,
  type AcpToolLocation,
  type CoreEvent,
} from '../../../shared/ipc-contract'
import { clampPanelWidth, DEFAULT_PANEL_WIDTH } from '../agent/panelWidth'
import { invoke, onEvent, openAgentWindow } from '../api'
import { useApp } from './app'
import { useToasts } from './toasts'

// re-exported so existing importers (store test) keep their one entry point;
// the source of truth is agent/panelWidth.ts (clone of listPaneWidth.ts)
export { DEFAULT_PANEL_WIDTH } from '../agent/panelWidth'

export type AcpChatItem =
  | { type: 'user'; text: string }
  | { type: 'agent'; text: string } // grows in place while streaming
  | { type: 'thought'; text: string }
  | {
      type: 'tool'
      toolCallId: string
      title: string
      toolKind?: string
      status: string
      /** BL-14: what the tool was asked to do (rawInput), serialized */
      input?: string
      /** the adapter's tool output — before/after diffs + text (A2) */
      content?: AcpToolContent[]
      /** files this tool touched — ABSOLUTE paths, relativized before open (A2) */
      locations?: AcpToolLocation[]
      /** BL-12: ms when the row first appeared — drives the elapsed counter
       *  while the tool is pending/running (absent on rehydrated history). */
      startedAt?: number
    }

/** A staged composer attachment (B4): the contract shape plus a display `name`
 *  for the tray chip (the name is stripped when it rides acp.prompt). An image
 *  carries base64; a file carries its absolute path (adapter reads it). */
export type AgentAttachment =
  | { type: 'image'; mimeType: string; dataB64: string; name: string }
  | { type: 'resource'; path: string; name: string }

/** B4: strip the display-only `name`, leaving the contract AcpAttachment that
 *  crosses the seam. */
export function toContractAttachment(a: AgentAttachment): AcpAttachment {
  return a.type === 'image'
    ? { type: 'image', mimeType: a.mimeType, dataB64: a.dataB64 }
    : { type: 'resource', path: a.path }
}

export interface AcpSessionView {
  sessionId: string
  agent: AcpAgent
  /** OUR vault-scoped conversation id (B0) — the persisted transcript this
   *  session's thread is a view of; hydrated via agent.conv.load on open.
   *  Optional: a session started with no core db carries none. */
  conversationId?: string
  /** first prompt words; 'New session' until then */
  title: string
  state: AcpSessionState
  detail?: string
  busy: boolean
  items: AcpChatItem[]
  /** latest plan replaces, never appends */
  plan: AcpPlanEntry[]
  /** best-effort token telemetry (A4) — absent until an acp.usage lands (codex
   *  may emit nothing). All three (`context`/`cost`/`turn`) REPLACE (latest
   *  wins); `turn` is a cumulative session snapshot, not a per-turn delta. */
  usage?: {
    context?: { used: number; size: number }
    cost?: { amount: number; currency: string }
    turn?: { total: number; input: number; output: number; cached?: number; thought?: number }
  }
  /** slash-commands the agent advertises (A7) — REPLACED on each acp.commands. */
  commands?: AcpCommand[]
  /** current session mode + the full set (A7): the initial acp.mode carries
   *  availableModes, later current_mode_update events carry only currentModeId
   *  (the set is kept). Absent until a mode-capable agent reports one. */
  mode?: { currentModeId: string; availableModes?: AcpMode[] }
  /** MCP servers attached on ready (A7) — name/url only, never the token. */
  mcpServers?: AcpMcpServer[]
  /** auth backing this session: 'subscription' (plan quota) or 'api' (billed).
   *  Set on ready; makes the usage meter label cost as an estimate vs spend. */
  authMode?: 'subscription' | 'api'
  /** whether this adapter accepts image attachments (B4) — from the ready
   *  event's promptCapabilities.image. Undefined until ready (attach allowed
   *  optimistically); explicit false blocks image attach with a composer notice. */
  imageInput?: boolean
  /** WP-A: agent-ops client this session runs under (◈ chip on the session row).
   *  Set from the starting/ready event's clientSlug; null for a vault-root or
   *  research session. Kept across state transitions. */
  clientSlug?: string | null
}

export interface AcpPermissionView {
  sessionId: string
  requestId: string
  title: string
  toolKind?: string
  options: AcpPermissionOption[]
  /** the proposed change — same diff/text shapes a tool row renders (A3) */
  content?: AcpToolContent[]
  locations?: AcpToolLocation[]
  /** WP-B: the session's client scope — drives the ◈ chip + the 'always allow
   *  <kind> for <client>' toggle (only shown when this AND toolKind are set). */
  clientSlug?: string | null
}

/** Per-provider login state (A6): 'unknown' until a session for that provider
 *  reports in; 'ok' once one reaches ready; 'auth_required' when one asks to
 *  sign in. Drives the auth dot on each provider chip. */
export type ProviderAuth = 'unknown' | 'ok' | 'auth_required'

/** Fresh default map — a Record over the AcpAgent union, so a Phase-2 provider
 *  (gemini) is a compile error here until it's listed (no silent gap). */
const defaultProviderAuth = (): Record<AcpAgent, ProviderAuth> => ({
  claude: 'unknown',
  codex: 'unknown',
  gemini: 'unknown',
})

/** The session list the panel shows for a filter (A6): 'all' shows every
 *  session; a specific agent narrows to that provider's sessions. Exported so
 *  the panel and its test share one derivation. */
export function visibleSessions(
  sessions: AcpSessionView[],
  filter: AcpAgent | 'all',
): AcpSessionView[] {
  return filter === 'all' ? sessions : sessions.filter((v) => v.agent === filter)
}

/** Add-to-chat (A8): format a note excerpt as a source-attributed markdown
 *  blockquote, e.g.
 *    > from [notes/x.md]: first selected line
 *    > second selected line
 *  Every line is quoted so a multi-line selection stays valid markdown; the
 *  trailing newline drops the composer cursor onto a fresh line for the prompt. */
export function quoteForChat(text: string, path: string): string {
  const [first = '', ...rest] = text.trim().split('\n')
  const head = `> from [${path}]: ${first}`
  const body = rest.map((l) => `> ${l}`).join('\n')
  return (rest.length ? `${head}\n${body}` : head) + '\n'
}

/** Add-to-chat's attachment sibling (B4): a mono marker line naming the staged
 *  attachments, appended to the sent user bubble so the thread records what rode
 *  along (the image bytes / file paths themselves are not kept in the thread).
 *  '' for no attachments. */
export function attachmentSummary(attachments: AgentAttachment[]): string {
  if (attachments.length === 0) return ''
  return `📎 ${attachments.map((a) => a.name).join(', ')}`
}

/** Retry (chat-completeness): the text to resend on Retry — the most recent
 *  user turn's text with a trailing attachment-marker line stripped (the staged
 *  attachments themselves are transient and can't be re-sent, so only the clean
 *  prompt text is replayed). null when the thread holds no user turn. */
export function lastUserText(items: AcpChatItem[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    if (it.type === 'user') return it.text.replace(/(?:\n\n)?📎 [^\n]*$/, '')
  }
  return null
}

interface AgentPanelState {
  open: boolean
  width: number
  /** true while the left-edge divider is being dragged — session-only, never
   *  persisted (mirrors rails.resizing) */
  resizing: boolean
  /** what openHere() STARTS — running sessions keep their agent */
  agent: AcpAgent
  /** which provider's sessions the list shows ('all' = every provider) — a
   *  view filter only, never touches which sessions are alive (A6) */
  filter: AcpAgent | 'all'
  /** per-provider login state, updated from acp.session (A6) */
  providerAuth: Record<AcpAgent, ProviderAuth>
  /** B3: true when THIS window is a pop-out (opened via loredex:open-agent-window).
   *  Its fresh core reads the shared vault app.db but is a SECONDARY window, so
   *  it can't claim the single fixed in-app MCP port — drives the panel's
   *  "no MCP tools here" note. Set on the resumeConversation entry, cleared on
   *  reset (vault switch). */
  popout: boolean
  sessions: AcpSessionView[]
  activeId: string | null
  /** the surfaced permission request; more queue module-side (FIFO) */
  permission: AcpPermissionView | null
  /** WP-B: total awaiting decisions (surfaced + queued) — DERIVED, recomputed on
   *  every permission/queue change (never delta-mutated). Drives the TopBar
   *  badge when the panel is closed. */
  pendingPermissions: number
  /** the composer draft — lifted into the store (A8) so addContext can
   *  pre-fill it from a note selection; the panel textarea is controlled by it */
  draft: string
  /** staged attachments for the next turn (B4) — images pasted/picked as base64
   *  chips, files as absolute paths; cleared after send. */
  attachments: AgentAttachment[]
  load(): Promise<void>
  /** open/close + persist — no session spawn (unlike the terminal toggle) */
  toggle(): void
  /** live drag — clamps and applies WITHOUT persisting (many events per drag) */
  dragWidth(px: number): void
  /** persist the current width — drag-end (pointerup); rides the existing
   *  settings.agentPanel.set (width already on that row — no new IPC) */
  commitWidth(): void
  /** double-click the divider → back to the 340px default, persisted */
  resetWidth(): void
  setResizing(resizing: boolean): void
  setAgent(a: AcpAgent): void
  /** narrow the visible session list to one provider (or 'all') — A6 */
  setFilter(f: AcpAgent | 'all'): void
  /** open the panel + acp.start + select the new session */
  /** BL-6: `provider` starts this session on a specific agent (the client
   *  page's Chat Here picker); omitted, it uses the panel's current selection. */
  openHere(cwd?: string, provider?: AcpAgent): Promise<void>
  /** B2 cross-provider continuation: take the ACTIVE session's conversation and
   *  continue it on `provider` (agent.continue) — a new session bound to the
   *  same transcript, hydrated so the prior thread shows while the target boots.
   *  No active conversation → no-op. */
  /** BL-5: `atVaultRoot` starts the continued session at the vault root instead
   *  of the thread's own folder (the where-to-continue choice). */
  continueIn(provider: AcpAgent, atVaultRoot?: boolean): Promise<void>
  /** B3 pop-out: open the ACTIVE conversation in its OWN standalone window (its
   *  own core host reads the same vault app.db). No active conversation → no-op. */
  popOut(): Promise<void>
  /** B3 pop-out ENTRY (fires in the freshly-booted pop-out window from the
   *  onOpenAgent post-load send): resume `conversationId` from the persisted
   *  transcript. This window's core has no live session for it, so it reuses the
   *  B2 continuation (agent.continue) to seed a fresh session from the thread. */
  resumeConversation(conversationId: string): Promise<void>
  /** History dropdown: reopen a persisted conversation IN THIS panel (not a
   *  pop-out) — loads the transcript and seeds a fresh session on its last
   *  provider, same continuation path as resume/pop-out. */
  openConversation(conversationId: string): Promise<void>
  select(id: string): void
  /** controlled-input setter for the composer textarea (A8) */
  setDraft(text: string): void
  /** add-to-chat (A8): open the panel and pre-fill the composer with a
   *  quoted, source-attributed excerpt from a note — never auto-sends. Stacks
   *  onto an existing draft (blank-line separated) so several excerpts gather. */
  addContext(text: string, path: string): void
  /** stage an attachment for the next turn (B4) — paste handler / attach picker. */
  addAttachment(a: AgentAttachment): void
  /** drop one staged attachment by index (B4 tray remove). */
  removeAttachment(index: number): void
  send(text: string): Promise<void>
  /** retry (chat-completeness): re-send the last user turn as a fresh prompt.
   *  No-op unless the active session is idle (ready, not busy) with a user turn
   *  to resend. */
  retry(): Promise<void>
  /** switch a session's mode (A7) — optimistic, reverts if agent.setMode fails */
  setMode(sessionId: string, modeId: string): Promise<void>
  cancel(): void
  /** answer the surfaced request; `remember` persists an always-allow rule for
   *  this (client, tool kind) when the answer is an allow and both are known. */
  respondPermission(optionId: string | null, remember?: boolean): void
  closeSession(id: string): Promise<void>
  /** vault switch: acp.stop every session (old core may be dead), defaults */
  reset(): Promise<void>
}

/** Vault-switch race guard (terminal.ts:54–60 comment applies verbatim): a
 *  reset() landing across the awaited acp.start means the resolved session
 *  belongs to the torn-down core — best-effort stop, never install it. */
let resetGen = 0

/** Permission FIFO (module scope): the store surfaces ONE request; adapters
 *  can raise several across a turn, so the overflow queues here and advances
 *  on respondPermission. */
let permissionQueue: AcpPermissionView[] = []

/** WP-B: total awaiting decisions = the surfaced one + the queued overflow.
 *  DERIVED from the current permission + the module queue — the badge is never
 *  incremented/decremented, so a multi-purge (a dead session drops N queued
 *  requests) can't desync it (risk #2). */
function pendingCount(permission: AcpPermissionView | null): number {
  return permissionQueue.length + (permission ? 1 : 0)
}

// ── chunk sink (module scope, NOT store methods): pending chunk runs per
// session, drained into the store by one rAF-coalesced commit ───────────────
const pendingChunks = new Map<string, Array<{ role: 'agent' | 'thought'; text: string }>>()
let rafPending = false

function scheduleCommit(): void {
  if (rafPending) return
  rafPending = true
  const fire = (): void => {
    rafPending = false
    commitChunks()
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fire)
  else setTimeout(fire, 16) // node tests — no frame loop
}

/** Drain the sink into the store: a chunk whose role matches the session's
 *  last item grows that item in place (one bubble per contiguous run — v1
 *  ceiling, no messageId splitting); a role switch pushes a new item. Also
 *  called synchronously before tool/plan/permission/turnEnd handling — the
 *  renderer mirror of the core's flush-before-other-events ordering law. */
function commitChunks(): void {
  if (pendingChunks.size === 0) return
  useAgentPanel.setState((s) => {
    let sessions = s.sessions
    for (const [sid, chunks] of pendingChunks) {
      const idx = sessions.findIndex((v) => v.sessionId === sid)
      if (idx < 0) continue // session closed while chunks were pending
      let items = sessions[idx].items
      for (const c of chunks) {
        const last = items[items.length - 1]
        if (last && last.type === c.role) {
          items = [...items.slice(0, -1), { type: c.role, text: last.text + c.text }]
        } else {
          items = [...items, { type: c.role, text: c.text }]
        }
      }
      sessions = sessions.map((v, i) => (i === idx ? { ...v, items } : v))
    }
    pendingChunks.clear()
    return { sessions }
  })
}

// ── fast-fail start race (B5 gemini) ────────────────────────────────────────
// A spawn ENOENT (e.g. `gemini` not installed) fires the child 'error' ~6ms
// after spawn — BEFORE openHere's `await invoke('acp.start')` resolves and adds
// the session to the store. The core emits 'starting' then the terminal 'error'
// for that sessionId while it is not yet `known`, so plain "drop unknown-session
// events" (which we still want for genuinely-closed sessions) would strand the
// UI in 'starting' forever. Fix: WHILE a start is in flight, buffer that
// session's acp.session events keyed by id and replay them the instant the
// session registers (drainPendingSession). Slow adapters (Claude/Codex) never
// hit this — their ready/auth events land long after the ack.
type AcpSessionEvent = Extract<CoreEvent, { kind: 'acp.session' }>
/** how many openHere/continue starts are awaiting their ack — only then may an
 *  unknown-session acp.session event be a raced-ahead start (else it's a late
 *  event for a closed session, still dropped). */
let startsInFlight = 0
const pendingSessionEvents = new Map<string, AcpSessionEvent[]>()

/** Apply one acp.session event to a session that is (now) known — the shared
 *  body of the live handler and the buffered replay. */
function applySessionEvent(e: AcpSessionEvent): void {
  commitChunks()
  // a non-ready state is a dead/blocked session: core already answered its held
  // permissions 'cancelled' (cancelPendingPermissions on exit/error). Purge this
  // session's queued requests so a healthy session isn't stalled behind them,
  // and advance past a surfaced one so the modal doesn't hang on a dead session.
  if (e.state !== 'ready') {
    permissionQueue = permissionQueue.filter((p) => p.sessionId !== e.sessionId)
  }
  // any non-ready state also clears busy: a mid-turn death (adapter exit) emits
  // no turnEnd, and a stuck Stop button helps nobody.
  useAgentPanel.setState((s) => {
    // advance past a surfaced permission for a now-dead session (the queue was
    // already purged of it above); recompute the badge from the result (risk #2)
    const permission =
      e.state !== 'ready' && s.permission?.sessionId === e.sessionId
        ? (permissionQueue.shift() ?? null)
        : s.permission
    return {
      sessions: s.sessions.map((v) =>
        v.sessionId === e.sessionId
          ? {
              ...v,
              state: e.state,
              detail: e.detail,
              busy: e.state === 'ready' ? v.busy : false,
              // MCP list rides the ready event only (A7) — keep it across later
              // non-ready transitions
              mcpServers: e.mcpServers ?? v.mcpServers,
              authMode: e.authMode ?? v.authMode,
              // image-input capability rides the ready event (B4) — keep it
              imageInput: e.imageInput ?? v.imageInput,
              // client scope rides the starting/ready event (WP-A) — keep it
              clientSlug: e.clientSlug ?? v.clientSlug,
            }
          : v,
      ),
      permission,
      pendingPermissions: pendingCount(permission),
      // login-state chip (A6): a ready session proves the provider is signed in;
      // auth_required flags it needs login. Other states (starting / error /
      // exited) say nothing about auth — leave the last verdict.
      providerAuth:
        e.state === 'ready' || e.state === 'auth_required'
          ? { ...s.providerAuth, [e.agent]: e.state === 'ready' ? 'ok' : 'auth_required' }
          : s.providerAuth,
    }
  })
}

/** Replay buffered acp.session events for a just-registered session (fast-fail
 *  race). Called synchronously right after the register set(), before any new
 *  event can interleave. */
function drainPendingSession(sessionId: string): void {
  const buffered = pendingSessionEvents.get(sessionId)
  if (!buffered) return
  pendingSessionEvents.delete(sessionId)
  for (const e of buffered) applySessionEvent(e)
}

function persist(): void {
  const { open, width } = useAgentPanel.getState()
  try {
    void invoke('settings.agentPanel.set', { open, width }).catch(() => {
      // stays applied for this session; next launch re-reads the stored value
    })
  } catch {
    // no bridge (node tests) — session-only
  }
}

/** Merge one field-patch into a session by id (immutably). */
function patchSession(id: string, patch: Partial<AcpSessionView>): void {
  useAgentPanel.setState((s) => ({
    sessions: s.sessions.map((v) => (v.sessionId === id ? { ...v, ...patch } : v)),
  }))
}

/** A persisted transcript message → a chat item (B0). Storage already collapsed
 *  to one row per contiguous run / tool / user turn, so this is a 1:1 map. */
function toChatItem(m: AcpConvMessage): AcpChatItem {
  if (m.role === 'tool' && m.tool) {
    return {
      type: 'tool',
      toolCallId: m.tool.toolCallId,
      title: m.tool.title ?? 'Tool call',
      toolKind: m.tool.toolKind,
      status: m.tool.status ?? 'completed',
      content: m.tool.content,
      locations: m.tool.locations,
    }
  }
  return { type: m.role as 'user' | 'agent' | 'thought', text: m.text ?? '' }
}

/** Hydrate a session's thread from its persisted conversation (B0). A fresh
 *  conversation loads empty (no-op); a resumed one (B2/B3 pop-out) repopulates
 *  the thread. Never clobbers a thread that already has live items. */
async function hydrate(sessionId: string, conversationId: string): Promise<void> {
  let loaded
  try {
    loaded = await invoke('agent.conv.load', { conversationId })
  } catch {
    return // unknown / no store — leave the thread as-is
  }
  if (loaded.messages.length === 0) return
  useAgentPanel.setState((s) => ({
    sessions: s.sessions.map((v) =>
      v.sessionId === sessionId && v.items.length === 0
        ? { ...v, items: loaded.messages.map(toChatItem) }
        : v,
    ),
  }))
}

/** Continuation body shared by B2 continueIn + B3 resumeConversation: open the
 *  panel, agent.continue on (conversationId → provider) — a new session bound to
 *  the SAME transcript — install it active, hydrate the thread. The resetGen race
 *  guard (openHere precedent) drops a session whose core was torn down across the
 *  await. */
async function startContinuation(
  conversationId: string,
  provider: AcpAgent,
  title: string,
  /** BL-5: force the vault root instead of the thread's own folder. */
  atVaultRoot?: boolean,
): Promise<void> {
  useAgentPanel.setState({ open: true })
  const gen = resetGen
  // fast-fail race guard (see pendingSessionEvents): mark a start in flight so
  // acp.session events that beat the ack get buffered, not dropped.
  startsInFlight++
  try {
    let sessionId: string
    try {
      ;({ sessionId } = await invoke('agent.continue', {
        conversationId,
        provider,
        ...(atVaultRoot ? { atVaultRoot: true } : {}),
      }))
    } catch {
      // unknown conversation / dead core — the continue silently doesn't happen
      return
    }
    if (resetGen !== gen) {
      // a vault-switch reset() landed across the await — belongs to the dead core
      void invoke('acp.stop', { sessionId }).catch(() => {})
      return
    }
    useAgentPanel.setState((s) => ({
      sessions: [
        ...s.sessions,
        {
          sessionId,
          conversationId,
          agent: provider,
          // carry the conversation's title — it is the same logical thread
          title,
          state: 'starting' as const,
          busy: false,
          items: [],
          plan: [],
        },
      ],
      activeId: sessionId,
      // reflect the now-active provider so the picker/+ agree with the thread
      agent: provider,
    }))
    // replay any acp.session events the core emitted before the ack resolved
    // (fast adapters race the register — e.g. a missing target binary)
    drainPendingSession(sessionId)
    // show the prior conversation immediately (the target boots in the
    // background; a native session/load replay is suppressed core-side, so this
    // hydrated copy is the single source of the thread)
    void hydrate(sessionId, conversationId)
  } finally {
    // last start in flight → drop any buffered events for sessions that never
    // registered (reset-race / a concurrently-closed session), bounding the map
    if (--startsInFlight === 0) pendingSessionEvents.clear()
  }
}

export const useAgentPanel = create<AgentPanelState>((set, get) => ({
  open: false,
  width: DEFAULT_PANEL_WIDTH,
  resizing: false,
  agent: 'claude',
  filter: 'all',
  providerAuth: defaultProviderAuth(),
  popout: false,
  sessions: [],
  activeId: null,
  permission: null,
  pendingPermissions: 0,
  draft: '',
  attachments: [],

  async load() {
    try {
      const stored = await invoke('settings.agentPanel.get', undefined)
      set({ open: stored.open, width: clampPanelWidth(stored.width) })
    } catch (e) {
      // first-attach port swap drops early invokes — retry once (app.init pattern)
      if (isErrEnvelope(e) && e.code === 'PORT_SWAPPED') return get().load()
      // no core yet — panel starts closed at the default width
    }
  },

  toggle() {
    set((s) => ({ open: !s.open }))
    persist()
  },

  dragWidth(px) {
    set({ width: clampPanelWidth(px) })
  },

  commitWidth() {
    persist()
  },

  resetWidth() {
    set({ width: DEFAULT_PANEL_WIDTH })
    persist()
  },

  setResizing(resizing) {
    set({ resizing })
  },

  setAgent(agent) {
    set({ agent })
  },

  setFilter(filter) {
    set({ filter })
  },

  async openHere(cwd, provider) {
    set({ open: true }) // optimistic — the panel appears while the start rides
    persist()
    const gen = resetGen
    // BL-6: an explicit provider wins (Chat Here picker); otherwise the panel's
    // current selection, as before
    const agent = provider ?? get().agent
    // fast-fail race guard (see pendingSessionEvents): mark a start in flight so
    // a spawn-error acp.session event that beats the ack gets buffered, not
    // dropped — otherwise a missing adapter (gemini ENOENT) strands 'starting'.
    startsInFlight++
    try {
      let sessionId: string
      let conversationId: string | undefined
      try {
        ;({ sessionId, conversationId } = await invoke(
          'acp.start',
          cwd === undefined ? { agent } : { agent, cwd },
        ))
      } catch (e) {
        // BL-20: this used to be silent, which made "Chat Here does nothing
        // after the first time" unreadable — the session cap is by far the most
        // common cause and the user had no way to know. Say what happened.
        const msg = e instanceof Error ? e.message : String(e)
        useToasts
          .getState()
          .push(
            'Could not start the chat',
            /limit reached/i.test(msg) ? `${msg} — close a session and try again.` : msg,
          )
        return
      }
      if (resetGen !== gen) {
        // a vault-switch reset() landed across the await — this session belongs
        // to the torn-down core; best-effort stop, never list it
        void invoke('acp.stop', { sessionId }).catch(() => {})
        return
      }
      set((s) => ({
        sessions: [
          ...s.sessions,
          {
            sessionId,
            conversationId,
            agent,
            title: 'New session',
            state: 'starting' as const,
            busy: false,
            items: [],
            plan: [],
          },
        ],
        activeId: sessionId,
      }))
      // replay any acp.session events (e.g. a fast spawn 'error') the core
      // emitted for this session before the ack resolved and it was known
      drainPendingSession(sessionId)
      // B0: hydrate the thread from the persisted transcript. A fresh conversation
      // is empty (no-op); a resumed one (B2/B3) repopulates the thread on open.
      if (conversationId) void hydrate(sessionId, conversationId)
    } finally {
      // last start in flight → drop any buffered events for sessions that never
      // registered (reset-race / a concurrently-closed session), bounding the map
      if (--startsInFlight === 0) pendingSessionEvents.clear()
    }
  },

  async continueIn(provider, atVaultRoot) {
    const { activeId, sessions } = get()
    const active = sessions.find((v) => v.sessionId === activeId)
    // continuation needs a persisted thread to carry — a no-db session (no
    // conversationId) or no active session has nothing to continue
    if (!active?.conversationId) return
    await startContinuation(active.conversationId, provider, active.title, atVaultRoot)
  },

  async popOut() {
    const { activeId, sessions } = get()
    const active = sessions.find((v) => v.sessionId === activeId)
    // nothing to pop out without a persisted conversation to hand the new window
    if (!active?.conversationId) return
    // the pop-out window forks a core on THIS vault, then resumes the transcript
    const vaultPath = useApp.getState().identity?.vaultPath ?? null
    try {
      await openAgentWindow(vaultPath, active.conversationId)
    } catch {
      // no bridge (node tests) / window failed to open — best-effort, no throw
    }
  },

  async resumeConversation(conversationId) {
    // fires in the freshly-booted pop-out window. This is a SECONDARY window, so
    // its core can't claim the single fixed in-app MCP port — flag it so the
    // panel shows the "no MCP tools here" note (see main/index.ts open-agent).
    set({ open: true, popout: true })
    persist()
    let loaded
    try {
      loaded = await invoke('agent.conv.load', { conversationId })
    } catch {
      // unknown / cross-vault / no store — nothing to resume, panel stays empty
      return
    }
    // this window's core has NO live session for the conversation, so reuse the
    // B2 continuation to seed a fresh one from the transcript on its last
    // provider (same-provider resumes natively via session/load — adapters
    // persist sessions to disk, so a fresh core can still load them).
    await startContinuation(conversationId, loaded.lastProvider, loaded.title ?? 'New session')
  },

  async openConversation(conversationId) {
    // in-panel reopen (main window keeps the MCP port → no popout flag)
    set({ open: true })
    persist()
    let loaded
    try {
      loaded = await invoke('agent.conv.load', { conversationId })
    } catch {
      return // unknown / cross-vault / no store — nothing to reopen
    }
    await startContinuation(conversationId, loaded.lastProvider, loaded.title ?? 'Conversation')
  },

  select(id) {
    set({ activeId: id })
  },

  setDraft(text) {
    set({ draft: text })
  },

  addContext(text, path) {
    if (!text.trim()) return // an empty selection has nothing to quote
    const block = quoteForChat(text, path)
    set((s) => ({
      open: true, // surface the panel so the user sees the staged excerpt
      draft: s.draft.trim() ? `${s.draft.replace(/\s+$/, '')}\n\n${block}` : block,
    }))
    persist() // opening rides the same {open,width} row as toggle()
  },

  addAttachment(a) {
    set((s) => ({ attachments: [...s.attachments, a] }))
  },

  removeAttachment(index) {
    set((s) => ({ attachments: s.attachments.filter((_, i) => i !== index) }))
  },

  async send(text) {
    const { activeId, sessions, attachments } = get()
    // a turn needs SOMETHING — text or at least one attachment (B4)
    if (!text.trim() && attachments.length === 0) return
    const session = sessions.find((v) => v.sessionId === activeId)
    // belt and braces — the input is disabled in these states anyway
    if (!session || session.state !== 'ready' || session.busy) return
    const id = session.sessionId
    // title from the first prompt words; an attachment-only first turn keeps the
    // marker so the session is never a blank "New session"
    const marker = attachmentSummary(attachments)
    const titleSource = text.trim() || marker
    const title =
      session.title === 'New session'
        ? titleSource.split(/\s+/).slice(0, 6).join(' ').slice(0, 48)
        : session.title
    // the thread bubble records the attachment marker beneath the text; the
    // prompt itself carries the clean text (the marker is renderer sugar)
    const bubble = marker ? (text ? `${text}\n\n${marker}` : marker) : text
    const contractAttachments = attachments.map(toContractAttachment)
    set((s) => ({
      // clear the tray as the turn fires — the staged attachments are now sent
      attachments: [],
      sessions: s.sessions.map((v) =>
        v.sessionId === id
          ? { ...v, busy: true, title, items: [...v.items, { type: 'user' as const, text: bubble }] }
          : v,
      ),
    }))
    try {
      await invoke('acp.prompt', {
        sessionId: id,
        text,
        ...(contractAttachments.length ? { attachments: contractAttachments } : {}),
      })
    } catch (e) {
      // ACP_BUSY / dead core: revert busy, surface the envelope as detail
      patchSession(id, { busy: false, detail: isErrEnvelope(e) ? e.message : String(e) })
    }
  },

  async retry() {
    const { activeId, sessions } = get()
    const session = sessions.find((v) => v.sessionId === activeId)
    // only from an idle session — the composer/palette gate on this too
    if (!session || session.state !== 'ready' || session.busy) return
    const text = lastUserText(session.items)
    if (!text || !text.trim()) return
    // resend as a fresh turn — send() appends a new user bubble (standard chat
    // retry) and rides the same guards; attachments were transient, text only
    await get().send(text)
  },

  async setMode(sessionId, modeId) {
    const session = get().sessions.find((v) => v.sessionId === sessionId)
    // no modes to switch, or already on it — nothing to do
    if (!session?.mode || session.mode.currentModeId === modeId) return
    const prevMode = session.mode
    // optimistic: an adapter may not echo a current_mode_update after set_mode,
    // so reflect the switch immediately; a real acp.mode later is idempotent
    patchSession(sessionId, { mode: { ...prevMode, currentModeId: modeId } })
    try {
      await invoke('agent.setMode', { sessionId, modeId })
    } catch {
      // rejected (not-ready / dead core) — restore the prior mode so the
      // switcher never lies about the live mode
      patchSession(sessionId, { mode: prevMode })
    }
  },

  cancel() {
    const id = get().activeId
    if (!id) return
    try {
      void invoke('acp.cancel', { sessionId: id }).catch(() => {})
    } catch {
      // no bridge (node tests)
    }
  },

  respondPermission(optionId, remember) {
    const perm = get().permission
    if (!perm) return
    try {
      // optionId null = dismissed → cancelled outcome (dismissing is rejecting)
      void invoke('acp.permission', {
        sessionId: perm.sessionId,
        requestId: perm.requestId,
        optionId,
      }).catch(() => {}) // turn may have been cancelled across the invoke — core no-ops
      // WP-B: persist an always-allow rule when the user asked to remember AND
      // this was an allow for a client-scoped, kind-known request. The chosen
      // option's KIND decides — only an allow_* answer saves an allow rule.
      if (remember && optionId && perm.clientSlug && perm.toolKind) {
        const chosen = perm.options.find((o) => o.optionId === optionId)
        if (chosen?.kind === 'allow_once' || chosen?.kind === 'allow_always') {
          void invoke('agent.permissions.set', {
            client: perm.clientSlug,
            toolKind: perm.toolKind,
            decision: 'allow',
          }).catch(() => {})
        }
      }
    } catch {
      // no bridge (node tests)
    }
    const next = permissionQueue.shift() ?? null
    set({ permission: next, pendingPermissions: pendingCount(next) })
  },

  async closeSession(id) {
    try {
      void invoke('acp.stop', { sessionId: id }).catch(() => {}) // idempotent core-side
    } catch {
      // no bridge (node tests)
    }
    pendingChunks.delete(id)
    permissionQueue = permissionQueue.filter((p) => p.sessionId !== id)
    set((s) => {
      const sessions = s.sessions.filter((v) => v.sessionId !== id)
      // a surfaced permission for the closed session would hang the modal —
      // core already answered it cancelled on stop; advance locally too
      const permission =
        s.permission?.sessionId === id ? (permissionQueue.shift() ?? null) : s.permission
      return {
        sessions,
        activeId: s.activeId === id ? (sessions[0]?.sessionId ?? null) : s.activeId,
        permission,
        pendingPermissions: pendingCount(permission),
      }
    })
  },

  async reset() {
    resetGen++ // invalidate any openHere start still in flight
    for (const { sessionId } of get().sessions) {
      try {
        // the old core host may already be torn down — failures are expected
        void invoke('acp.stop', { sessionId }).catch(() => {})
      } catch {
        // no bridge (node tests)
      }
    }
    pendingChunks.clear()
    pendingSessionEvents.clear() // any raced-ahead events belong to the dead core
    permissionQueue = []
    set({
      open: false,
      width: DEFAULT_PANEL_WIDTH,
      resizing: false,
      agent: 'claude',
      filter: 'all',
      providerAuth: defaultProviderAuth(),
      popout: false,
      sessions: [],
      activeId: null,
      permission: null,
      pendingPermissions: 0,
      draft: '',
      attachments: [],
    })
  },
}))

if (typeof window !== 'undefined' && window.loredex) {
  onEvent((e) => {
    // the async half of the acp.* family — session state, chunks, tool calls,
    // plans, permission requests, turn ends. Events for sessions no longer in
    // the list (closed / late after stop) are ignored.
    switch (e.kind) {
      case 'acp.session': {
        const known = useAgentPanel.getState().sessions.some((v) => v.sessionId === e.sessionId)
        if (!known) {
          // Not yet registered. If a start is in flight, this is the fast-fail
          // race (a spawn 'error' beating openHere's acp.start ack) — buffer it
          // and replay on registration (drainPendingSession). Outside a start
          // window it's a late event for a closed session — drop it as before.
          if (startsInFlight > 0) {
            const buf = pendingSessionEvents.get(e.sessionId) ?? []
            buf.push(e)
            pendingSessionEvents.set(e.sessionId, buf)
          }
          return
        }
        applySessionEvent(e)
        return
      }
      case 'acp.chunk': {
        const runs = pendingChunks.get(e.sessionId) ?? []
        runs.push({ role: e.role, text: e.text })
        pendingChunks.set(e.sessionId, runs)
        scheduleCommit()
        return
      }
      case 'acp.tool': {
        commitChunks() // ordering law: chunks land before the tool row moves
        useAgentPanel.setState((s) => ({
          sessions: s.sessions.map((v) => {
            if (v.sessionId !== e.sessionId) return v
            const idx = v.items.findIndex(
              (i) => i.type === 'tool' && i.toolCallId === e.toolCallId,
            )
            if (idx >= 0) {
              // tool_call_update — fields are optional, keep what we had
              const items = v.items.map((i, n) =>
                n === idx && i.type === 'tool'
                  ? {
                      ...i,
                      title: e.title ?? i.title,
                      toolKind: e.toolKind ?? i.toolKind,
                      status: e.status ?? i.status,
                      input: e.input ?? i.input,
                      // sparse-merge: content/locations arrive on the update, not
                      // always the initial call — keep what we had if absent
                      content: e.content ?? i.content,
                      locations: e.locations ?? i.locations,
                    }
                  : i,
              )
              return { ...v, items }
            }
            return {
              ...v,
              items: [
                ...v.items,
                {
                  type: 'tool' as const,
                  toolCallId: e.toolCallId,
                  title: e.title ?? 'Tool call',
                  toolKind: e.toolKind,
                  status: e.status ?? 'pending',
                  input: e.input,
                  content: e.content,
                  locations: e.locations,
                  // BL-12: when this tool first appeared — the row shows elapsed
                  // time while it's pending/running, so "working" is visibly
                  // different from "stuck"
                  startedAt: Date.now(),
                },
              ],
            }
          }),
        }))
        return
      }
      case 'acp.plan': {
        commitChunks()
        useAgentPanel.setState((s) => ({
          sessions: s.sessions.map((v) =>
            v.sessionId === e.sessionId ? { ...v, plan: e.entries } : v,
          ),
        }))
        return
      }
      case 'acp.permission': {
        const state = useAgentPanel.getState()
        if (!state.sessions.some((v) => v.sessionId === e.sessionId)) return
        commitChunks()
        const view: AcpPermissionView = {
          sessionId: e.sessionId,
          requestId: e.requestId,
          title: e.title,
          toolKind: e.toolKind,
          options: e.options,
          content: e.content,
          locations: e.locations,
          // WP-B: carry the session's client scope so the modal can offer the
          // always-allow toggle + chip
          clientSlug: state.sessions.find((v) => v.sessionId === e.sessionId)?.clientSlug ?? null,
        }
        if (state.permission === null) {
          useAgentPanel.setState({ permission: view, pendingPermissions: pendingCount(view) })
        } else {
          permissionQueue.push(view)
          useAgentPanel.setState({ pendingPermissions: pendingCount(state.permission) })
        }
        return
      }
      case 'acp.commands': {
        // pure session metadata (never touches items) → no chunk flush needed.
        // REPLACES wholesale; ignored for unknown sessions (no map match).
        useAgentPanel.setState((s) => ({
          sessions: s.sessions.map((v) =>
            v.sessionId === e.sessionId ? { ...v, commands: e.commands } : v,
          ),
        }))
        return
      }
      case 'acp.mode': {
        // session metadata (no items) → no chunk flush. The initial event
        // carries availableModes (the full set); a later current_mode_update
        // carries only currentModeId — keep the prior set. Unknown session: no
        // map match, ignored.
        useAgentPanel.setState((s) => ({
          sessions: s.sessions.map((v) =>
            v.sessionId === e.sessionId
              ? {
                  ...v,
                  mode: {
                    currentModeId: e.currentModeId,
                    availableModes: e.availableModes ?? v.mode?.availableModes,
                  },
                }
              : v,
          ),
        }))
        return
      }
      case 'acp.usage': {
        // pure session metadata (never touches items) → no chunk flush needed.
        // context/cost/turn all REPLACE (an absent half keeps the prior value).
        // The turn half is a CUMULATIVE session snapshot (SDK Usage docstrings:
        // "across session" / "across all turns"), not a per-turn delta — summing
        // it would over-count quadratically. Ignored for unknown sessions.
        useAgentPanel.setState((s) => ({
          sessions: s.sessions.map((v) => {
            if (v.sessionId !== e.sessionId) return v
            const prev = v.usage
            return {
              ...v,
              usage: {
                context: e.context ?? prev?.context,
                cost: e.cost ?? prev?.cost,
                turn: e.turn ?? prev?.turn,
              },
            }
          }),
        }))
        return
      }
      case 'acp.turnEnd': {
        commitChunks()
        patchSession(e.sessionId, { busy: false })
        return
      }
      default:
        return
    }
  })
  // devtools/CDP verifier handle (the __loredexTerminal precedent):
  // window.__loredexAgentPanel.getState() to inspect { open, sessions,
  // activeId, permission }; .getState().openHere() / .send(text) /
  // .toggle() to drive the panel programmatically
  ;(window as Window & { __loredexAgentPanel?: typeof useAgentPanel }).__loredexAgentPanel =
    useAgentPanel
}
