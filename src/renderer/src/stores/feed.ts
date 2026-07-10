/**
 * Activity feed store (story 6.2): a recomputed window over the vault git log
 * (never persisted). Load more doubles the window; the feed refreshes after
 * sync integrates (sync.changed) and on vault changes.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { ActivityEvent } from '../../../shared/types'
import { dedupeBySha } from '../views/feed/feed-logic'
import { invoke, onEvent } from '../api'

const PAGE = 100

interface FeedState {
  events: ActivityEvent[] | null
  limit: number
  loading: boolean
  error: string | null
  load(): Promise<void>
  loadMore(): Promise<void>
  reset(): void
}

export const useFeed = create<FeedState>((set, get) => ({
  events: null,
  limit: PAGE,
  loading: false,
  error: null,

  async load() {
    set({ loading: true })
    try {
      const events = await invoke('activity.feed', { limit: get().limit })
      // one commit = one row, however many parse passes ran (defect 14.2-2)
      set({ events: dedupeBySha(events), loading: false, error: null })
    } catch (e) {
      set({
        events: [],
        loading: false,
        error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e),
      })
    }
  },

  async loadMore() {
    set({ limit: get().limit * 2 })
    await get().load()
  },

  reset() {
    set({ events: null, limit: PAGE, loading: false, error: null })
  },
}))

// Live updates: a completed sync (post-integrate) or any vault write refreshes
// the window. (bridge guard keeps this importable from node unit tests)
if (typeof window !== 'undefined' && window.loredex) {
  onEvent((e) => {
    if (e.kind === 'sync.changed' || e.kind === 'vault.changed') {
      if (useFeed.getState().events !== null) void useFeed.getState().load()
    }
  })
}
