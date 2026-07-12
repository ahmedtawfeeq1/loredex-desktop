/** Stories 14.1 + 9.2: settings persistence, now app.db-backed (meta table). */
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FONT_SETTINGS } from '../shared/font-settings'
import { appSettingSet, getAppDb, initAppDb, metaSet, type AppDb } from './db/index'
import {
  initSettings,
  loadAtlasLegendSeen,
  loadFontSettings,
  loadIdentityProfile,
  loadListPaneWidth,
  loadRailsCollapsed,
  loadThemeSetting,
  loadTreeSectionsCollapsed,
  saveAtlasLegendSeen,
  saveFontSettings,
  saveIdentityProfile,
  saveListPaneWidth,
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

describe('font settings persistence (task 4)', () => {
  it('defaults to all-system when nothing is stored', () => {
    freshDir()
    expect(loadFontSettings()).toEqual(DEFAULT_FONT_SETTINGS)
  })

  it('round-trips a saved value', () => {
    freshDir()
    const next = {
      app: 'dm-sans',
      note: { title: 'unbounded', headings: 'sora', body: 'dm-sans', code: 'space-mono' },
    }
    saveFontSettings(next)
    expect(loadFontSettings()).toEqual(next)
  })

  it('ignores a malformed stored value and falls back to the default', () => {
    freshDir()
    const db = getAppDb()
    expect(db).not.toBeNull()
    metaSet(db as AppDb, 'settings:fonts', 'not json {')
    expect(loadFontSettings()).toEqual(DEFAULT_FONT_SETTINGS)
    metaSet(db as AppDb, 'settings:fonts', JSON.stringify({ app: 'dm-sans' }))
    expect(loadFontSettings()).toEqual(DEFAULT_FONT_SETTINGS)
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

describe('list-pane width persistence — PER VAULT (story epic17.4, Addendum D1)', () => {
  const openDb = (): AppDb => {
    const db = initAppDb(mkdtempSync(join(tmpdir(), 'loredex-list-width-')))
    expect(db).not.toBeNull()
    return db as AppDb
  }

  it('defaults to 300 when nothing is stored', () => {
    expect(loadListPaneWidth(openDb(), 'vault-a')).toBe(300)
  })

  it('round-trips a stored width inside the band', () => {
    const db = openDb()
    saveListPaneWidth(db, 'vault-a', 360)
    expect(loadListPaneWidth(db, 'vault-a')).toBe(360)
  })

  it('clamps out-of-band widths on both save and load', () => {
    const db = openDb()
    saveListPaneWidth(db, 'vault-a', 9000)
    expect(loadListPaneWidth(db, 'vault-a')).toBe(480)
    saveListPaneWidth(db, 'vault-a', 10)
    expect(loadListPaneWidth(db, 'vault-a')).toBe(200)
    // a hand-edited row past the ceiling still reads back clamped
    appSettingSet(db, 'vault-a', 'listWidth', JSON.stringify({ width: 2000 }))
    expect(loadListPaneWidth(db, 'vault-a')).toBe(480)
  })

  it('vaults never clobber each other — keyed by vault id', () => {
    const db = openDb()
    saveListPaneWidth(db, 'vault-a', 240)
    saveListPaneWidth(db, 'vault-b', 440)
    expect(loadListPaneWidth(db, 'vault-a')).toBe(240)
    expect(loadListPaneWidth(db, 'vault-b')).toBe(440)
  })

  it('malformed or non-number rows degrade to the 300 default, never throw', () => {
    const db = openDb()
    appSettingSet(db, 'vault-a', 'listWidth', 'not json {')
    expect(loadListPaneWidth(db, 'vault-a')).toBe(300)
    appSettingSet(db, 'vault-a', 'listWidth', JSON.stringify({ width: 'wide' }))
    expect(loadListPaneWidth(db, 'vault-a')).toBe(300)
  })

  it('lives beside the rails row — neither disturbs the other', () => {
    const db = openDb()
    saveRailsCollapsed(db, 'vault-a', { sidebar: true, list: false })
    saveListPaneWidth(db, 'vault-a', 400)
    expect(loadRailsCollapsed(db, 'vault-a')).toEqual({ sidebar: true, list: false })
    expect(loadListPaneWidth(db, 'vault-a')).toBe(400)
  })
})

describe('atlas legend seen — APP-GLOBAL once-per-app flag (story epic17.2)', () => {
  it('defaults to unseen (so the popover auto-opens on the first visit)', () => {
    freshDir()
    expect(loadAtlasLegendSeen()).toBe(false)
  })

  it('sticks once set — never auto-opens again', () => {
    freshDir()
    saveAtlasLegendSeen()
    expect(loadAtlasLegendSeen()).toBe(true)
  })

  it('does not disturb sibling settings', () => {
    freshDir()
    saveThemeSetting('dark')
    saveAtlasLegendSeen()
    expect(loadThemeSetting()).toBe('dark')
    expect(loadAtlasLegendSeen()).toBe(true)
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
