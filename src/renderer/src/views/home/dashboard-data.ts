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
import type { CoreEvent, ProductDashboard } from '../../../../shared/ipc-contract'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import type { ActivityEvent, ContractChange, SyncHealth } from '../../../../shared/types'
import { invoke, onEvent, onVaultChanged } from '../../api'

export const RECOMPUTE_DEBOUNCE_MS = 500

/** Activity is pulled over the widest range the toggle can select (30d = "This
 *  Month"), so every window the dashboard offers — velocity, backlog, recent
 *  activity, on-track %, WoW trend — folds from one feed load; the range toggle
 *  just re-slices the already-loaded events, no re-fetch. */
export const ACTIVITY_WINDOW_DAYS = 30

/** Local-midnight instant `days` days before `now` — the activity.feed `since`. */
export function activitySinceIso(now: Date, days: number): string {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  midnight.setDate(midnight.getDate() - (days - 1))
  return midnight.toISOString()
}

interface DashboardDataState {
  /** null until first load (skeleton tiles) */
  dash: ProductDashboard | null
  changes: ContractChange[] | null
  /** project roots registered? 0 hides the churn section entirely (spec §3) */
  rootsCount: number | null
  activity: ActivityEvent[] | null
  health: SyncHealth | null
  error: string | null
  /** the project whose brief is being re-curated right now (busy affordance),
   *  or null when idle — a re-curate is a ~1min CLI/LLM run in the core host */
  recuratingProject: string | null
  load(): Promise<void>
  /** re-run curate for a stale project's brief, then refresh so the attention
   *  item clears (its brief is now newer than the notes that outdated it) */
  recurate(project: string): Promise<void>
  reset(): void
}

export const useDashboardData = create<DashboardDataState>((set, get) => ({
  dash: null,
  changes: null,
  rootsCount: null,
  activity: null,
  health: null,
  error: null,
  recuratingProject: null,

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
      invoke('activity.feed', { since: activitySinceIso(new Date(), ACTIVITY_WINDOW_DAYS) }),
      invoke('sync.status', undefined),
    ])
    set({
      rootsCount: roots.status === 'fulfilled' ? Object.keys(roots.value.roots).length : 0,
      changes: timeline.status === 'fulfilled' ? timeline.value : [],
      activity: feed.status === 'fulfilled' ? feed.value : [],
      health: health.status === 'fulfilled' ? health.value : get().health,
    })
  },

  async recurate(project) {
    if (get().recuratingProject) return // one at a time — the CLI holds a vault lock
    set({ recuratingProject: project })
    try {
      await invoke('dashboard.recurate', { project })
      await get().load() // refetch: the brief is now fresh, the stale row drops out
    } catch (e) {
      set({ error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e) })
    } finally {
      set({ recuratingProject: null })
    }
  },

  reset() {
    set({
      dash: null,
      changes: null,
      rootsCount: null,
      activity: null,
      health: null,
      error: null,
      recuratingProject: null,
    })
  },
}))

/** The renderer events that can change any dashboard number (spec §4 last
 *  row): watcher writes, poller-integrated syncs, handoff lifecycle, the
 *  post-integrate contract scan, snooze expiry. Pure — unit-tested. */
export function isRecomputeEvent(kind: CoreEvent['kind']): boolean {
  return (
    kind === 'vault.changed' ||
    kind === 'sync.changed' ||
    kind === 'contract.changed' ||
    kind === 'handoff.new' ||
    kind === 'handoff.created' ||
    kind === 'handoff.stateChanged' ||
    kind === 'snooze.expired'
  )
}

// Live, not Refresh (spec note 1): the existing watcher/poller events schedule
// ONE debounced recompute of the loaded dashboard — a burst of writes (a sync
// integrating ten notes) folds into a single re-pull. Cards and the brief
// refresh through their own stores (useHandoffs subscribes to the same
// events); sync.changed pushes health below without a round-trip.
// (bridge guard keeps this importable from node unit tests)
let recomputeTimer: ReturnType<typeof setTimeout> | null = null

if (typeof window !== 'undefined' && window.loredex) {
  onEvent((e) => {
    if (e.kind === 'sync.changed') {
      useDashboardData.setState({ health: e.health })
    }
    if (!isRecomputeEvent(e.kind)) return
    if (useDashboardData.getState().dash === null) return // Home never visited
    if (recomputeTimer) clearTimeout(recomputeTimer)
    recomputeTimer = setTimeout(() => {
      recomputeTimer = null
      void useDashboardData.getState().load()
    }, RECOMPUTE_DEBOUNCE_MS)
  })

  // menu-driven vault switch: this store is view-local (not in App.tsx's reset
  // list), so it drops its own snapshot; HomeView reloads on the null dash
  onVaultChanged(() => {
    if (recomputeTimer) {
      clearTimeout(recomputeTimer)
      recomputeTimer = null
    }
    useDashboardData.getState().reset()
  })
}
