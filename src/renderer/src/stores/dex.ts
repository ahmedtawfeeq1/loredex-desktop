/**
 * Dex-type store (agent-ops epic): the open dex's declared type plus, on
 * agent-ops dexes, the fleet read model and lint findings that drive the
 * Clients view, tree labels, and the inbox nav badge. Research dexes load the
 * type once and nothing else — zero extra IPC on the default path.
 */
import { create } from 'zustand'
import type { ClientInfo, LintFinding } from '../../../shared/ipc-contract'
import { invoke, onEvent } from '../api'

interface DexState {
  type: 'research' | 'agent-ops' | null
  fleet: ClientInfo[] | null
  lints: LintFinding[] | null
  /** vault-relative selected client slug (Clients view drill-down) */
  selectedClient: string | null
  /** manager scope for the Clients view — the sidebar's product-page drill */
  selectedManager: string | null
  load(): Promise<void>
  refreshFleet(): Promise<void>
  selectClient(slug: string | null): void
  selectManager(manager: string | null): void
  reset(): void
}

export const useDex = create<DexState>((set, get) => ({
  type: null,
  fleet: null,
  lints: null,
  selectedClient: null,
  selectedManager: null,

  async load() {
    try {
      const { type } = await invoke('vault.dexInfo', undefined)
      set({ type })
      if (type === 'agent-ops') await get().refreshFleet()
    } catch {
      // boot race (core host not up yet) or an older core host. Stay null so
      // the app-ready retry in App.tsx can resolve the real type — a hard
      // 'research' here permanently hid the Clients nav on slow boots.
      set({ type: null })
    }
  },

  async refreshFleet() {
    try {
      const [fleet, lints] = await Promise.all([
        invoke('clients.fleet', undefined),
        invoke('clients.lints', undefined),
      ])
      set({ fleet, lints })
    } catch {
      set({ fleet: [], lints: [] })
    }
  },

  selectClient(slug) {
    set({ selectedClient: slug })
  },

  selectManager(manager) {
    set({ selectedManager: manager, selectedClient: null })
  },

  reset() {
    set({ type: null, fleet: null, lints: null, selectedClient: null, selectedManager: null })
  },
}))

/** Pending-consumption count across the fleet — the Clients nav badge. */
export function inboxPending(fleet: ClientInfo[] | null): number {
  return (fleet ?? []).reduce((n, c) => n + c.inboxCount, 0)
}

// live refresh: any vault change may add/consume inbox items or reshape a client
if (typeof window !== 'undefined' && window.loredex) {
  onEvent((e) => {
    if (e.kind !== 'vault.changed') return
    const s = useDex.getState()
    if (s.type === 'agent-ops') void s.refreshFleet()
  })
}
