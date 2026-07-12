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

import { SettingsView } from './SettingsView'

describe('SettingsView tabs', () => {
  it('shows General cards by default and hides other tabs', () => {
    render(<SettingsView />)
    expect(screen.getByText('Appearance-card')).toBeTruthy()
    expect(screen.getByText('Identity-card')).toBeTruthy()
    expect(screen.queryByText('Scope-card')).toBeNull()
  })

  it('switches to the Vault tab on click', () => {
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('tab', { name: 'Vault' }))
    expect(screen.getByText('Scope-card')).toBeTruthy()
    expect(screen.getByText('Contracts-card')).toBeTruthy()
    expect(screen.queryByText('Appearance-card')).toBeNull()
  })
})
