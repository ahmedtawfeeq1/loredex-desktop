/** Settings section (v3 parity slice C — reference screens 08–17): the
 *  Settings view is its own two-pane IA. Store (not local state) so sync
 *  pills, the dissolved 'sync' view id, and auth banners deep-link straight
 *  to a section. The legacy Workspace/Personal/System tab API survives as a
 *  mapping so older call sites keep working. */
import { create } from 'zustand'

export type SettingsSection =
  | 'general'
  | 'projects-contracts'
  | 'members-agents'
  | 'filing-rules'
  | 'appearance'
  | 'typography'
  | 'shortcuts'
  | 'mcp-server'
  | 'sync-git'
  | 'github'
  | 'agent-auth'

export type SettingsTab = 'Workspace' | 'Personal' | 'System'

const TAB_TO_SECTION: Record<SettingsTab, SettingsSection> = {
  Workspace: 'general',
  Personal: 'appearance',
  System: 'sync-git',
}

interface SettingsSectionState {
  section: SettingsSection
  setSection(section: SettingsSection): void
  /** legacy deep-link shim (old three-tab API) */
  setTab(tab: SettingsTab): void
}

export const useSettingsTab = create<SettingsSectionState>((set) => ({
  section: 'general',
  setSection(section) {
    set({ section })
  },
  setTab(tab) {
    set({ section: TAB_TO_SECTION[tab] })
  },
}))
