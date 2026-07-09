/**
 * App-side settings persistence (story 3.4). Identity is per-user state and
 * must NEVER live in the vault (architecture.md#state-placement).
 *
 * MARKED SEAM (story 3.6): this JSON file moves into app.db (better-sqlite3);
 * only this module changes — the settings.identity.* channels stay put.
 * Main passes its userData dir at fork time; the core host owns the file.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isValidIdentity } from '../shared/identity'
import type { Identity } from '../shared/types'

let settingsFile: string | null = null

export function initSettings(userDataDir: string | undefined): void {
  settingsFile = userDataDir ? join(userDataDir, 'settings.json') : null
}

function readAll(): Record<string, unknown> {
  if (!settingsFile) return {}
  try {
    return JSON.parse(readFileSync(settingsFile, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function loadIdentityProfile(): Identity | null {
  const { identity } = readAll()
  return isValidIdentity(identity) ? { name: identity.name, email: identity.email } : null
}

export function saveIdentityProfile(identity: Identity): void {
  if (!settingsFile) return // no userData dir (unit tests without initSettings)
  mkdirSync(join(settingsFile, '..'), { recursive: true })
  writeFileSync(settingsFile, `${JSON.stringify({ ...readAll(), identity }, null, 2)}\n`)
}
