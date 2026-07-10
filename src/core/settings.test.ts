/** Story 14.1: theme preference persistence (settings JSON — app.db seam, 9.2). */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { initSettings, loadIdentityProfile, loadThemeSetting, saveThemeSetting } from './settings'

describe('theme setting persistence', () => {
  it('defaults to system when nothing is stored', () => {
    initSettings(mkdtempSync(join(tmpdir(), 'loredex-settings-')))
    expect(loadThemeSetting()).toBe('system')
  })

  it('round-trips a saved setting', () => {
    initSettings(mkdtempSync(join(tmpdir(), 'loredex-settings-')))
    saveThemeSetting('dark')
    expect(loadThemeSetting()).toBe('dark')
    saveThemeSetting('light')
    expect(loadThemeSetting()).toBe('light')
  })

  it('degrades an invalid stored value to system', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loredex-settings-'))
    initSettings(dir)
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ theme: 'sepia' }))
    expect(loadThemeSetting()).toBe('system')
  })

  it('preserves sibling settings when saving the theme', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loredex-settings-'))
    initSettings(dir)
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ identity: { name: 'Kai Ora', email: 'kai@nimbus.dev' } }),
    )
    saveThemeSetting('dark')
    expect(loadThemeSetting()).toBe('dark')
    expect(loadIdentityProfile()?.name).toBe('Kai Ora')
  })
})
