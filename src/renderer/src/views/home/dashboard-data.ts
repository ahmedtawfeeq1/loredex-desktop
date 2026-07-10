/**
 * Home dashboard data store (story 15.5): one load over the existing channels
 * the spec's §4 table names — dashboard.build, contracts.timeline (+ roots),
 * activity.feed since local midnight, sync.status. Handoff cards and the brief
 * ride the existing stores (useHandoffs / useHome) — Home renders the same
 * objects the board does, so inline actions recompute instantly.
 *
 * Live recompute: the existing watcher/poller renderer events schedule ONE
 * debounced (500 ms) reload — no Refresh button on Home, by design.
 */
import { create } from 'zustand'
import type { ProductDashboard } from '../../../../shared/ipc-contract'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import type { ActivityEvent, ContractChange, SyncHealth } from '../../../../shared/types'
import { invoke } from '../../api'
import { startOfTodayIso } from './insights'

export const RECOMPUTE_DEBOUNCE_MS = 500

interface DashboardDataState {
  /** null until first load (skeleton tiles) */
  dash: ProductDashboard | null
  changes: ContractChange[] | null
  /** project roots registered? 0 hides the churn section entirely (spec §3) */
  rootsCount: number | null
  activity: ActivityEvent[] | null
  health: SyncHealth | null
  error: string | null
  load(): Promise<void>
  reset(): void
}

export const useDashboardData = create<DashboardDataState>((set, get) => ({
  dash: null,
  changes: null,
  rootsCount: null,
  activity: null,
  health: null,
  error: null,

  async load() {
    // the core payload — its failure is the view's one honest error line
    try {
      set({ dash: await invoke('dashboard.build', undefined), error: null })
    } catch (e) {
      set({
        dash: get().dash ?? { states: [], handoffs: [], edges: [] },
        error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e),
      })
    }
    // the satellites degrade independently — a tile goes quiet, never an error
    const [roots, timeline, feed, health] = await Promise.allSettled([
      invoke('settings.projectRoots.get', undefined),
      invoke('contracts.timeline', {}),
      invoke('activity.feed', { since: startOfTodayIso(new Date()) }),
      invoke('sync.status', undefined),
    ])
    set({
      rootsCount: roots.status === 'fulfilled' ? Object.keys(roots.value.roots).length : 0,
      changes: timeline.status === 'fulfilled' ? timeline.value : [],
      activity: feed.status === 'fulfilled' ? feed.value : [],
      health: health.status === 'fulfilled' ? health.value : get().health,
    })
  },

  reset() {
    set({ dash: null, changes: null, rootsCount: null, activity: null, health: null, error: null })
  },
}))

// Live recompute (spec note 1) lands with the build plan's fourth commit —
// the debounced watcher/poller subscription replaces this marker.
