/**
 * WP-F: reveal-in-file-manager + open-in-default-app, gated on the window's
 * TRUSTED vault root (from winCores, never a renderer-supplied root). Reveal
 * always shows the item highlighted in its parent — safe. Open is allowlist-
 * gated and FILES-only: a directory (incl. `.app`/`.workflow` bundles) or a
 * non-allowlisted file is revealed, never launched (risk #3, §5.18/§5.22).
 */
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { type BrowserWindow, ipcMain, shell } from 'electron'
import { isOpenableExt, resolveInsideVault } from './path-containment'

/**
 * Wire the reveal/open ipc handlers. `windowFor` maps the invoke to its window;
 * `vaultRootFor` returns that window's trusted vault root (or null when none is
 * bound yet). The renderer only ever passes a vault-RELATIVE path.
 */
export function registerShellOpen(
  windowFor: (event: Electron.IpcMainInvokeEvent) => BrowserWindow | null,
  vaultRootFor: (win: BrowserWindow) => string | null,
): void {
  // Resolves rel to the REAL target path inside the trusted root (null if it
  // escapes / is missing). The allowlist + shell calls run against this resolved
  // path, NEVER the symlink — an `x.pdf` symlinked to `y.command` resolves to
  // `y.command` and is caught by the allowlist (reveal, not launch).
  const resolve = (
    event: Electron.IpcMainInvokeEvent,
    rel: unknown,
  ): { real: string } | null => {
    const win = windowFor(event)
    if (!win) return null
    const root = vaultRootFor(win)
    if (!root || typeof rel !== 'string' || !rel) return null
    const real = resolveInsideVault(root, join(root, rel))
    return real ? { real } : null
  }

  ipcMain.handle('loredex:reveal-path', (event, rel: unknown) => {
    const r = resolve(event, rel)
    if (!r) return { ok: false }
    shell.showItemInFolder(r.real)
    return { ok: true }
  })

  ipcMain.handle('loredex:open-path', (event, rel: unknown) => {
    const r = resolve(event, rel)
    if (!r) return { ok: false }
    let isDir = false
    try {
      isDir = statSync(r.real).isDirectory()
    } catch {
      return { ok: false } // vanished between the tree walk and the click
    }
    // reveal (never launch) a directory bundle or a non-allowlisted file — the
    // check + launch both run on the RESOLVED target (symlink-safe)
    if (isDir || !isOpenableExt(r.real)) {
      shell.showItemInFolder(r.real)
      return { ok: true, revealed: true }
    }
    void shell.openPath(r.real)
    return { ok: true }
  })
}
