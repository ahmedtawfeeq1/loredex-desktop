// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// @testing-library/react's auto-cleanup only registers when `afterEach` is a
// global (vitest.config.ts here runs with globals off), so without this the
// second test's queries see both renders' DOM.
afterEach(() => cleanup())

// the section components each fire IPC on mount; stub them to isolate tab logic
vi.mock('./ThemeSection', () => ({ ThemeSection: () => <div>Appearance-card</div> }))
vi.mock('./IdentityForm', () => ({ IdentityForm: () => <div>Identity-card</div> }))
vi.mock('./ContractsSection', () => ({ ContractsSection: () => <div>Contracts-card</div> }))
vi.mock('./DuplicatesSection', () => ({ DuplicatesSection: () => <div>Duplicates-card</div> }))
vi.mock('./ScopeSettings', () => ({ ScopeSettings: () => <div>Scope-card</div> }))
vi.mock('./GitHubSection', () => ({ GitHubSection: () => <div>GitHub-card</div> }))
vi.mock('./McpSection', () => ({ McpSection: () => <div>Mcp-card</div> }))
vi.mock('./TypographySection', () => ({ TypographySection: () => <div>Typography-card</div> }))
vi.mock('../sync/SyncPanel', () => ({ SyncPanel: () => <div>Sync-card</div> }))
vi.mock('./GeneralSection', () => ({ GeneralSection: () => <div>General-card</div> }))
vi.mock('./McpServerSection', () => ({ McpServerSection: () => <div>McpServer-card</div> }))
vi.mock('./ShortcutsSection', () => ({ ShortcutsSection: () => <div>Shortcuts-card</div> }))
vi.mock('../agents/AgentsView', () => ({ AgentTokensCard: () => <div>AgentTokens-card</div> }))
vi.mock('../../api', () => ({
  invoke: () => Promise.reject(new Error('stub')),
  onEvent: () => () => {},
}))

import { useSettingsTab } from '../../stores/settingsTab'
import { SettingsView } from './SettingsView'

afterEach(() => useSettingsTab.setState({ section: 'general' }))

describe('SettingsView (v3 slice C — two-pane settings IA)', () => {
  it('opens on General with the three nav groups', () => {
    render(<SettingsView />)
    expect(screen.getByText('General-card')).toBeTruthy()
    expect(screen.getByText('WORKSPACE · SHARED')).toBeTruthy()
    expect(screen.getByText('PERSONAL · THIS MACHINE')).toBeTruthy()
    expect(screen.getByText('SYSTEM')).toBeTruthy()
  })

  it('nav rows switch sections (Filing rules = scope + duplicates)', () => {
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Filing rules' }))
    expect(screen.getByText('Scope-card')).toBeTruthy()
    expect(screen.getByText('Duplicates-card')).toBeTruthy()
    expect(screen.queryByText('General-card')).toBeNull()
  })

  it('the legacy tab shim still deep-links (System → Sync & git)', () => {
    useSettingsTab.getState().setTab('System')
    render(<SettingsView />)
    expect(screen.getByText('Sync-card')).toBeTruthy()
  })

  it('search filters the nav', () => {
    render(<SettingsView />)
    fireEvent.change(screen.getByPlaceholderText('search settings…'), {
      target: { value: 'git' },
    })
    expect(screen.getByRole('button', { name: /GitHub/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Appearance' })).toBeNull()
  })
})
