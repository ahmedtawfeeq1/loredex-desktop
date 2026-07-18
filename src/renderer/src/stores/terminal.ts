/**
 * Terminal drawer store (terminal-splits blueprint 2026-07-18): the pane
 * tree, active pane, and drawer open/height. Rails-pattern persistence:
 * {open, height} ride the per-vault `terminal` app_settings row,
 * fire-and-forget; the layout tree is session-only (pty ids die with the
 * core host — v1 ceiling, no respawn-on-load, so a persisted open=true never
 * auto-respawns a shell at launch). pty OUTPUT never touches this store:
 * term.data forwards straight to the imperative xterm registry.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import { invoke, onEvent } from '../api'
import { clampTermHeight, DEFAULT_TERM_HEIGHT } from '../terminal/drawerHeight'
import {
  collectTermIds,
  firstTermId,
  removePane,
  setRatio,
  splitPane,
  type Pane,
  type PanePath,
} from '../terminal/paneTree'
import { disposeAllTerms, disposeTerm, writeTerm } from '../terminal/xtermRegistry'

interface TerminalState {
  open: boolean
  height: number
  /** null until the first terminal spawns (the drawer renders nothing) */
  root: Pane | null
  /** focused pane; consumers fall back to firstTermId(root) when null */
  activeId: string | null
  /** true mid-drag — kills the height transition (session-only, never persisted) */
  resizing: boolean
  /** termId → exit code, drives the glyph+label chip on dead panes */
  exited: Record<string, number>
  load(): Promise<void>
  toggle(): Promise<void>
  /** B1 one-click login: open the drawer (spawning a shell if none) and run a
   *  command line in the active pty — `claude /login` / `codex login` land here
   *  so the user reuses the same subscription, no API key. Best-effort: no core
   *  / spawn refused → no-op, never throws. */
  runCommand(command: string): Promise<void>
  splitActive(dir: 'row' | 'column'): Promise<void>
  closePane(id: string): Promise<void>
  setActive(id: string): void
  /** live divider drag — no persist (the layout tree isn't persisted in v1) */
  updateRatio(path: PanePath, ratio: number): void
  /** live height drag — clamps, no persist (many events per drag) */
  dragHeight(px: number): void
  /** persist the current height + open — drag-end (pointerup) */
  commitHeight(): void
  /** double-click the handle → back to the 280px default, persisted */
  resetHeight(): void
  setResizing(v: boolean): void
  /** vault switch: kill this window's ptys, dispose xterms, defaults */
  reset(): Promise<void>
}

/** First-open term.create in flight (module scope, session-only): a second ⌃`
 *  during the await must NOT spawn a second pty — it only flips the drawer.
 *  resetGen detects a vault-switch reset() racing the create: the resolved pty
 *  died with its core, so it is killed instead of installed as a zombie pane
 *  (mirrors splitActive's post-await re-check). */
let creating = false
let resetGen = 0

function persist(): void {
  const { open, height } = useTerminal.getState()
  try {
    void invoke('settings.terminal.set', { open, height }).catch(() => {
      // stays applied for this session; next launch re-reads the stored value
    })
  } catch {
    // no bridge (node tests) — session-only
  }
}

export const useTerminal = create<TerminalState>((set, get) => ({
  open: false,
  height: DEFAULT_TERM_HEIGHT,
  root: null,
  activeId: null,
  resizing: false,
  exited: {},

  async load() {
    try {
      const stored = await invoke('settings.terminal.get', undefined)
      set({ open: stored.open, height: clampTermHeight(stored.height) })
    } catch (e) {
      // first-attach port swap drops early invokes — retry once (app.init pattern)
      if (isErrEnvelope(e) && e.code === 'PORT_SWAPPED') return get().load()
      // no core yet — drawer starts closed at the default height
    }
  },

  async toggle() {
    const { open, root } = get()
    if (root === null) {
      if (creating) {
        // login shells can take 100-500ms to spawn — a double-tap ⌃` lands
        // here. Only flip visibility; the pending create below installs the tree.
        set({ open: !open })
        return
      }
      // first open (also reopen after the last pane closed, and the first ⌃`
      // after launch when open=true persisted with nothing to restore into):
      // spawn the shell at the vault root — real cols/rows arrive with the
      // first fit. Optimistic open so the drawer appears the moment the pty is up.
      set({ open: true })
      creating = true
      const gen = resetGen
      let id: string
      try {
        ;({ id } = await invoke('term.create', { cols: 80, rows: 24 }))
      } catch {
        creating = false
        set({ open: false }) // no core yet / spawn refused — stay closed
        return
      }
      creating = false
      if (resetGen !== gen) {
        // a vault-switch reset() landed across the await — this pty belongs to
        // the torn-down core; best-effort kill, never install it as a pane
        void invoke('term.kill', { id }).catch(() => {})
        return
      }
      // install the tree but honor the CURRENT open (a mid-flight ⌃` meant "close")
      set({ root: { kind: 'term', id }, activeId: id })
      persist()
      return
    }
    set({ open: !open })
    persist()
  },

  async runCommand(command) {
    // ensure a live pty AND a visible drawer — the login command must be seen
    if (get().root === null) {
      await get().toggle() // spawns the shell and opens the drawer
    } else if (!get().open) {
      set({ open: true })
      persist()
    }
    const { root, activeId } = get()
    const id = activeId ?? (root ? firstTermId(root) : null)
    if (!id) return // spawn refused / no core — best-effort, never throw
    const data = command.endsWith('\n') ? command : `${command}\n`
    try {
      await invoke('term.input', { id, data })
    } catch {
      // pty died / no bridge (node tests) — best-effort
    }
  },

  async splitActive(dir) {
    const { root, activeId } = get()
    if (root === null) return void get().toggle() // no tree yet — same as open
    const target = activeId ?? firstTermId(root)
    let id: string
    try {
      ;({ id } = await invoke('term.create', { cols: 80, rows: 24 }))
    } catch {
      return // MAX_TERMINALS cap / no core — the split silently doesn't happen
    }
    // the tree may have changed across the await — re-read; if the target is
    // gone (pane closed mid-flight) the fresh pty must not leak
    const now = get().root
    const next = now === null ? null : splitPane(now, target, dir, id)
    if (next === null || next === now) {
      void invoke('term.kill', { id }).catch(() => {})
      return
    }
    set({ root: next, activeId: id, open: true })
  },

  async closePane(id) {
    void invoke('term.kill', { id }).catch(() => {}) // idempotent core-side
    disposeTerm(id)
    const { root, activeId, exited } = get()
    if (root === null) return
    const restExited = { ...exited }
    delete restExited[id]
    const next = removePane(root, id)
    if (next === null) {
      set({ root: null, activeId: null, exited: restExited, open: false })
      persist()
      return
    }
    set({
      root: next,
      exited: restExited,
      activeId: activeId === id ? firstTermId(next) : activeId,
    })
  },

  setActive(id) {
    set({ activeId: id })
  },

  updateRatio(path, ratio) {
    const root = get().root
    if (root) set({ root: setRatio(root, path, ratio) })
  },

  dragHeight(px) {
    set({ height: clampTermHeight(px) })
  },

  commitHeight() {
    persist()
  },

  resetHeight() {
    set({ height: DEFAULT_TERM_HEIGHT })
    persist()
  },

  setResizing(resizing) {
    set({ resizing })
  },

  async reset() {
    resetGen++ // invalidate any first-open create still in flight (see toggle)
    const root = get().root
    if (root) {
      for (const id of collectTermIds(root)) {
        try {
          // the old core host may already be torn down — failures are expected
          void invoke('term.kill', { id }).catch(() => {})
        } catch {
          // no bridge (node tests)
        }
      }
    }
    disposeAllTerms()
    set({
      open: false,
      height: DEFAULT_TERM_HEIGHT,
      root: null,
      activeId: null,
      resizing: false,
      exited: {},
    })
  },
}))

if (typeof window !== 'undefined' && window.loredex) {
  onEvent((e) => {
    // pty output/exit ride CoreEvents (never invokes). A late term.exit for a
    // pane the user already closed carries an id no longer in the tree — ignored.
    if (e.kind === 'term.data') writeTerm(e.id, e.data)
    if (e.kind === 'term.exit') {
      const { root } = useTerminal.getState()
      if (root && collectTermIds(root).includes(e.id)) {
        useTerminal.setState((s) => ({ exited: { ...s.exited, [e.id]: e.code } }))
      }
    }
  })
  // devtools/CDP verifier handle: window.__loredexTerminal.getState() to
  // inspect { open, height, root, activeId, exited }; .getState().toggle()
  // to drive the drawer programmatically
  ;(window as Window & { __loredexTerminal?: typeof useTerminal }).__loredexTerminal = useTerminal
}
