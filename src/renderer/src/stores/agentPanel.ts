/**
 * Agent panel store (acp blueprint 2026-07-18): right-dock panel open/width,
 * the ACP sessions with their chat threads, and the permission FIFO — all fed
 * by the acp.* CoreEvents. Rails-pattern persistence: {open, width} ride the
 * per-vault `agentPanel` app_settings row (width is fixed 340 in v1 — the
 * field persists so drag is additive later). Unlike pty output, chat text
 * lives IN state; chunks batch through a module-scope sink and one
 * rAF-coalesced commit so React renders at frame rate, not per event
 * (core already batches at 8ms).
 */
import { create } from 'zustand'
import {
  isErrEnvelope,
  type AcpAgent,
  type AcpPermissionOption,
  type AcpPlanEntry,
  type AcpSessionState,
} from '../../../shared/ipc-contract'
import { invoke, onEvent } from '../api'

export const DEFAULT_PANEL_WIDTH = 340

export type AcpChatItem =
  | { type: 'user'; text: string }
  | { type: 'agent'; text: string } // grows in place while streaming
  | { type: 'thought'; text: string }
  | { type: 'tool'; toolCallId: string; title: string; toolKind?: string; status: string }

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
}

export interface AcpPermissionView {
  sessionId: string
  requestId: string
  title: string
  toolKind?: string
  options: AcpPermissionOption[]
}

interface AgentPanelState {
  open: boolean
  width: number
  /** what openHere() STARTS — running sessions keep their agent */
  agent: AcpAgent
  sessions: AcpSessionView[]
  activeId: string | null
  /** the surfaced permission request; more queue module-side (FIFO) */
  permission: AcpPermissionView | null
  load(): Promise<void>
  /** open/close + persist — no session spawn (unlike the terminal toggle) */
  toggle(): void
  setAgent(a: AcpAgent): void
  /** open the panel + acp.start + select the new session */
  openHere(cwd?: string): Promise<void>
  select(id: string): void
  send(text: string): Promise<void>
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
  agent: 'claude',
  sessions: [],
  activeId: null,
  permission: null,

  async load() {
    try {
      const stored = await invoke('settings.agentPanel.get', undefined)
      set({ open: stored.open, width: stored.width })
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

  setAgent(agent) {
    set({ agent })
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
      agent: 'claude',
      sessions: [],
      activeId: null,
      permission: null,
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
                }
              : v,
          ),
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
        }
        if (state.permission === null) useAgentPanel.setState({ permission: view })
        else permissionQueue.push(view)
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
