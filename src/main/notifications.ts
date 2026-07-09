/**
 * Native notification + dock badge DISPLAY (story 3.7). Logic-free by rule:
 * the core host filtered, deduped and batched already — main just shows what
 * it is told and routes the click back into the renderer.
 */
import { app, BrowserWindow, Notification } from 'electron'
import { isMainControlMessage } from '../shared/ipc-contract'

function focusMainWindow(): BrowserWindow | undefined {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
  return win
}

/** Handle a core-host control message; ignores anything that isn't one. */
export function handleCoreMessage(msg: unknown): void {
  if (!isMainControlMessage(msg)) return
  if (msg.t === 'badge') {
    app.setBadgeCount(msg.count)
    return
  }
  if (!Notification.isSupported()) return
  const notification = new Notification({ title: msg.title, body: msg.body })
  notification.on('click', () => {
    // focus + deep-navigate: '' (batched summary) opens the board
    focusMainWindow()?.webContents.send('open-handoff', msg.relPath)
  })
  notification.show()
}
