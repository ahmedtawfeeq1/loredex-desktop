/**
 * Read-mode find bar state (story epic17.3, DESIGN.md D1 amendment 3): the
 * floating ⌘F bar in the note pane. Pure UI state — query, case flag, the
 * match total the reader reports back after scanning the rendered DOM, and the
 * 0-indexed current match. The DOM scan + Custom Highlight paint live in the
 * FindBar component (findEngine.ts); this store is the node-testable seam for
 * open/close, case toggle, and prev/next wrap-around.
 */
import { create } from 'zustand'
import { navigate } from '../views/reader/findEngine'

interface FindState {
  open: boolean
  query: string
  caseSensitive: boolean
  /** match count the reader reports after scanning (setResults) */
  total: number
  /** 0-indexed current match; -1 when there are none */
  current: number
  openBar(): void
  close(): void
  setQuery(query: string): void
  toggleCase(): void
  /** the reader's scan result — resets the cursor to the first match */
  setResults(total: number): void
  next(): void
  prev(): void
  reset(): void
}

export const useFind = create<FindState>((set, get) => ({
  open: false,
  query: '',
  caseSensitive: false,
  total: 0,
  current: -1,

  openBar() {
    set({ open: true })
  },

  close() {
    set({ open: false })
  },

  setQuery(query) {
    set({ query })
  },

  toggleCase() {
    set({ caseSensitive: !get().caseSensitive })
  },

  setResults(total) {
    set({ total, current: total > 0 ? 0 : -1 })
  },

  next() {
    const { current, total } = get()
    set({ current: navigate(current, total, 1) })
  },

  prev() {
    const { current, total } = get()
    set({ current: navigate(current, total, -1) })
  },

  reset() {
    set({ open: false, query: '', caseSensitive: false, total: 0, current: -1 })
  },
}))
