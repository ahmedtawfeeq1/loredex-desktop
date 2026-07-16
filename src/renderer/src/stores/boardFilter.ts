/**
 * Handoff board display filter (D1 amendment 6): default `active` so the board
 * opens clean — consumed/declined handoffs are done and stay hidden until asked
 * for. A display-only preference (never a data/count change), persisted app-wide
 * in localStorage so it survives launches; degrades to session-only without it.
 */
import { create } from 'zustand'
import type { BoardFilter, InboxLane } from '../../../shared/handoff-lanes'

const KEY = 'loredex.boardFilter'
const LANE_KEY = 'loredex.inboxLane'

export type { InboxLane } from '../../../shared/handoff-lanes'

function loadLane(): InboxLane {
  try {
    const v = localStorage.getItem(LANE_KEY)
    if (v === 'forme' || v === 'created' || v === 'all') return v
  } catch {
    // no localStorage — session default
  }
  return 'forme'
}

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
  lane: InboxLane
  set(mode: BoardFilter): void
  setLane(lane: InboxLane): void
}

export const useBoardFilter = create<BoardFilterState>((set) => ({
  mode: load(),
  lane: loadLane(),
  set(mode) {
    set({ mode })
    try {
      localStorage.setItem(KEY, mode)
    } catch {
      // stays applied for this session
    }
  },
  setLane(lane) {
    set({ lane })
    try {
      localStorage.setItem(LANE_KEY, lane)
    } catch {
      // stays applied for this session
    }
  },
}))
