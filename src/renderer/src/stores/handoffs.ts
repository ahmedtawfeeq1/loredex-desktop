/**
 * Handoffs board store (story 3.2): one company-wide fetch, lanes derived in
 * the view (pure lanes.ts). Refreshes on vault.changed / handoff events.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { HandoffCard } from '../../../shared/types'
import { invoke } from '../api'

interface HandoffsState {
  /** null until first load (skeleton); company-wide, lanes derived per project */
  cards: HandoffCard[] | null
  error: string | null
  /** 'all' = company-wide PM view */
  project: string | 'all'
  load(): Promise<void>
  setProject(project: string | 'all'): void
  reset(): void
}

export const useHandoffs = create<HandoffsState>((set) => ({
  cards: null,
  error: null,
  project: 'all',

  async load() {
    try {
      const cards = await invoke('handoffs.list', { scope: 'all' })
      set({ cards, error: null })
    } catch (e) {
      set({ cards: [], error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e) })
    }
  },

  setProject(project) {
    set({ project })
  },

  reset() {
    set({ cards: null, error: null, project: 'all' })
  },
}))
