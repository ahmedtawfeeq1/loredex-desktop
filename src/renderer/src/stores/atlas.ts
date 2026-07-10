/**
 * Vault Atlas store (stories 10.2/10.3): thin slice — level/scope navigation,
 * the fetched graph, selection, expanded topic atoms, bounded history. The
 * renderer computes NO layout: positions arrive precomputed from atlas.graph.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { AtlasGraph, AtlasLevel, AtlasScope, TourDef } from '../../../shared/types'
import { clampStep, playbackActionFor } from '../views/atlas/tour-playback'
import { invoke, onEvent } from '../api'

/** UA's MAX_HISTORY concept, kept verbatim (ATLAS-CONCEPT §1.4). */
export const MAX_HISTORY = 50

export interface AtlasHistoryEntry {
  level: AtlasLevel
  scope: AtlasScope
  selectedId: string | null
}

interface AtlasState {
  graph: AtlasGraph | null
  loading: boolean
  error: string | null
  level: AtlasLevel
  scope: AtlasScope
  selectedId: string | null
  /** the one expanded collapsed-atom topic group at Learn — lazy expand shows
   *  one topic's notes at a time (story 10.3 AC2); key `<project>/<topic>` */
  expandedTopic: string | null
  /** visited levels/nodes — bounded back/forward stack (story 10.3) */
  history: AtlasHistoryEntry[]
  historyIndex: number
  /** the one open side panel (story 10.5: tours) */
  panel: 'tour' | null
  /** tours from atlas.tours — recomputed with graph invalidation (10.5 AC5) */
  tours: TourDef[] | null
  activeTour: TourDef | null
  tourStep: number
  /** node ids the current step highlights (pulse ring + viewport fit) */
  tourHighlight: string[]
  setPanel(panel: 'tour' | null): void
  loadTours(): Promise<void>
  startTour(id: string): Promise<void>
  goToStep(step: number): Promise<void>
  nextTourStep(): Promise<void>
  prevTourStep(): Promise<void>
  endTour(): void
  load(): Promise<void>
  /** discrete zoom: push history, fetch the level's graph, carry selection */
  navigate(level: AtlasLevel, scope: AtlasScope): Promise<void>
  drillProject(project: string): Promise<void>
  drillTopic(topic: string): Promise<void>
  /** breadcrumb up: topic → project (Learn) → vault (Overview) */
  up(): Promise<void>
  back(): Promise<void>
  forward(): Promise<void>
  select(id: string | null): void
  toggleTopic(key: string): void
  reset(): void
}

const errText = (e: unknown): string => (isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e))

/** Pure history push: truncate the forward tail, cap at MAX_HISTORY. */
export function pushHistory(
  history: AtlasHistoryEntry[],
  index: number,
  entry: AtlasHistoryEntry,
): { history: AtlasHistoryEntry[]; index: number } {
  const next = [...history.slice(0, index + 1), entry]
  const overflow = next.length - MAX_HISTORY
  const bounded = overflow > 0 ? next.slice(overflow) : next
  return { history: bounded, index: bounded.length - 1 }
}

export const useAtlas = create<AtlasState>((set, get) => ({
  graph: null,
  loading: false,
  error: null,
  level: 'overview',
  scope: {},
  selectedId: null,
  expandedTopic: null,
  history: [{ level: 'overview', scope: {}, selectedId: null }],
  historyIndex: 0,
  panel: null,
  tours: null,
  activeTour: null,
  tourStep: 0,
  tourHighlight: [],

  setPanel(panel) {
    set({ panel })
  },

  async loadTours() {
    try {
      const tours = await invoke('atlas.tours', {})
      const active = get().activeTour
      // re-point playback at the fresh def — steps may have shrunk (AC5)
      const fresh = active ? (tours.find((t) => t.id === active.id) ?? null) : null
      set({
        tours,
        activeTour: fresh,
        tourStep: fresh ? clampStep(get().tourStep, fresh.steps.length) : 0,
        ...(fresh ? {} : { tourHighlight: [] }),
      })
    } catch {
      set({ tours: [] }) // panel shows the honest empty state
    }
  },

  async startTour(id) {
    const tour = (get().tours ?? []).find((t) => t.id === id)
    if (!tour || tour.steps.length === 0) return
    set({ activeTour: tour, panel: 'tour' })
    await get().goToStep(0)
  },

  // step application = the story 10.3 primitives, decided by tour-playback.ts:
  // auto-open the owning cluster, expand its topic atom, highlight + fit
  async goToStep(step) {
    const tour = get().activeTour
    if (!tour) return
    const i = clampStep(step, tour.steps.length)
    const stepDef = tour.steps[i]
    if (!stepDef) return
    const action = playbackActionFor(stepDef, get().level, get().scope)
    set({ tourStep: i, tourHighlight: action.highlight })
    if (action.navigateTo) {
      await get().navigate(action.navigateTo.level, { project: action.navigateTo.project })
    }
    // after navigate (which resets it) so the step's atom is open
    if (action.expandTopic) set({ expandedTopic: action.expandTopic })
  },

  async nextTourStep() {
    await get().goToStep(get().tourStep + 1)
  },

  async prevTourStep() {
    await get().goToStep(get().tourStep - 1)
  },

  endTour() {
    set({ activeTour: null, tourStep: 0, tourHighlight: [] })
  },

  async load() {
    const { level, scope, selectedId } = get()
    set({ loading: true })
    try {
      const graph = await invoke('atlas.graph', { level, scope })
      // AC4 (10.3): selection survives a transition when the node still exists
      const keep = selectedId && graph.nodes.some((n) => n.id === selectedId)
      set({ graph, loading: false, error: null, selectedId: keep ? selectedId : null })
    } catch (e) {
      set({ graph: null, loading: false, error: errText(e) })
    }
  },

  async navigate(level, scope) {
    const s = get()
    const entry: AtlasHistoryEntry = { level, scope, selectedId: s.selectedId }
    set({ level, scope, expandedTopic: null, ...pushHistory(s.history, s.historyIndex, entry) })
    await get().load()
  },

  async drillProject(project) {
    await get().navigate('learn', { project })
  },

  async drillTopic(topic) {
    const { scope, level } = get()
    if (!scope.project) return
    await get().navigate(level === 'overview' ? 'learn' : level, { ...scope, topic })
  },

  async up() {
    const { level, scope } = get()
    if (scope.topic) {
      const next: AtlasScope = { ...(scope.project ? { project: scope.project } : {}) }
      await get().navigate(level, next)
    } else if (level !== 'overview') {
      await get().navigate('overview', {})
    }
  },

  async back() {
    const s = get()
    if (s.historyIndex <= 0) return
    const entry = s.history[s.historyIndex - 1] as AtlasHistoryEntry
    set({
      historyIndex: s.historyIndex - 1,
      level: entry.level,
      scope: entry.scope,
      selectedId: entry.selectedId,
    })
    await get().load()
  },

  async forward() {
    const s = get()
    if (s.historyIndex >= s.history.length - 1) return
    const entry = s.history[s.historyIndex + 1] as AtlasHistoryEntry
    set({
      historyIndex: s.historyIndex + 1,
      level: entry.level,
      scope: entry.scope,
      selectedId: entry.selectedId,
    })
    await get().load()
  },

  select(id) {
    set({ selectedId: id })
  },

  toggleTopic(key) {
    set({ expandedTopic: get().expandedTopic === key ? null : key })
  },

  reset() {
    set({
      graph: null,
      loading: false,
      error: null,
      level: 'overview',
      scope: {},
      selectedId: null,
      expandedTopic: null,
      history: [{ level: 'overview', scope: {}, selectedId: null }],
      historyIndex: 0,
      panel: null,
      tours: null,
      activeTour: null,
      tourStep: 0,
      tourHighlight: [],
    })
  },
}))

// Live refresh (10.2 AC4): the core invalidates its cache on vault.changed /
// handoff events — a loaded atlas refetches the same level/scope. Stamp chips
// mirror board state live (10.4 AC1): stateChanged patches the node in place
// so the stamp flips before (and regardless of) the refetch.
// (bridge guard keeps this importable from node unit tests)
if (typeof window !== 'undefined' && window.loredex) {
  onEvent((e) => {
    const s = useAtlas.getState()
    if (s.graph === null) return // atlas never opened — nothing to refresh
    if (e.kind === 'handoff.stateChanged') {
      const nodes = s.graph.nodes.map((n) =>
        n.type === 'handoff' && n.label === e.id ? { ...n, status: e.to } : n,
      )
      useAtlas.setState({ graph: { ...s.graph, nodes } })
    }
    if (
      e.kind === 'vault.changed' ||
      e.kind === 'handoff.new' ||
      e.kind === 'handoff.created' ||
      e.kind === 'handoff.stateChanged'
    ) {
      void s.load()
      // tours recompute with graph invalidation (10.5 AC5); steps whose notes
      // vanished were already dropped core-side — the tour shrinks, never errors
      if (s.tours !== null) void s.loadTours()
    }
  })
}
