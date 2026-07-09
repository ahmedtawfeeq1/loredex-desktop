/**
 * Search store (story 2.4): one debounced vault.search backend shared by the
 * search view and the Cmd+K palette; facet vocabulary loaded lazily; recent
 * notes (palette empty-query fallback) tracked from reader selections.
 */
import { create } from 'zustand'
import { toVaultRelative } from '../../../shared/handoff-lanes'
import type { SearchHit } from '../../../shared/ipc-contract'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { Facets, FacetValues } from '../../../shared/types'
import { invoke } from '../api'
import { useApp } from './app'
import { useReader } from './reader'

export const DEBOUNCE_MS = 150
const MAX_RECENTS = 8

interface SearchState {
  q: string
  facets: Facets
  /** null until the first query ran */
  hits: SearchHit[] | null
  values: FacetValues | null
  searching: boolean
  error: string | null
  paletteOpen: boolean
  /** vault-relative note paths, most recent first (palette empty-query list) */
  recents: string[]
  setQuery(q: string): void
  setFacet(key: keyof Facets, value: string): void
  loadFacetValues(): Promise<void>
  setPaletteOpen(open: boolean): void
  reset(): void
}

let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0

async function runSearch(
  set: (partial: Partial<SearchState>) => void,
  q: string,
  facets: Facets,
): Promise<void> {
  const mine = ++seq
  if (!q.trim()) {
    set({ hits: null, searching: false, error: null })
    return
  }
  set({ searching: true })
  try {
    const hits = await invoke('vault.search', { q, facets })
    if (mine === seq) set({ hits, searching: false, error: null })
  } catch (e) {
    if (mine === seq)
      set({ hits: [], searching: false, error: isErrEnvelope(e) ? e.message : String(e) })
  }
}

export const useSearch = create<SearchState>((set, get) => ({
  q: '',
  facets: {},
  hits: null,
  values: null,
  searching: false,
  error: null,
  paletteOpen: false,
  recents: [],

  setQuery(q) {
    set({ q })
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void runSearch(set, q, get().facets), DEBOUNCE_MS)
  },

  setFacet(key, value) {
    const facets = { ...get().facets, [key]: value || undefined }
    set({ facets })
    // facet flips re-query immediately — no keystroke to debounce
    void runSearch(set, get().q, facets)
  },

  async loadFacetValues() {
    try {
      set({ values: await invoke('vault.facets', undefined) })
    } catch {
      set({ values: { projects: [], topics: [], types: [], statuses: [] } })
    }
  },

  setPaletteOpen(open) {
    set({ paletteOpen: open })
  },

  reset() {
    if (timer) clearTimeout(timer)
    seq++
    set({
      q: '',
      facets: {},
      hits: null,
      values: null,
      searching: false,
      error: null,
      paletteOpen: false,
      recents: [],
    })
  },
}))

/** Open a hit (or a recent path) in the reader; Enter and click share this. */
export function openSearchResult(pathAbsOrRel: string): void {
  const vaultPath = useApp.getState().identity?.vaultPath ?? ''
  useSearch.getState().setPaletteOpen(false)
  useApp.getState().setView('reader')
  void useReader.getState().open(toVaultRelative(pathAbsOrRel, vaultPath))
}

// Recents: every reader selection lands at the head of the palette fallback.
useReader.subscribe((state, prev) => {
  const selected = state.selected
  if (!selected || selected === prev.selected) return
  const { recents } = useSearch.getState()
  useSearch.setState({
    recents: [selected, ...recents.filter((p) => p !== selected)].slice(0, MAX_RECENTS),
  })
})
