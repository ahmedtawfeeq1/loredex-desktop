/**
 * Handoff board display filter (D1 amendment 6): default `active` so the board
 * opens clean — consumed/declined handoffs are done and stay hidden until asked
 * for. A display-only preference (never a data/count change), persisted app-wide
 * in localStorage so it survives launches; degrades to session-only without it.
 */
import { create } from 'zustand'
import type { BoardFilter } from '../../../shared/handoff-lanes'

const KEY = 'loredex.boardFilter'

function load(): BoardFilter {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'active' || v === 'done' || v === 'all') return v
  } catch {
    // no localStorage (node tests / locked partition) — session default
  }
  return 'active'
}

interface BoardFilterState {
  mode: BoardFilter
  set(mode: BoardFilter): void
}

export const useBoardFilter = create<BoardFilterState>((set) => ({
  mode: load(),
  set(mode) {
    set({ mode })
    try {
      localStorage.setItem(KEY, mode)
    } catch {
      // stays applied for this session
    }
  },
}))
