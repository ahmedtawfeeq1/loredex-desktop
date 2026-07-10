/** Stories 14.1 + 9.2: settings persistence, now app.db-backed (meta table). */
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { initAppDb } from './db/index'
import {
  initSettings,
  loadIdentityProfile,
  loadThemeSetting,
  saveIdentityProfile,
  saveThemeSetting,
} from './settings'

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'loredex-settings-'))
  initAppDb(dir)
  initSettings(dir)
  return dir
}

describe('theme setting persistence', () => {
  it('defaults to system when nothing is stored', () => {
    freshDir()
    expect(loadThemeSetting()).toBe('system')
  })

  it('round-trips a saved setting', () => {
    freshDir()
    saveThemeSetting('dark')
    expect(loadThemeSetting()).toBe('dark')
    saveThemeSetting('light')
    expect(loadThemeSetting()).toBe('light')
  })

  it('preserves sibling settings when saving the theme', () => {
    freshDir()
    saveIdentityProfile({ name: 'Kai Ora', email: 'kai@nimbus.dev' })
    saveThemeSetting('dark')
    expect(loadThemeSetting()).toBe('dark')
    expect(loadIdentityProfile()?.name).toBe('Kai Ora')
  })
})

describe('v0.1 settings.json shim migration (story 9.2 AC3)', () => {
  it('imports the JSON once and renames it to .bak', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loredex-settings-'))
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ identity: { name: 'Kai Ora', email: 'kai@nimbus.dev' }, theme: 'dark' }),
    )
    initAppDb(dir)
    initSettings(dir)
    expect(loadIdentityProfile()).toEqual({ name: 'Kai Ora', email: 'kai@nimbus.dev' })
    expect(loadThemeSetting()).toBe('dark')
    expect(existsSync(join(dir, 'settings.json'))).toBe(false)
    expect(existsSync(join(dir, 'settings.json.bak'))).toBe(true)
  })

  it('is idempotent — a second init does not clobber newer db values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loredex-settings-'))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ theme: 'dark' }))
    initAppDb(dir)
    initSettings(dir)
    saveThemeSetting('light') // user changed it after the import
    initSettings(dir) // respawned host: the .json is gone, nothing re-imports
    expect(loadThemeSetting()).toBe('light')
  })

  it('degrades an invalid imported value to system', () => {
    const dir = mkdtempSync(join(tmpdir(), 'loredex-settings-'))
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ theme: 'sepia' }))
    initAppDb(dir)
    initSettings(dir)
    expect(loadThemeSetting()).toBe('system')
  })
})
