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
  type AcpCommand,
  type AcpMcpServer,
  type AcpMode,
  type AcpPermissionOption,
  type AcpPlanEntry,
  type AcpSessionState,
  type AcpToolContent,
  type AcpToolLocation,
} from '../../../shared/ipc-contract'
import { clampPanelWidth, DEFAULT_PANEL_WIDTH } from '../agent/panelWidth'
import { invoke, onEvent } from '../api'

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
      /** the adapter's tool output — before/after diffs + text (A2) */
      content?: AcpToolContent[]
      /** files this tool touched — ABSOLUTE paths, relativized before open (A2) */
      locations?: AcpToolLocation[]
    }

export interface AcpSessionView {
  sessionId: string
  agent: AcpAgent
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
  sessions: AcpSessionView[]
  activeId: string | null
  /** the surfaced permission request; more queue module-side (FIFO) */
  permission: AcpPermissionView | null
  /** the composer draft — lifted into the store (A8) so addContext can
   *  pre-fill it from a note selection; the panel textarea is controlled by it */
  draft: string
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
  openHere(cwd?: string): Promise<void>
  select(id: string): void
  /** controlled-input setter for the composer textarea (A8) */
  setDraft(text: string): void
  /** add-to-chat (A8): open the panel and pre-fill the composer with a
   *  quoted, source-attributed excerpt from a note — never auto-sends. Stacks
   *  onto an existing draft (blank-line separated) so several excerpts gather. */
  addContext(text: string, path: string): void
  send(text: string): Promise<void>
  /** switch a session's mode (A7) — optimistic, reverts if agent.setMode fails */
  setMode(sessionId: string, modeId: string): Promise<void>
  cancel(): void
  respondPermission(optionId: string | null): void
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

export const useAgentPanel = create<AgentPanelState>((set, get) => ({
  open: false,
  width: DEFAULT_PANEL_WIDTH,
  resizing: false,
  agent: 'claude',
  filter: 'all',
  providerAuth: defaultProviderAuth(),
  sessions: [],
  activeId: null,
  permission: null,
  draft: '',

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

  async openHere(cwd) {
    set({ open: true }) // optimistic — the panel appears while the start rides
    persist()
    const gen = resetGen
    const agent = get().agent
    let sessionId: string
    try {
      ;({ sessionId } = await invoke(
        'acp.start',
        cwd === undefined ? { agent } : { agent, cwd },
      ))
    } catch {
      // session cap / invalid cwd / no core — the start silently doesn't
      // happen (terminal splitActive precedent); the panel stays open
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

  async send(text) {
    if (!text.trim()) return
    const { activeId, sessions } = get()
    const session = sessions.find((v) => v.sessionId === activeId)
    // belt and braces — the input is disabled in these states anyway
    if (!session || session.state !== 'ready' || session.busy) return
    const id = session.sessionId
    const title =
      session.title === 'New session'
        ? text.trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 48)
        : session.title
    set((s) => ({
      sessions: s.sessions.map((v) =>
        v.sessionId === id
          ? { ...v, busy: true, title, items: [...v.items, { type: 'user' as const, text }] }
          : v,
      ),
    }))
    try {
      await invoke('acp.prompt', { sessionId: id, text })
    } catch (e) {
      // ACP_BUSY / dead core: revert busy, surface the envelope as detail
      patchSession(id, { busy: false, detail: isErrEnvelope(e) ? e.message : String(e) })
    }
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

  respondPermission(optionId) {
    const perm = get().permission
    if (!perm) return
    try {
      // optionId null = dismissed → cancelled outcome (dismissing is rejecting)
      void invoke('acp.permission', {
        sessionId: perm.sessionId,
        requestId: perm.requestId,
        optionId,
      }).catch(() => {}) // turn may have been cancelled across the invoke — core no-ops
    } catch {
      // no bridge (node tests)
    }
    set({ permission: permissionQueue.shift() ?? null })
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
      return {
        sessions,
        activeId: s.activeId === id ? (sessions[0]?.sessionId ?? null) : s.activeId,
        // a surfaced permission for the closed session would hang the modal —
        // core already answered it cancelled on stop; advance locally too
        permission:
          s.permission?.sessionId === id ? (permissionQueue.shift() ?? null) : s.permission,
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
    permissionQueue = []
    set({
      open: false,
      width: DEFAULT_PANEL_WIDTH,
      resizing: false,
      agent: 'claude',
      filter: 'all',
      providerAuth: defaultProviderAuth(),
      sessions: [],
      activeId: null,
      permission: null,
      draft: '',
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
        if (!known) return
        commitChunks()
        // a non-ready state is a dead/blocked session: core already answered its
        // held permissions 'cancelled' (cancelPendingPermissions on exit/error).
        // Purge this session's queued requests so a healthy session isn't stalled
        // behind them, and advance past a surfaced one so the modal doesn't hang
        // on a dead session — the same reconciliation closeSession does.
        if (e.state !== 'ready') {
          permissionQueue = permissionQueue.filter((p) => p.sessionId !== e.sessionId)
        }
        // any non-ready state also clears busy: a mid-turn death (adapter
        // exit) emits no turnEnd, and a stuck Stop button helps nobody
        useAgentPanel.setState((s) => ({
          sessions: s.sessions.map((v) =>
            v.sessionId === e.sessionId
              ? {
                  ...v,
                  state: e.state,
                  detail: e.detail,
                  busy: e.state === 'ready' ? v.busy : false,
                  // MCP list rides the ready event only (A7) — keep it across
                  // later non-ready transitions
                  mcpServers: e.mcpServers ?? v.mcpServers,
                  authMode: e.authMode ?? v.authMode,
                }
              : v,
          ),
          permission:
            e.state !== 'ready' && s.permission?.sessionId === e.sessionId
              ? (permissionQueue.shift() ?? null)
              : s.permission,
          // login-state chip (A6): a ready session proves the provider is signed
          // in; auth_required flags it needs login. Other states (starting /
          // error / exited) say nothing about auth — leave the last verdict.
          providerAuth:
            e.state === 'ready' || e.state === 'auth_required'
              ? { ...s.providerAuth, [e.agent]: e.state === 'ready' ? 'ok' : 'auth_required' }
              : s.providerAuth,
        }))
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
                  content: e.content,
                  locations: e.locations,
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
        }
        if (state.permission === null) useAgentPanel.setState({ permission: view })
        else permissionQueue.push(view)
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
