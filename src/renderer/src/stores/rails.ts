/**
 * Collapsible rails (story 16.2, DESIGN.md Addendum D1): the nav sidebar
 * collapses to a 56px icon rail (⌘\) and the file-list pane to 0 (⌘⇧\).
 * State persists PER VAULT through the core host's app.db settings channels —
 * the toggle applies immediately, persistence is best-effort (theme pattern).
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import { invoke } from '../api'

interface RailsState {
  /** nav sidebar collapsed to the 56px icon rail */
  sidebar: boolean
  /** file-list pane collapsed to 0 (reader full-bleed) */
  list: boolean
  load(): Promise<void>
  toggleSidebar(): void
  toggleList(): void
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

export const useRails = create<RailsState>((set, get) => ({
  sidebar: false,
  list: false,

  async load() {
    try {
      const stored = await invoke('settings.rails.get', undefined)
      set({ sidebar: stored.sidebar, list: stored.list })
    } catch (e) {
      // first-attach port swap drops early invokes — retry once (app.init pattern)
      if (isErrEnvelope(e) && e.code === 'PORT_SWAPPED') return get().load()
      // no core yet — rails start expanded
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

  reset() {
    set({ sidebar: false, list: false })
  },
}))
