/**
 * Native open panel for the vault picker (story 1.4) + persistence of the
 * chosen path. TCC rule: folder access ONLY via the native panel — the app
 * never cold-scans directories outside the selected vault. Persisting the
 * choice in main-owned JSON is bootstrap config, not business logic.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { app, type BrowserWindow, dialog } from 'electron'
import { pushRecent, type RecentVault } from '../shared/recent-vaults'

const vaultFile = (): string => join(app.getPath('userData'), 'vault.json')
const recentVaultsFile = (): string => join(app.getPath('userData'), 'recent-vaults.json')

export function loadVaultPath(): string | null {
  try {
    const raw = JSON.parse(readFileSync(vaultFile(), 'utf8')) as { vaultPath?: unknown }
    return typeof raw.vaultPath === 'string' ? raw.vaultPath : null
  } catch {
    return null
  }
}

export function saveVaultPath(vaultPath: string): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(vaultFile(), JSON.stringify({ vaultPath }))
}

/**
 * Recently-opened vaults (story 23.1, D1 amendment 7 §D) — the app-wide list
 * behind the vault switcher menu. Same bootstrap-config category as vault.json
 * (main-owned JSON, not business logic); list logic is the pure shared module.
 */
export function loadRecentVaults(): RecentVault[] {
  try {
    const raw = JSON.parse(readFileSync(recentVaultsFile(), 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (r): r is RecentVault =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as RecentVault).path === 'string' &&
        typeof (r as RecentVault).name === 'string' &&
        typeof (r as RecentVault).openedAt === 'string',
    )
  } catch {
    return []
  }
}

/** Record an opened/switched-to vault at the top of the recents list. */
export function recordRecentVault(vaultPath: string): RecentVault[] {
  const entry: RecentVault = {
    path: vaultPath,
    name: basename(vaultPath) || vaultPath,
    openedAt: new Date().toISOString(),
  }
  const next = pushRecent(loadRecentVaults(), entry)
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(recentVaultsFile(), JSON.stringify(next))
  return next
}

/** Show the native folder picker; null when the user cancels. */
export async function pickVaultDialog(win: BrowserWindow | null): Promise<string | null> {
  const opts = {
    title: 'Open vault',
    buttonLabel: 'Open vault',
    properties: ['openDirectory' as const],
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

/**
 * Native folder picker for the wizards (stories 13.1/13.2): where the new
 * vault is created / where the clone lands. createDirectory lets the user
 * mint a fresh empty folder in the panel; emptiness is enforced core-side
 * (DEST_NOT_EMPTY). Same TCC rule: access only via the panel.
 */
export async function pickWizardFolderDialog(
  win: BrowserWindow | null,
  kind: 'create' | 'join',
): Promise<string | null> {
  const opts = {
    title: kind === 'create' ? 'Choose where to create the vault' : 'Choose where to clone the vault',
    buttonLabel: kind === 'create' ? 'Create here' : 'Clone here',
    properties: ['openDirectory' as const, 'createDirectory' as const],
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

/**
 * Native folder picker for contract project roots (story 11.1). Same TCC rule
 * as the vault picker: folder access ONLY via the panel — no cold scans.
 */
export async function pickProjectRootDialog(win: BrowserWindow | null): Promise<string | null> {
  const opts = {
    title: 'Add project folder',
    buttonLabel: 'Add project',
    properties: ['openDirectory' as const],
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

/**
 * Native save panel for atlas exports (story 10.7). Display-only main-process
 * work: the renderer hands finished bytes; main only picks where they land.
 * Returns the written path, or null when the user cancels.
 */
export async function saveExportDialog(
  win: BrowserWindow | null,
  defaultName: string,
  data: string | ArrayBuffer,
): Promise<string | null> {
  const ext = defaultName.split('.').pop() ?? 'svg'
  const opts = {
    title: 'Export atlas view',
    defaultPath: defaultName,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  }
  const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (result.canceled || !result.filePath) return null
  writeFileSync(result.filePath, typeof data === 'string' ? data : Buffer.from(data))
  return result.filePath
}

/**
 * Native markdown-file picker for route-a-note (story 7.4). Same TCC rule:
 * file access only via the panel or an explicit drop — never a cold scan.
 */
export async function pickRouteFileDialog(win: BrowserWindow | null): Promise<string | null> {
  const opts = {
    title: 'Route a note into the vault',
    buttonLabel: 'Choose note',
    properties: ['openFile' as const],
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}
