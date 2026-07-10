/**
 * app.db — the per-user store (story 9.2 / epic3.story6). The core host is the
 * SOLE opener (architecture.md#coding-standards #6); renderer access is IPC.
 * Disposable by contract: nothing team-visible lives only here, deleting it
 * loses read-state only (architecture-m2.md#3-app-db).
 */
import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { electronNativeBinding } from './native-binding'

export type AppDb = Database.Database

/**
 * Ordered, idempotent-by-user_version migrations: `migrations.slice(user_version)`
 * runs in ONE transaction, then user_version bumps to migrations.length.
 * No ORM, no down-migrations — a failed/old db is disposable.
 */
export const migrations: Array<(db: AppDb) => void> = [
  // 1 — the M2 schema, verbatim from architecture-m2.md §3
  (db) => {
    db.exec(`
      CREATE TABLE meta          (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE read_state    (vault_id TEXT, note_path TEXT, read_at TEXT,
                                  PRIMARY KEY (vault_id, note_path));
      CREATE TABLE snooze_timers (vault_id TEXT, handoff_id TEXT, until TEXT,
                                  notified INTEGER DEFAULT 0,
                                  PRIMARY KEY (vault_id, handoff_id));
      CREATE TABLE poll_cursor   (vault_id TEXT PRIMARY KEY, branch TEXT,
                                  last_seen_sha TEXT, last_fetch_at TEXT);
      CREATE TABLE contract_scan (repo_root TEXT, file TEXT, commit_sha TEXT,
                                  committed_at TEXT, summary_json TEXT,
                                  PRIMARY KEY (repo_root, file, commit_sha));
      CREATE TABLE app_settings  (vault_id TEXT, key TEXT, value TEXT,
                                  PRIMARY KEY (vault_id, key));
    `)
  },
]

export function runMigrations(db: AppDb): void {
  const version = db.pragma('user_version', { simple: true }) as number
  const pending = migrations.slice(version)
  if (pending.length === 0) return
  db.transaction(() => {
    for (const migration of pending) migration(db)
    db.pragma(`user_version = ${migrations.length}`)
  })()
}

/**
 * Open (or create) `<userDataDir>/app.db`, WAL mode, migrated. A corrupt or
 * unmigratable file is renamed aside and recreated fresh — log, never crash
 * (AC5: the vault is untouched; only read-state is lost).
 */
export function openAppDb(userDataDir: string): AppDb {
  const file = join(userDataDir, 'app.db')
  try {
    return openAndMigrate(file)
  } catch (e) {
    console.warn(
      `[loredex-core] app.db unusable (${e instanceof Error ? e.message : String(e)}) — recreating fresh (read-state lost, vault untouched)`,
    )
    if (existsSync(file)) renameSync(file, `${file}.corrupt-${Date.now()}`)
    return openAndMigrate(file)
  }
}

function openAndMigrate(file: string): AppDb {
  // story 15.1: under Electron in dev, load the staged Electron-ABI binary so
  // build/Release can stay plain-node for vitest; undefined = default lookup
  const nativeBinding = electronNativeBinding()
  const db = nativeBinding ? new Database(file, { nativeBinding }) : new Database(file)
  try {
    db.pragma('journal_mode = WAL')
    runMigrations(db)
    return db
  } catch (e) {
    db.close()
    throw e
  }
}

// ── module singleton (core host lifetime) ───────────────────────────────────

let db: AppDb | null = null

/** Open the singleton. Tests may re-init; the previous handle is closed. */
export function initAppDb(userDataDir: string | undefined): AppDb | null {
  db?.close()
  db = userDataDir ? openAppDb(userDataDir) : null
  return db
}

/** null when the host was started without a userData dir (bare unit tests). */
export function getAppDb(): AppDb | null {
  return db
}

// ── vault_id (every table keys on it) ───────────────────────────────────────

/**
 * vault_id = the normalized origin remote URL when one exists, else the
 * absolute vault path — computed once at vault open (architecture-m2.md §3).
 * Normalization makes ssh and https spellings of the same repo one id:
 * `git@github.com:o/r.git` ≡ `https://github.com/o/r` → `github.com/o/r`.
 */
export function vaultId(vaultPath: string, remoteUrl: string | null): string {
  return remoteUrl ? normalizeRemote(remoteUrl) : vaultPath
}

export function normalizeRemote(url: string): string {
  const scp = /^[\w.-]+@([\w.-]+):(.+)$/.exec(url)
  let host: string
  let path: string
  if (scp) {
    host = scp[1] as string
    path = scp[2] as string
  } else {
    try {
      const parsed = new URL(url)
      host = parsed.host
      path = parsed.pathname
    } catch {
      return url // unparseable — use verbatim rather than losing the row
    }
  }
  return `${host.toLowerCase()}/${path.replace(/^\/+/, '').replace(/\.git$/, '')}`
}

// ── poll_cursor (story 9.1 owns the semantics; the table ships here) ────────

export interface PollCursor {
  branch: string
  lastSeenSha: string
  lastFetchAt: string | null
}

export function getPollCursor(db: AppDb, vaultId: string): PollCursor | null {
  const row = db
    .prepare('SELECT branch, last_seen_sha, last_fetch_at FROM poll_cursor WHERE vault_id = ?')
    .get(vaultId) as
    | { branch: string; last_seen_sha: string; last_fetch_at: string | null }
    | undefined
  if (!row) return null
  return { branch: row.branch, lastSeenSha: row.last_seen_sha, lastFetchAt: row.last_fetch_at }
}

export function setPollCursor(db: AppDb, vaultId: string, cursor: PollCursor): void {
  db.prepare(
    `INSERT INTO poll_cursor (vault_id, branch, last_seen_sha, last_fetch_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(vault_id) DO UPDATE SET branch = excluded.branch,
       last_seen_sha = excluded.last_seen_sha, last_fetch_at = excluded.last_fetch_at`,
  ).run(vaultId, cursor.branch, cursor.lastSeenSha, cursor.lastFetchAt)
}

// ── meta + app_settings key/value helpers ───────────────────────────────────

export function metaGet(db: AppDb, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string | null }
    | undefined
  return row?.value ?? null
}

export function metaSet(db: AppDb, key: string, value: string | null): void {
  if (value === null) db.prepare('DELETE FROM meta WHERE key = ?').run(key)
  else {
    db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(key, value)
  }
}

export function appSettingGet(db: AppDb, vaultId: string, key: string): string | null {
  const row = db
    .prepare('SELECT value FROM app_settings WHERE vault_id = ? AND key = ?')
    .get(vaultId, key) as { value: string | null } | undefined
  return row?.value ?? null
}

export function appSettingSet(db: AppDb, vaultId: string, key: string, value: string): void {
  db.prepare(
    'INSERT INTO app_settings (vault_id, key, value) VALUES (?, ?, ?) ON CONFLICT(vault_id, key) DO UPDATE SET value = excluded.value',
  ).run(vaultId, key, value)
}
