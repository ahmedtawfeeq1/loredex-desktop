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
  load(): Promise<void>
  refreshFleet(): Promise<void>
  selectClient(slug: string | null): void
  reset(): void
}

export const useDex = create<DexState>((set, get) => ({
  type: null,
  fleet: null,
  lints: null,
  selectedClient: null,

  async load() {
    try {
      const { type } = await invoke('vault.dexInfo', undefined)
      set({ type })
      if (type === 'agent-ops') await get().refreshFleet()
    } catch {
      set({ type: 'research' }) // older core host — behave like a research dex
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

  reset() {
    set({ type: null, fleet: null, lints: null, selectedClient: null })
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
