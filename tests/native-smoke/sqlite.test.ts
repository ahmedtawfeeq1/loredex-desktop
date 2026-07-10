/**
 * Native-module smoke (story 9.2 AC6, risk 5 — ABI churn): better-sqlite3
 * open/write/read against whatever ABI this runner uses. CI runs it on every
 * PR; `electron-builder install-app-deps` rebuilds the module for the packaged
 * Electron ABI at dist time, and this file is the canary when either bumps.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openAppDb } from '../../src/core/db/index'

describe('better-sqlite3 native smoke', () => {
  it('opens WAL, writes and reads through the real module', () => {
    const db = openAppDb(mkdtempSync(join(tmpdir(), 'loredex-native-sqlite-')))
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('smoke', 'ok')
    expect(db.prepare('SELECT value FROM meta WHERE key = ?').get('smoke')).toEqual({
      value: 'ok',
    })
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    db.close()
  })
})
