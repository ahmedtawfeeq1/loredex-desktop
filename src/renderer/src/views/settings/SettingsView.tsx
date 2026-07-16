/**
 * Settings view — tabbed multi-column cards, regrouped per DESIGN v3 §5:
 * Workspace (this dex) / Personal (you) / System (sync & git — the old Sync
 * view dissolved here — plus GitHub + MCP hosts). Tab state lives in a store
 * so deep links (the old 'sync' view id, sync pills) can open System
 * directly. One cobalt primary per tab.
 */

import { ContractsSection } from './ContractsSection'
import { DuplicatesSection } from './DuplicatesSection'
import { GitHubSection } from './GitHubSection'
import { IdentityForm } from './IdentityForm'
import { McpSection } from './McpSection'
import { ScopeSettings } from './ScopeSettings'
import { ThemeSection } from './ThemeSection'
import { useSettingsTab } from '../../stores/settingsTab'
import { SyncPanel } from '../sync/SyncPanel'
import { TypographySection } from './TypographySection'

const TABS = ['Workspace', 'Personal', 'System'] as const
export type SettingsTab = (typeof TABS)[number]

export function SettingsView(): React.JSX.Element {
  const tab = useSettingsTab((s) => s.tab)
  const setTab = useSettingsTab((s) => s.setTab)

  return (
    <div className="settings">
      <div className="board-header">
        <span className="pane-list-title">Settings</span>
      </div>
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className="settings-tab"
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="settings-grid" role="tabpanel">
        {/* v3 §5 regroup: Workspace = this dex, Personal = you, System =
            sync & git (the old Sync view, dissolved here) + hosts */}
        {tab === 'Workspace' && (
          <>
            <ScopeSettings />
            <ContractsSection />
            <DuplicatesSection />
          </>
        )}
        {tab === 'Personal' && (
          <>
            <IdentityForm />
            <ThemeSection />
            <TypographySection />
          </>
        )}
        {tab === 'System' && (
          <>
            <SyncPanel />
            <GitHubSection />
            <McpSection />
          </>
        )}
      </div>
    </div>
  )
}
