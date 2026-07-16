/**
 * Plan preview flag (DESIGN v3 §6.4): the Plan view ships behind a flag
 * until the loredex work-item schema (§8) lands — flagged builds read
 * handoffs only. Toggled from the ⌘K palette; persisted in localStorage.
 */
import { create } from 'zustand'

const KEY = 'loredex.plan.enabled'

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    return false
  }
}

interface PlanFlagState {
  enabled: boolean
  toggle(): void
}

export const usePlanFlag = create<PlanFlagState>((set, get) => ({
  enabled: load(),
  toggle() {
    const enabled = !get().enabled
    set({ enabled })
    try {
      localStorage.setItem(KEY, String(enabled))
    } catch {
      // session-only without storage
    }
  },
}))
