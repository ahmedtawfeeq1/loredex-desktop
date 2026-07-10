/**
 * Vault tree sections (story 16.3, DESIGN.md Addendum D1): which section rows
 * (top-level groups + projects) are collapsed. State persists PER VAULT
 * through the core host's app.db settings channels — the toggle applies
 * immediately, persistence is best-effort (rails pattern, story 16.2).
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import { invoke } from '../api'

interface TreeSectionsState {
  /** vault-relative paths of the collapsed section rows */
  collapsed: string[]
  load(): Promise<void>
  toggle(path: string): void
  reset(): void
}

function persist(): void {
  const { collapsed } = useTreeSections.getState()
  try {
    void invoke('settings.treeSections.set', { collapsed }).catch(() => {
      // stays applied for this session; next launch re-reads the stored value
    })
  } catch {
    // no bridge (node tests) — session-only
  }
}

export const useTreeSections = create<TreeSectionsState>((set, get) => ({
  collapsed: [],

  async load() {
    try {
      const stored = await invoke('settings.treeSections.get', undefined)
      set({ collapsed: stored.collapsed })
    } catch (e) {
      // first-attach port swap drops early invokes — retry once (app.init pattern)
      if (isErrEnvelope(e) && e.code === 'PORT_SWAPPED') return get().load()
      // no core yet — every section starts expanded
    }
  },

  toggle(path) {
    const { collapsed } = get()
    set({
      collapsed: collapsed.includes(path)
        ? collapsed.filter((p) => p !== path)
        : [...collapsed, path],
    })
    persist()
  },

  reset() {
    set({ collapsed: [] })
  },
}))
