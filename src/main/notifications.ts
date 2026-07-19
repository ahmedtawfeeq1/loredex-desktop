/**
 * Native notification + dock badge DISPLAY (story 3.7). Logic-free by rule:
 * the core host filtered, deduped and batched already — main just shows what
 * it is told and routes the click back into the renderer.
 */
import { app, type BrowserWindow, Notification } from 'electron'
import { isMainControlMessage } from '../shared/ipc-contract'

function focusWindow(win: BrowserWindow | undefined): BrowserWindow | undefined {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return win
  }
  return undefined
}

/**
 * Handle a core-host control message; ignores anything that isn't one.
 * Multi-window (story 23.1): each core host serves ONE window, so its
 * notification click focuses and deep-navigates THAT window (its vault), not
 * an arbitrary first window.
 */
export function handleCoreMessage(msg: unknown, win?: BrowserWindow): void {
  if (!isMainControlMessage(msg)) return
  if (msg.t === 'badge') {
    app.setBadgeCount(msg.count)
    return
  }
  // WP-F: the vault report is intercepted in index.ts before it reaches here;
  // guard anyway so it never surfaces as a blank notification (belt-and-suspenders).
  if (msg.t === 'vault') return
  if (!Notification.isSupported()) return
  // Sound + banner on arrival (handoffs from other teams land while you work).
  // silent:false so the OS plays a sound even if the user muted app defaults;
  // `sound` is a macOS system-sound name (ignored on other platforms).
  const notification = new Notification({
    title: msg.title,
    body: msg.body,
    silent: false,
    sound: 'Glass',
  })
  notification.on('click', () => {
    // focus + deep-navigate: '' (batched summary) opens the board
    focusWindow(win)?.webContents.send('open-handoff', msg.relPath)
  })
  notification.show()
}
