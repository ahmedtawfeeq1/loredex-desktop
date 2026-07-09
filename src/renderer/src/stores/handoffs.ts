/**
 * Handoffs board store (story 3.2): one company-wide fetch, lanes derived in
 * the view (pure lanes.ts). Refreshes on vault.changed / handoff events.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { ConsumeReceipt, HandoffCard } from '../../../shared/types'
import { invoke } from '../api'
import { effectiveIdentity, useIdentity } from './identity'

interface HandoffsState {
  /** null until first load (skeleton); company-wide, lanes derived per project */
  cards: HandoffCard[] | null
  error: string | null
  /** 'all' = company-wide PM view */
  project: string | 'all'
  /** last consume receipt (story 3.4) — shown until dismissed */
  receipt: ConsumeReceipt | null
  /** card mid-consume (button disabled) */
  consumingId: string | null
  /** stamp-press animation trigger for the just-consumed card */
  pressedId: string | null
  load(): Promise<void>
  consume(card: HandoffCard): Promise<void>
  dismissReceipt(): void
  setProject(project: string | 'all'): void
  reset(): void
}

export const useHandoffs = create<HandoffsState>((set, get) => ({
  cards: null,
  error: null,
  project: 'all',
  receipt: null,
  consumingId: null,
  pressedId: null,

  async load() {
    try {
      const cards = await invoke('handoffs.list', { scope: 'all' })
      set({ cards, error: null })
    } catch (e) {
      set({ cards: [], error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e) })
    }
  },

  /** AC5: optimistic flip + stamp press now; the lib write follows; revert on failure. */
  async consume(card) {
    const identity = effectiveIdentity(useIdentity.getState())
    if (!identity || card.status !== 'open' || get().consumingId) return
    const before = get().cards
    set({
      consumingId: card.id,
      pressedId: card.id,
      cards: (before ?? []).map((c) => (c.id === card.id ? { ...c, status: 'consumed' } : c)),
    })
    try {
      const receipt = await invoke('handoffs.consume', { id: card.id, identity })
      set({ receipt, error: null, consumingId: null })
      // authoritative refetch arrives via the consume's vault.changed event too
      void get().load()
    } catch (e) {
      set({
        cards: before,
        pressedId: null,
        consumingId: null,
        error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e),
      })
    }
  },

  dismissReceipt() {
    set({ receipt: null, pressedId: null })
  },

  setProject(project) {
    set({ project })
  },

  reset() {
    set({
      cards: null,
      error: null,
      project: 'all',
      receipt: null,
      consumingId: null,
      pressedId: null,
    })
  },
}))
