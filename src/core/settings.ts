/**
 * App-side settings persistence (story 3.4). Identity is per-user state and
 * must NEVER live in the vault (architecture.md#state-placement).
 *
 * MARKED SEAM (story 3.6): this JSON file moves into app.db (better-sqlite3);
 * only this module changes — the settings.identity.* channels stay put.
 * Main passes its userData dir at fork time; the core host owns the file.
 */
import { randomBytes } from 'node:crypto'
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

function writeAll(patch: Record<string, unknown>): void {
  if (!settingsFile) return
  mkdirSync(join(settingsFile, '..'), { recursive: true })
  writeFileSync(settingsFile, `${JSON.stringify({ ...readAll(), ...patch }, null, 2)}\n`)
}

export function loadIdentityProfile(): Identity | null {
  const { identity } = readAll()
  return isValidIdentity(identity) ? { name: identity.name, email: identity.email } : null
}

export function saveIdentityProfile(identity: Identity): void {
  writeAll({ identity })
}

// ── MCP host settings (story 1.6) ───────────────────────────────────────────

/** Per-install bearer token: generated once, persisted in userData. */
export function loadOrCreateMcpToken(): string {
  const { mcpToken } = readAll()
  if (typeof mcpToken === 'string' && mcpToken.length >= 32) return mcpToken
  const token = randomBytes(32).toString('hex')
  writeAll({ mcpToken: token })
  return token
}

/** Settings override for the MCP port; null = preferred default (52017). */
export function loadMcpPortOverride(): number | null {
  const { mcpPort } = readAll()
  return typeof mcpPort === 'number' && Number.isInteger(mcpPort) && mcpPort > 0 && mcpPort < 65536
    ? mcpPort
    : null
}

export function saveMcpPortOverride(port: number | null): void {
  writeAll({ mcpPort: port })
}
