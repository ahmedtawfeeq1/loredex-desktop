/** Story 9.2: app.db — migrations, vault_id normalization, read-state, snooze timers. */
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  appSettingGet,
  appSettingSet,
  metaGet,
  metaSet,
  migrations,
  normalizeRemote,
  openAppDb,
  runMigrations,
  vaultId,
} from './index'
import { getReadState, markRead } from './read-state'
import { reconcileSnoozeTimers, sweepExpiredSnoozes } from './snooze'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'loredex-appdb-'))

describe('migrations', () => {
  it('creates the six M2 tables and bumps user_version', () => {
    const db = openAppDb(tmp())
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string
      }>
    ).map((r) => r.name)
    for (const t of [
      'meta',
      'read_state',
      'snooze_timers',
      'poll_cursor',
      'contract_scan',
      'app_settings',
    ]) {
      expect(tables).toContain(t)
    }
    expect(db.pragma('user_version', { simple: true })).toBe(migrations.length)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    db.close()
  })

  it('is idempotent — running twice yields the same schema', () => {
    const db = openAppDb(tmp())
    const before = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
    runMigrations(db) // second run: slice(user_version) is empty
    const after = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
    expect(after).toEqual(before)
    db.close()
  })

  it('recreates a corrupt db fresh instead of crashing (AC5)', () => {
    const dir = tmp()
    writeFileSync(join(dir, 'app.db'), 'this is not a sqlite file, not even close —')
    const db = openAppDb(dir)
    expect(db.prepare('SELECT count(*) AS n FROM meta').get()).toEqual({ n: 0 })
    db.close()
    // the corrupt original is kept aside, not destroyed
    expect(readdirSync(dir).some((f) => f.startsWith('app.db.corrupt-'))).toBe(true)
  })
})

describe('vault_id', () => {
  it('normalizes ssh and https spellings of the same repo to one id', () => {
    expect(normalizeRemote('git@github.com:Nimbus/notes-vault.git')).toBe(
      'github.com/Nimbus/notes-vault',
    )
    expect(normalizeRemote('https://github.com/Nimbus/notes-vault.git')).toBe(
      'github.com/Nimbus/notes-vault',
    )
    expect(normalizeRemote('https://GitHub.com/Nimbus/notes-vault')).toBe(
      'github.com/Nimbus/notes-vault',
    )
    expect(vaultId('/v', 'git@github.com:Nimbus/notes-vault.git')).toBe(
      vaultId('/other', 'https://github.com/Nimbus/notes-vault.git'),
    )
  })

  it('falls back to the absolute vault path without a remote', () => {
    expect(vaultId('/Users/kai/vault', null)).toBe('/Users/kai/vault')
  })
})

describe('read_state', () => {
  it('round-trips marks and reports unmarked paths as null', () => {
    const db = openAppDb(tmp())
    markRead(db, 'v1', ['projects/a/handoffs/x.md'], '2026-07-10T10:00:00Z')
    const state = getReadState(db, 'v1', ['projects/a/handoffs/x.md', 'projects/a/handoffs/y.md'])
    expect(state['projects/a/handoffs/x.md']).toBe('2026-07-10T10:00:00Z')
    expect(state['projects/a/handoffs/y.md']).toBeNull()
    // vault-scoped: another vault sees nothing
    expect(getReadState(db, 'v2', ['projects/a/handoffs/x.md'])['projects/a/handoffs/x.md']).toBeNull()
    db.close()
  })
})

describe('snooze_timers', () => {
  const snoozedCard = { id: 'h1', status: 'snoozed', snoozedUntil: '2026-07-09' }

  it('sweep fires once per machine — notified flag sticks (AC4)', () => {
    const db = openAppDb(tmp())
    reconcileSnoozeTimers(db, 'v1', [snoozedCard])
    expect(sweepExpiredSnoozes(db, 'v1', '2026-07-10')).toEqual(['h1'])
    expect(sweepExpiredSnoozes(db, 'v1', '2026-07-10')).toEqual([]) // once
    db.close()
  })

  it('does not fire before snoozed_until passes (until < today, same rule as the lib)', () => {
    const db = openAppDb(tmp())
    reconcileSnoozeTimers(db, 'v1', [{ ...snoozedCard, snoozedUntil: '2026-07-10' }])
    expect(sweepExpiredSnoozes(db, 'v1', '2026-07-10')).toEqual([]) // due tomorrow
    expect(sweepExpiredSnoozes(db, 'v1', '2026-07-11')).toEqual(['h1'])
    db.close()
  })

  it('re-arms when a card is re-snoozed to a new date, drops when no longer snoozed', () => {
    const db = openAppDb(tmp())
    reconcileSnoozeTimers(db, 'v1', [snoozedCard])
    expect(sweepExpiredSnoozes(db, 'v1', '2026-07-10')).toEqual(['h1'])
    // vault truth: re-snoozed to a later date → timer re-arms
    reconcileSnoozeTimers(db, 'v1', [{ ...snoozedCard, snoozedUntil: '2026-07-12' }])
    expect(sweepExpiredSnoozes(db, 'v1', '2026-07-13')).toEqual(['h1'])
    // vault truth: reopened → row drops; a future snooze can notify again
    reconcileSnoozeTimers(db, 'v1', [{ id: 'h1', status: 'open' }])
    expect(
      db.prepare('SELECT count(*) AS n FROM snooze_timers WHERE vault_id = ?').get('v1'),
    ).toEqual({ n: 0 })
    db.close()
  })

  it('reconcile keeps the notified flag when until is unchanged (no repeat toast)', () => {
    const db = openAppDb(tmp())
    reconcileSnoozeTimers(db, 'v1', [snoozedCard])
    expect(sweepExpiredSnoozes(db, 'v1', '2026-07-10')).toEqual(['h1'])
    reconcileSnoozeTimers(db, 'v1', [snoozedCard]) // board load re-reconcile
    expect(sweepExpiredSnoozes(db, 'v1', '2026-07-10')).toEqual([])
    db.close()
  })
})

describe('meta + app_settings', () => {
  it('round-trip and vault scoping', () => {
    const db = openAppDb(tmp())
    metaSet(db, 'settings:theme', '"dark"')
    expect(metaGet(db, 'settings:theme')).toBe('"dark"')
    metaSet(db, 'settings:theme', null)
    expect(metaGet(db, 'settings:theme')).toBeNull()
    appSettingSet(db, 'v1', 'project_roots', '{}')
    expect(appSettingGet(db, 'v1', 'project_roots')).toBe('{}')
    expect(appSettingGet(db, 'v2', 'project_roots')).toBeNull()
    db.close()
  })
})
