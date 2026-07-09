import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'

/** Main is logic-free: window creation + wiring only (architecture.md#process-model). */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 880,
    minHeight: 520,
    show: false,
    // DESIGN.md layout: traffic lights over the translucent sidebar.
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.on('ready-to-show', () => win.show())

  // Rendered notes may contain external links: never navigate the app window;
  // http(s) targets open in the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(process.env.ELECTRON_RENDERER_URL ?? 'file://')) return
    event.preventDefault()
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))

  return win
}
