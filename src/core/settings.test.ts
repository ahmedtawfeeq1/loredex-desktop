/** Stories 14.1 + 9.2: settings persistence, now app.db-backed (meta table). */
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appSettingSet, initAppDb, type AppDb } from './db/index'
import {
  initSettings,
  loadIdentityProfile,
  loadRailsCollapsed,
  loadThemeSetting,
  loadTreeSectionsCollapsed,
  saveIdentityProfile,
  saveRailsCollapsed,
  saveThemeSetting,
  saveTreeSectionsCollapsed,
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

describe('collapsible rails persistence — PER VAULT (story 16.2, Addendum D1)', () => {
  const openDb = (): AppDb => {
    const db = initAppDb(mkdtempSync(join(tmpdir(), 'loredex-rails-')))
    expect(db).not.toBeNull()
    return db as AppDb
  }

  it('defaults to expanded when nothing is stored', () => {
    expect(loadRailsCollapsed(openDb(), 'vault-a')).toEqual({ sidebar: false, list: false })
  })

  it('round-trips both flags', () => {
    const db = openDb()
    saveRailsCollapsed(db, 'vault-a', { sidebar: true, list: true })
    expect(loadRailsCollapsed(db, 'vault-a')).toEqual({ sidebar: true, list: true })
    saveRailsCollapsed(db, 'vault-a', { sidebar: false, list: true })
    expect(loadRailsCollapsed(db, 'vault-a')).toEqual({ sidebar: false, list: true })
  })

  it('vaults never clobber each other — the state is keyed by vault id', () => {
    const db = openDb()
    saveRailsCollapsed(db, 'vault-a', { sidebar: true, list: false })
    saveRailsCollapsed(db, 'vault-b', { sidebar: false, list: true })
    expect(loadRailsCollapsed(db, 'vault-a')).toEqual({ sidebar: true, list: false })
    expect(loadRailsCollapsed(db, 'vault-b')).toEqual({ sidebar: false, list: true })
  })

  it('malformed or non-boolean rows degrade to expanded, never throw', () => {
    const db = openDb()
    appSettingSet(db, 'vault-a', 'rails', 'not json {')
    expect(loadRailsCollapsed(db, 'vault-a')).toEqual({ sidebar: false, list: false })
    appSettingSet(db, 'vault-a', 'rails', JSON.stringify({ sidebar: 'yes', list: 1 }))
    expect(loadRailsCollapsed(db, 'vault-a')).toEqual({ sidebar: false, list: false })
  })
})

describe('vault tree sections collapsed-state persistence — PER VAULT (story 16.3, Addendum D1)', () => {
  const openDb = (): AppDb => {
    const db = initAppDb(mkdtempSync(join(tmpdir(), 'loredex-tree-sections-')))
    expect(db).not.toBeNull()
    return db as AppDb
  }

  it('defaults to nothing collapsed when nothing is stored', () => {
    expect(loadTreeSectionsCollapsed(openDb(), 'vault-a')).toEqual({ collapsed: [] })
  })

  it('round-trips the collapsed section paths (incl. back to empty)', () => {
    const db = openDb()
    saveTreeSectionsCollapsed(db, 'vault-a', { collapsed: ['projects', 'projects/nimbus-backend'] })
    expect(loadTreeSectionsCollapsed(db, 'vault-a')).toEqual({
      collapsed: ['projects', 'projects/nimbus-backend'],
    })
    saveTreeSectionsCollapsed(db, 'vault-a', { collapsed: [] })
    expect(loadTreeSectionsCollapsed(db, 'vault-a')).toEqual({ collapsed: [] })
  })

  it('vaults never clobber each other — the state is keyed by vault id', () => {
    const db = openDb()
    saveTreeSectionsCollapsed(db, 'vault-a', { collapsed: ['_index'] })
    saveTreeSectionsCollapsed(db, 'vault-b', { collapsed: ['projects/nimbus-mobile'] })
    expect(loadTreeSectionsCollapsed(db, 'vault-a')).toEqual({ collapsed: ['_index'] })
    expect(loadTreeSectionsCollapsed(db, 'vault-b')).toEqual({
      collapsed: ['projects/nimbus-mobile'],
    })
  })

  it('malformed or non-string rows degrade to nothing collapsed, never throw', () => {
    const db = openDb()
    appSettingSet(db, 'vault-a', 'treeSections', 'not json {')
    expect(loadTreeSectionsCollapsed(db, 'vault-a')).toEqual({ collapsed: [] })
    appSettingSet(db, 'vault-a', 'treeSections', JSON.stringify({ collapsed: 'projects' }))
    expect(loadTreeSectionsCollapsed(db, 'vault-a')).toEqual({ collapsed: [] })
    appSettingSet(db, 'vault-a', 'treeSections', JSON.stringify({ collapsed: [1, '_index', null] }))
    expect(loadTreeSectionsCollapsed(db, 'vault-a')).toEqual({ collapsed: ['_index'] })
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
