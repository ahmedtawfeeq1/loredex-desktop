/**
 * Search store (story 2.4, upgraded epic22 / D1 amendment 7 §B): ONE raw query
 * string is the source of truth for both the Search view and the ⌘K palette. The
 * client-side operator parser (query-parser.ts) splits it into bare full-text +
 * typed filters; the filters map to the core Facets transport so operators narrow
 * deterministically pre-rank through the same vault.search seam. Facet selects and
 * chips both mutate the query string (setFilter). Recent + saved searches persist
 * in localStorage. Recent NOTES (reader selections) remain the palette empty-query
 * fallback — a separate list from recent SEARCHES.
 */
import { create } from 'zustand'
import { toVaultRelative } from '../../../shared/handoff-lanes'
import type { SearchHit } from '../../../shared/ipc-contract'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { Facets, FacetValues } from '../../../shared/types'
import { invoke } from '../api'
import {
  filtersToFacets,
  type OperatorKey,
  parseQuery,
  type ParsedQuery,
  setOperator,
} from '../views/search/query-parser'
import { useApp } from './app'
import { useReader } from './reader'
import {
  loadStrings,
  pushRecent,
  RECENTS_KEY,
  SAVED_KEY,
  saveStrings,
  toggleSaved,
} from './search-recents'

export const DEBOUNCE_MS = 150
const MAX_RECENTS = 8

interface SearchState {
  q: string
  /** derived from q every setQuery — the one place operators are interpreted */
  parsed: ParsedQuery
  /** null until the first query ran */
  hits: SearchHit[] | null
  values: FacetValues | null
  searching: boolean
  error: string | null
  paletteOpen: boolean
  groupByProject: boolean
  /** last-8 search QUERIES (raw, with operators), most recent first */
  recentSearches: string[]
  /** optional saved-search chips */
  savedSearches: string[]
  /** vault-relative note paths, most recent first (palette empty-query list) */
  recents: string[]
  setQuery(q: string): void
  /** set/clear one operator on the query string (facet selects + chip ×) */
  setFilter(key: OperatorKey, value: string): void
  loadFacetValues(): Promise<void>
  setPaletteOpen(open: boolean): void
  toggleGroupByProject(): void
  /** commit the current query to recents (called when a result is opened) */
  recordSearch(): void
  toggleSaved(q: string): void
  reset(): void
}

let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0

async function runSearch(
  set: (partial: Partial<SearchState>) => void,
  parsed: ParsedQuery,
): Promise<void> {
  const mine = ++seq
  const facets: Facets = filtersToFacets(parsed.filters)
  const hasFilter = Object.keys(facets).length > 0
  // nothing to search: no bare terms AND no operators
  if (!parsed.terms.trim() && !hasFilter) {
    set({ hits: null, searching: false, error: null })
    return
  }
  set({ searching: true })
  try {
    const hits = await invoke('vault.search', { q: parsed.terms, facets })
    if (mine === seq) set({ hits, searching: false, error: null })
  } catch (e) {
    if (mine === seq)
      set({ hits: [], searching: false, error: isErrEnvelope(e) ? e.message : String(e) })
  }
}

export const useSearch = create<SearchState>((set, get) => ({
  q: '',
  parsed: { terms: '', filters: {} },
  hits: null,
  values: null,
  searching: false,
  error: null,
  paletteOpen: false,
  groupByProject: false,
  recentSearches: loadStrings(RECENTS_KEY),
  savedSearches: loadStrings(SAVED_KEY),
  recents: [],

  setQuery(q) {
    const parsed = parseQuery(q)
    set({ q, parsed })
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void runSearch(set, parsed), DEBOUNCE_MS)
  },

  setFilter(key, value) {
    // facet flips edit the query string — one source of truth, no keystroke to
    // debounce, so re-query immediately
    const q = setOperator(get().q, key, value)
    const parsed = parseQuery(q)
    set({ q, parsed })
    if (timer) clearTimeout(timer)
    void runSearch(set, parsed)
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

  toggleGroupByProject() {
    set({ groupByProject: !get().groupByProject })
  },

  recordSearch() {
    const next = pushRecent(get().recentSearches, get().q)
    if (next === get().recentSearches) return
    set({ recentSearches: next })
    saveStrings(RECENTS_KEY, next)
  },

  toggleSaved(q) {
    const next = toggleSaved(get().savedSearches, q)
    set({ savedSearches: next })
    saveStrings(SAVED_KEY, next)
  },

  reset() {
    if (timer) clearTimeout(timer)
    seq++
    // recent/saved SEARCHES are app-wide (localStorage), not wiped on vault change
    set({
      q: '',
      parsed: { terms: '', filters: {} },
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
