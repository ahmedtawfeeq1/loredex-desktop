/**
 * Collapsible rails (story 16.2, DESIGN.md Addendum D1): the nav sidebar
 * collapses to a 56px icon rail (⌘\) and the file-list pane to 0 (⌘⇧\).
 * State persists PER VAULT through the core host's app.db settings channels —
 * the toggle applies immediately, persistence is best-effort (theme pattern).
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import { invoke } from '../api'
import { clampListWidth, DEFAULT_LIST_WIDTH } from '../views/reader/listPaneWidth'

interface RailsState {
  /** nav sidebar collapsed to the 56px icon rail */
  sidebar: boolean
  /** file-list pane collapsed to 0 (reader full-bleed) */
  list: boolean
  /** file-list pane width in px (story epic17.4); clamped 200–480, default 300 */
  listWidth: number
  /** true while the divider is being dragged — kills the width transition so
   *  the pane tracks the cursor 1:1 (session-only, never persisted) */
  resizing: boolean
  load(): Promise<void>
  toggleSidebar(): void
  toggleList(): void
  /** live drag — clamps and applies WITHOUT persisting (many events per drag) */
  dragListWidth(px: number): void
  /** persist the current width — drag-end (pointerup) */
  commitListWidth(): void
  /** double-click the divider → back to the 300px default, persisted */
  resetListWidth(): void
  setResizing(resizing: boolean): void
  reset(): void
}

function persist(): void {
  const { sidebar, list } = useRails.getState()
  try {
    void invoke('settings.rails.set', { sidebar, list }).catch(() => {
      // stays applied for this session; next launch re-reads the stored value
    })
  } catch {
    // no bridge (node tests) — session-only
  }
}

function persistWidth(): void {
  const { listWidth } = useRails.getState()
  try {
    void invoke('settings.listWidth.set', { width: listWidth }).catch(() => {
      // best-effort, same contract as the rails-collapse persist above
    })
  } catch {
    // no bridge (node tests) — session-only
  }
}

export const useRails = create<RailsState>((set, get) => ({
  sidebar: false,
  list: false,
  listWidth: DEFAULT_LIST_WIDTH,
  resizing: false,

  async load() {
    try {
      const stored = await invoke('settings.rails.get', undefined)
      set({ sidebar: stored.sidebar, list: stored.list })
    } catch (e) {
      // first-attach port swap drops early invokes — retry once (app.init pattern)
      if (isErrEnvelope(e) && e.code === 'PORT_SWAPPED') return get().load()
      // no core yet — rails start expanded
    }
    // width rides its own app_settings row (beside `rails`) — a separate,
    // independently-degrading read so a missing row keeps the 300px default
    try {
      const stored = await invoke('settings.listWidth.get', undefined)
      set({ listWidth: clampListWidth(stored.width) })
    } catch {
      // no core yet — default width
    }
  },

  toggleSidebar() {
    set({ sidebar: !get().sidebar })
    persist()
  },

  toggleList() {
    set({ list: !get().list })
    persist()
  },

  dragListWidth(px) {
    set({ listWidth: clampListWidth(px) })
  },

  commitListWidth() {
    persistWidth()
  },

  resetListWidth() {
    set({ listWidth: DEFAULT_LIST_WIDTH })
    persistWidth()
  },

  setResizing(resizing) {
    set({ resizing })
  },

  reset() {
    set({ sidebar: false, list: false, listWidth: DEFAULT_LIST_WIDTH, resizing: false })
  },
}))
