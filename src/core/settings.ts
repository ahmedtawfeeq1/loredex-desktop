/**
 * App-side settings persistence (story 3.4 → 9.2). Identity is per-user state
 * and must NEVER live in the vault (architecture.md#state-placement).
 *
 * Story 9.2: the v0.1 userData settings.json shim is SUPERSEDED by app.db —
 * settings live in the `meta` table (app-global, not vault-scoped). The JSON
 * file is read once, imported, and renamed to `.bak` (idempotent). Only this
 * module changed; the settings.* IPC channels stayed put, as marked.
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { isValidIdentity } from '../shared/identity'
import { isThemeSetting, type ThemeSetting } from '../shared/theme'
import type { Identity } from '../shared/types'
import { getAppDb, metaGet, metaSet } from './db/index'

/** In-memory fallback when no app.db is open (bare unit tests, no userData). */
const memory = new Map<string, string>()

function readKey(key: string): string | null {
  const db = getAppDb()
  return db ? metaGet(db, `settings:${key}`) : (memory.get(key) ?? null)
}

function writeKey(key: string, value: string | null): void {
  const db = getAppDb()
  if (db) metaSet(db, `settings:${key}`, value)
  else if (value === null) memory.delete(key)
  else memory.set(key, value)
}

function readJsonKey(key: string): unknown {
  const raw = readKey(key)
  if (raw === null) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

/**
 * One-time migration of the v0.1 settings.json shim (AC3): import every known
 * key into `meta`, rename the file to `.bak`. Running again is a no-op — the
 * file is gone. Call AFTER initAppDb.
 */
export function initSettings(userDataDir: string | undefined): void {
  if (!userDataDir) return
  const file = join(userDataDir, 'settings.json')
  if (!existsSync(file)) return
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    parsed = {}
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) writeKey(key, JSON.stringify(value))
  }
  try {
    renameSync(file, `${file}.bak`)
  } catch {
    // rename failing (permissions?) just means the import re-runs — idempotent
  }
}

export function loadIdentityProfile(): Identity | null {
  const identity = readJsonKey('identity')
  return isValidIdentity(identity) ? { name: identity.name, email: identity.email } : null
}

export function saveIdentityProfile(identity: Identity): void {
  writeKey('identity', JSON.stringify(identity))
}

// ── Theme preference (story 14.1) ───────────────────────────────────────────

export function loadThemeSetting(): ThemeSetting {
  const theme = readJsonKey('theme')
  return isThemeSetting(theme) ? theme : 'system'
}

export function saveThemeSetting(theme: ThemeSetting): void {
  writeKey('theme', JSON.stringify(theme))
}

// ── MCP host settings (story 1.6) ───────────────────────────────────────────

/** Per-install bearer token: generated once, persisted. */
export function loadOrCreateMcpToken(): string {
  const existing = readJsonKey('mcpToken')
  if (typeof existing === 'string' && existing.length >= 32) return existing
  const token = randomBytes(32).toString('hex')
  writeKey('mcpToken', JSON.stringify(token))
  return token
}

/** Settings override for the MCP port; null = preferred default (52017). */
export function loadMcpPortOverride(): number | null {
  const port = readJsonKey('mcpPort')
  return typeof port === 'number' && Number.isInteger(port) && port > 0 && port < 65536
    ? port
    : null
}

export function saveMcpPortOverride(port: number | null): void {
  writeKey('mcpPort', port === null ? null : JSON.stringify(port))
}
