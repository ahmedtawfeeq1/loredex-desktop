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
import { isInsideVault, isOpenableExt } from './path-containment'

/**
 * Wire the reveal/open ipc handlers. `windowFor` maps the invoke to its window;
 * `vaultRootFor` returns that window's trusted vault root (or null when none is
 * bound yet). The renderer only ever passes a vault-RELATIVE path.
 */
export function registerShellOpen(
  windowFor: (event: Electron.IpcMainInvokeEvent) => BrowserWindow | null,
  vaultRootFor: (win: BrowserWindow) => string | null,
): void {
  const resolve = (
    event: Electron.IpcMainInvokeEvent,
    rel: unknown,
  ): { abs: string } | null => {
    const win = windowFor(event)
    if (!win) return null
    const root = vaultRootFor(win)
    if (!root || typeof rel !== 'string' || !rel) return null
    // join normalizes an absolute-looking rel under root; the containment check
    // (realpath both) then rejects any `..`/symlink escape.
    const abs = join(root, rel)
    return isInsideVault(root, abs) ? { abs } : null
  }

  ipcMain.handle('loredex:reveal-path', (event, rel: unknown) => {
    const r = resolve(event, rel)
    if (!r) return { ok: false }
    shell.showItemInFolder(r.abs)
    return { ok: true }
  })

  ipcMain.handle('loredex:open-path', (event, rel: unknown) => {
    const r = resolve(event, rel)
    if (!r) return { ok: false }
    let isDir = false
    try {
      isDir = statSync(r.abs).isDirectory()
    } catch {
      return { ok: false } // vanished between the tree walk and the click
    }
    // reveal (never launch) a directory bundle or a non-allowlisted file
    if (isDir || !isOpenableExt(r.abs)) {
      shell.showItemInFolder(r.abs)
      return { ok: true, revealed: true }
    }
    void shell.openPath(r.abs)
    return { ok: true }
  })
}
