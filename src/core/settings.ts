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
import { DEFAULT_FONT_SETTINGS, isFontSettings, type FontSettings } from '../shared/font-settings'
import { isValidIdentity } from '../shared/identity'
import { isThemeSetting, type ThemeSetting } from '../shared/theme'
import type { Identity, RailsCollapsed, TreeSectionsCollapsed } from '../shared/types'
import { appSettingGet, appSettingSet, getAppDb, metaGet, metaSet, type AppDb } from './db/index'

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

// ── Font preferences (app + per-note-format) ────────────────────────────────

export function loadFontSettings(): FontSettings {
  const raw = readJsonKey('fonts')
  return isFontSettings(raw) ? raw : DEFAULT_FONT_SETTINGS
}

export function saveFontSettings(fonts: FontSettings): void {
  writeKey('fonts', JSON.stringify(fonts))
}

// ── Collapsible rails (story 16.2, Addendum D1) ─────────────────────────────
// PER-VAULT UI pref, so it rides app_settings (vault_id-scoped), not meta.

export function loadRailsCollapsed(db: AppDb, vaultId: string): RailsCollapsed {
  const raw = appSettingGet(db, vaultId, 'rails')
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as { sidebar?: unknown; list?: unknown }
      return { sidebar: parsed.sidebar === true, list: parsed.list === true }
    } catch {
      // malformed row — fall through to expanded
    }
  }
  return { sidebar: false, list: false }
}

export function saveRailsCollapsed(db: AppDb, vaultId: string, rails: RailsCollapsed): void {
  appSettingSet(
    db,
    vaultId,
    'rails',
    JSON.stringify({ sidebar: rails.sidebar === true, list: rails.list === true }),
  )
}

// ── List-pane width (story epic17.4, D1 amendment 3) ────────────────────────
// PER-VAULT UI pref, app_settings beside `rails` — the file-list/reader divider
// drags 200–480px, double-click resets to 300. Clamp is the renderer's pure
// listPaneWidth util's band; core keeps a defensive copy so a hand-edited row
// can never widen the pane past the design bounds.

const MIN_LIST_WIDTH = 200
const MAX_LIST_WIDTH = 480
const DEFAULT_LIST_WIDTH = 300

function clampWidth(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_LIST_WIDTH
  return Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, Math.round(px)))
}

export function loadListPaneWidth(db: AppDb, vaultId: string): number {
  const raw = appSettingGet(db, vaultId, 'listWidth')
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as { width?: unknown }
      if (typeof parsed.width === 'number') return clampWidth(parsed.width)
    } catch {
      // malformed row — fall through to the default
    }
  }
  return DEFAULT_LIST_WIDTH
}

export function saveListPaneWidth(db: AppDb, vaultId: string, width: number): void {
  appSettingSet(db, vaultId, 'listWidth', JSON.stringify({ width: clampWidth(width) }))
}

// ── Terminal drawer (terminal-splits blueprint 2026-07-18) ──────────────────
// PER-VAULT UI pref, app_settings row `terminal` beside `rails`. The clamp is
// the renderer's drawerHeight band; core keeps a defensive copy so a
// hand-edited row can never size the drawer past the design bounds.

const MIN_TERM_HEIGHT = 120
const MAX_TERM_HEIGHT = 600
const DEFAULT_TERM_HEIGHT = 280
const MIN_TERM_WIDTH = 240
const MAX_TERM_WIDTH = 760
const DEFAULT_TERM_WIDTH = 380

function clampTermHeight(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_TERM_HEIGHT
  return Math.min(MAX_TERM_HEIGHT, Math.max(MIN_TERM_HEIGHT, Math.round(px)))
}
function clampTermWidth(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_TERM_WIDTH
  return Math.min(MAX_TERM_WIDTH, Math.max(MIN_TERM_WIDTH, Math.round(px)))
}

type TerminalPrefs = { open: boolean; height: number; dock: 'bottom' | 'left'; width: number }

export function loadTerminalPrefs(db: AppDb, vaultId: string): TerminalPrefs {
  const raw = appSettingGet(db, vaultId, 'terminal')
  if (raw !== null) {
    try {
      const p = JSON.parse(raw) as {
        open?: unknown
        height?: unknown
        dock?: unknown
        width?: unknown
      }
      return {
        open: p.open === true,
        height: typeof p.height === 'number' ? clampTermHeight(p.height) : DEFAULT_TERM_HEIGHT,
        dock: p.dock === 'left' ? 'left' : 'bottom',
        width: typeof p.width === 'number' ? clampTermWidth(p.width) : DEFAULT_TERM_WIDTH,
      }
    } catch {
      // malformed row — fall through to the closed default
    }
  }
  return { open: false, height: DEFAULT_TERM_HEIGHT, dock: 'bottom', width: DEFAULT_TERM_WIDTH }
}

export function saveTerminalPrefs(db: AppDb, vaultId: string, prefs: TerminalPrefs): void {
  appSettingSet(
    db,
    vaultId,
    'terminal',
    JSON.stringify({
      open: prefs.open === true,
      height: clampTermHeight(prefs.height),
      dock: prefs.dock === 'left' ? 'left' : 'bottom',
      width: clampTermWidth(prefs.width),
    }),
  )
}

// ── ACP agent panel (acp blueprint 2026-07-18) ──────────────────────────────
// PER-VAULT UI pref, app_settings row `agentPanel` beside `terminal`. Same
// defensive clamp rationale: a hand-edited row can never size the panel past
// the design bounds.

const MIN_AGENT_PANEL_WIDTH = 280
const MAX_AGENT_PANEL_WIDTH = 480
const DEFAULT_AGENT_PANEL_WIDTH = 340

function clampAgentPanelWidth(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_AGENT_PANEL_WIDTH
  return Math.min(MAX_AGENT_PANEL_WIDTH, Math.max(MIN_AGENT_PANEL_WIDTH, Math.round(px)))
}

export function loadAgentPanelPrefs(
  db: AppDb,
  vaultId: string,
): { open: boolean; width: number } {
  const raw = appSettingGet(db, vaultId, 'agentPanel')
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as { open?: unknown; width?: unknown }
      return {
        open: parsed.open === true,
        width:
          typeof parsed.width === 'number'
            ? clampAgentPanelWidth(parsed.width)
            : DEFAULT_AGENT_PANEL_WIDTH,
      }
    } catch {
      // malformed row — fall through to the closed default
    }
  }
  return { open: false, width: DEFAULT_AGENT_PANEL_WIDTH }
}

export function saveAgentPanelPrefs(
  db: AppDb,
  vaultId: string,
  prefs: { open: boolean; width: number },
): void {
  appSettingSet(
    db,
    vaultId,
    'agentPanel',
    JSON.stringify({ open: prefs.open === true, width: clampAgentPanelWidth(prefs.width) }),
  )
}

// ── Vault tree sections (story 16.3, Addendum D1) ───────────────────────────
// Collapsed section-row paths, PER VAULT — app_settings, beside `rails`.

export function loadTreeSectionsCollapsed(db: AppDb, vaultId: string): TreeSectionsCollapsed {
  const raw = appSettingGet(db, vaultId, 'treeSections')
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as { collapsed?: unknown }
      if (Array.isArray(parsed.collapsed)) {
        return { collapsed: parsed.collapsed.filter((p): p is string => typeof p === 'string') }
      }
    } catch {
      // malformed row — fall through to nothing collapsed
    }
  }
  return { collapsed: [] }
}

export function saveTreeSectionsCollapsed(
  db: AppDb,
  vaultId: string,
  state: TreeSectionsCollapsed,
): void {
  const collapsed = Array.isArray(state.collapsed)
    ? state.collapsed.filter((p): p is string => typeof p === 'string')
    : []
  appSettingSet(db, vaultId, 'treeSections', JSON.stringify({ collapsed }))
}

// ── Atlas legend seen (story epic17.2, D1 amendment 3) ──────────────────────
// APP-GLOBAL, not per-vault: the "How to read this map" popover auto-opens on
// the first-EVER Atlas visit across any vault, exactly once. Rides `meta` like
// the theme, not app_settings.

export function loadAtlasLegendSeen(): boolean {
  return readJsonKey('atlasLegendSeen') === true
}

export function saveAtlasLegendSeen(): void {
  writeKey('atlasLegendSeen', JSON.stringify(true))
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

/** Per-agent MCP tokens (story 26.9): name → token. Minted in Settings/
 *  Agents, checked by the MCP host alongside the install token — requests
 *  bearing one attribute the session feed per agent. */
export function loadAgentTokens(): Record<string, string> {
  const v = readJsonKey('agentTokens')
  if (typeof v !== 'object' || v === null) return {}
  const out: Record<string, string> = {}
  for (const [name, token] of Object.entries(v as Record<string, unknown>)) {
    if (typeof token === 'string') out[name] = token
  }
  return out
}

export function mintAgentToken(name: string): string {
  const tokens = loadAgentTokens()
  const token = randomBytes(24).toString('hex')
  tokens[name] = token
  writeKey('agentTokens', JSON.stringify(tokens))
  return token
}

export function revokeAgentToken(name: string): void {
  const tokens = loadAgentTokens()
  delete tokens[name]
  writeKey('agentTokens', JSON.stringify(tokens))
}

/** v3 Settings › MCP server toggles (story: parity slice C). Both default
 *  true — the reference page's switches are real, not decoration. */
export function loadMcpAutostart(): boolean {
  return readJsonKey('mcpAutostart') !== false
}
export function saveMcpAutostart(on: boolean): void {
  writeKey('mcpAutostart', JSON.stringify(on))
}
export function loadMcpWriteTools(): boolean {
  return readJsonKey('mcpWriteTools') !== false
}
export function saveMcpWriteTools(on: boolean): void {
  writeKey('mcpWriteTools', JSON.stringify(on))
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
