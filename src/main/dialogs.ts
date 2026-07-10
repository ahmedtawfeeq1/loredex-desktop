/**
 * Native open panel for the vault picker (story 1.4) + persistence of the
 * chosen path. TCC rule: folder access ONLY via the native panel — the app
 * never cold-scans directories outside the selected vault. Persisting the
 * choice in main-owned JSON is bootstrap config, not business logic.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, type BrowserWindow, dialog } from 'electron'

const vaultFile = (): string => join(app.getPath('userData'), 'vault.json')

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
