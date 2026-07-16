/** Settings tab (v3 §5 regroup, story 26.6): Workspace / Personal / System.
 *  A store (not local state) so sync pills and the dissolved 'sync' view can
 *  deep-link straight to System. */
import { create } from 'zustand'

export type SettingsTab = 'Workspace' | 'Personal' | 'System'

interface SettingsTabState {
  tab: SettingsTab
  setTab(tab: SettingsTab): void
}

export const useSettingsTab = create<SettingsTabState>((set) => ({
  tab: 'Workspace',
  setTab(tab) {
    set({ tab })
  },
}))

/** Open Settings on the System tab (the old Sync view's new home). */
export function openSystemSettings(setView: (v: 'settings') => void): void {
  useSettingsTab.getState().setTab('System')
  setView('settings')
}
