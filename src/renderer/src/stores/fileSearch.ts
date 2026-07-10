/**
 * File-pane search modes (story epic17.5, DESIGN.md "D1 amendment 3 —
 * File-pane search modes"): the "Search files…" box gains a Name | Content
 * segmented toggle. Name = the existing tree filter (session query, no
 * backend — VaultTree reads `query` and runs filterTree). Content = full-text
 * vault.search; the flat result list replaces the tree while active, Enter
 * opens the top hit, Esc clears back to the tree.
 *
 * This is a DEDICATED store, separate from the main `search` store (which
 * backs the Search view + ⌘K palette) so typing in the file pane never
 * contaminates the Search view's query/hits.
 */
import { create } from 'zustand'
import type { SearchHit } from '../../../shared/ipc-contract'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import { invoke } from '../api'

export type FileSearchMode = 'name' | 'content'
export const CONTENT_DEBOUNCE_MS = 150

interface FileSearchState {
  mode: FileSearchMode
  query: string
  /** null until the first content query ran (name mode leaves it null) */
  results: SearchHit[] | null
  searching: boolean
  error: string | null
  setMode(mode: FileSearchMode): void
  setQuery(q: string): void
  /** debounced by setQuery; exposed for direct (test) invocation */
  runContentSearch(): Promise<void>
  /** the hit Enter opens — the top-ranked result, or null when none */
  topHit(): SearchHit | null
  /** Enter: open the top hit through the passed opener; true when one existed */
  openTop(open: (path: string) => void): boolean
  /** Esc: clear back to the tree (name mode, empty query, no results) */
  escape(): void
  reset(): void
}

let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0

export const useFileSearch = create<FileSearchState>((set, get) => ({
  mode: 'name',
  query: '',
  results: null,
  searching: false,
  error: null,

  setMode(mode) {
    if (mode === get().mode) return
    if (timer) clearTimeout(timer)
    if (mode === 'content') {
      set({ mode })
      if (get().query.trim()) void get().runContentSearch()
      else set({ results: null, error: null })
    } else {
      // back to Name: drop the content results, keep the query for the filter
      seq++
      set({ mode, results: null, searching: false, error: null })
    }
  },

  setQuery(q) {
    set({ query: q })
    if (get().mode !== 'content') return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void get().runContentSearch(), CONTENT_DEBOUNCE_MS)
  },

  async runContentSearch() {
    const mine = ++seq
    const q = get().query
    if (!q.trim()) {
      set({ results: null, searching: false, error: null })
      return
    }
    set({ searching: true })
    try {
      const hits = await invoke('vault.search', { q, facets: {} })
      if (mine === seq) set({ results: hits, searching: false, error: null })
    } catch (e) {
      if (mine === seq)
        set({ results: [], searching: false, error: isErrEnvelope(e) ? e.message : String(e) })
    }
  },

  topHit() {
    return get().results?.[0] ?? null
  },

  openTop(open) {
    const hit = get().topHit()
    if (!hit) return false
    open(hit.path)
    return true
  },

  escape() {
    if (timer) clearTimeout(timer)
    seq++
    set({ mode: 'name', query: '', results: null, searching: false, error: null })
  },

  reset() {
    if (timer) clearTimeout(timer)
    seq++
    set({ mode: 'name', query: '', results: null, searching: false, error: null })
  },
}))
