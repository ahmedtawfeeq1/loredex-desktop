/**
 * App-wide zoom on the standard keys, in EVERY window.
 *
 * `role: 'viewMenu'` already puts Zoom In / Out / Reset in the menu bar, but the
 * roles alone are not enough in practice:
 *
 *  - The `zoomIn` role binds `CommandOrControl+Plus`, and `+` is a SHIFTED key
 *    on a US layout. Pressing the key people actually press — `⌘=` — does
 *    nothing. Same for the numpad keys, which the roles do not bind at all.
 *  - Zoom is per-webContents, so a pop-out note/chat/terminal window opens back
 *    at 100% however the main window is set. "All over the app" means the whole
 *    app, not the window that happened to be focused when you pressed the key.
 *
 * So the level is owned here: keyed off the RAW key rather than the accelerator
 * table, applied to every open window, and persisted so it survives a restart.
 *
 * Electron's zoom level is logarithmic — level N = 1.2^N × size — which is the
 * same curve Chrome uses, so the steps feel like a browser's.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BrowserWindow, app } from 'electron'

/** Chrome's own bounds: 25% … 500%, i.e. 1.2^-7 … 1.2^9. */
const MIN_LEVEL = -7
const MAX_LEVEL = 9

let level = 0

function file(): string {
  return join(app.getPath('userData'), 'zoom.json')
}

/** Read the persisted level. Any failure is 100% — a corrupt file must never
 *  stop the app opening, and 100% is always a safe place to start. */
export function loadZoom(): void {
  try {
    const p = file()
    if (!existsSync(p)) return
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as { level?: unknown }
    if (typeof parsed.level === 'number' && Number.isFinite(parsed.level)) {
      level = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, parsed.level))
    }
  } catch {
    // unreadable / unparseable — stay at 100%
  }
}

function persist(): void {
  try {
    writeFileSync(file(), JSON.stringify({ level }), 'utf8')
  } catch {
    // best-effort: failing to remember the zoom is not worth an error dialog
  }
}

/** Apply the current level to every open window, so zoom is an APP setting
 *  rather than a per-window one. */
function applyAll(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.setZoomLevel(level)
  }
}

export function setZoomLevel(next: number): void {
  const clamped = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, next))
  if (clamped === level) return
  level = clamped
  applyAll()
  persist()
}

export const zoomIn = (): void => setZoomLevel(level + 1)
export const zoomOut = (): void => setZoomLevel(level - 1)
export const zoomReset = (): void => setZoomLevel(0)

/**
 * Wire a window: apply the current level as it loads, and handle the keys.
 *
 * `before-input-event` fires ahead of the renderer, so this works no matter
 * which pane has focus — including inside the xterm terminal and the CodeMirror
 * editor, which both swallow plenty of keys of their own.
 */
export function attachZoom(win: BrowserWindow): void {
  // every load, not just the first: a reload resets zoom to the default
  win.webContents.on('did-finish-load', () => win.webContents.setZoomLevel(level))

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = process.platform === 'darwin' ? input.meta : input.control
    if (!mod || input.alt) return

    // Match the KEY, not an accelerator string: `=` and `+` are the same
    // physical key, and which one arrives depends on Shift and the layout.
    // `input.code` covers the numpad, which the menu roles never bind.
    const k = input.key
    const code = input.code
    if (k === '=' || k === '+' || code === 'NumpadAdd') {
      event.preventDefault()
      zoomIn()
      return
    }
    if (k === '-' || k === '_' || code === 'NumpadSubtract') {
      event.preventDefault()
      zoomOut()
      return
    }
    if (k === '0' || code === 'Numpad0') {
      event.preventDefault()
      zoomReset()
    }
  })
}
