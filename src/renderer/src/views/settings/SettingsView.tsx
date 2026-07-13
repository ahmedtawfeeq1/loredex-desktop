/**
 * Settings view — tabbed multi-column cards. Tabs hold cards in a responsive
 * grid (1 col narrow → 2-3 wide). Local tab state only; each section component
 * is reused unchanged inside a card. One gold primary per tab.
 */
import { useState } from 'react'
import { ContractsSection } from './ContractsSection'
import { DuplicatesSection } from './DuplicatesSection'
import { GitHubSection } from './GitHubSection'
import { IdentityForm } from './IdentityForm'
import { McpSection } from './McpSection'
import { ScopeSettings } from './ScopeSettings'
import { ThemeSection } from './ThemeSection'
import { TypographySection } from './TypographySection'

const TABS = ['General', 'Typography', 'Vault', 'Integrations'] as const
type Tab = (typeof TABS)[number]

export function SettingsView(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('General')

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
        {tab === 'General' && (
          <>
            <ThemeSection />
            <IdentityForm />
          </>
        )}
        {tab === 'Typography' && <TypographySection />}
        {tab === 'Vault' && (
          <>
            <ScopeSettings />
            <ContractsSection />
            <DuplicatesSection />
          </>
        )}
        {tab === 'Integrations' && (
          <>
            <GitHubSection />
            <McpSection />
          </>
        )}
      </div>
    </div>
  )
}
