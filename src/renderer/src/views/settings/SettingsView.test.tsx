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

import { useSettingsTab } from '../../stores/settingsTab'
import { SettingsView } from './SettingsView'

afterEach(() => useSettingsTab.setState({ tab: 'Workspace' }))

describe('SettingsView tabs (v3 §5 regroup)', () => {
  it('shows Workspace cards by default and hides other tabs', () => {
    render(<SettingsView />)
    expect(screen.getByText('Scope-card')).toBeTruthy()
    expect(screen.getByText('Contracts-card')).toBeTruthy()
    expect(screen.queryByText('Appearance-card')).toBeNull()
  })

  it('switches to Personal on click', () => {
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('tab', { name: 'Personal' }))
    expect(screen.getByText('Identity-card')).toBeTruthy()
    expect(screen.getByText('Appearance-card')).toBeTruthy()
    expect(screen.queryByText('Scope-card')).toBeNull()
  })

  it('System holds the dissolved Sync view + hosts', () => {
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('tab', { name: 'System' }))
    expect(screen.getByText('Sync-card')).toBeTruthy()
    expect(screen.getByText('GitHub-card')).toBeTruthy()
    expect(screen.getByText('Mcp-card')).toBeTruthy()
  })
})
