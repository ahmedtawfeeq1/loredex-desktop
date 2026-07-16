/** Plan view tab (story 26.4): Board · Backlog · Sprints — session state. */
import { create } from 'zustand'

export type PlanTab = 'board' | 'backlog' | 'sprints'

interface PlanTabState {
  tab: PlanTab
  setTab(tab: PlanTab): void
}

export const usePlanTab = create<PlanTabState>((set) => ({
  tab: 'board',
  setTab(tab) {
    set({ tab })
  },
}))
