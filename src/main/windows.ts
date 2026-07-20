import { join } from 'node:path'
import { BrowserWindow, shell } from 'electron'

/** A standalone pop-out shows ONE panel filling the window (chat or terminal),
 *  not the full app — signalled to the renderer via a `?popout=` URL query read
 *  at first render (no full-app flash), and given a smaller frame. */
export type PopoutMode = 'chat' | 'terminal' | 'note'

/** Main is logic-free: window creation + wiring only (architecture.md#process-model). */
export function createMainWindow(popout?: PopoutMode): BrowserWindow {
  const size =
    popout === 'chat'
      ? { width: 460, height: 800, minWidth: 360, minHeight: 420 }
      : popout === 'terminal'
        ? { width: 820, height: 520, minWidth: 480, minHeight: 300 }
        : { width: 1100, height: 750, minWidth: 880, minHeight: 520 }
  const win = new BrowserWindow({
    ...size,
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
  // http(s) targets open in the default browser. Story 10.4 adds the Atlas
  // editor deep links (loredex config editor scheme) — an allow-list, no logic.
  const EXTERNAL = ['https://', 'http://', 'file://', 'vscode://', 'cursor://', 'windsurf://']
  // `<custom-scheme>://file/<abs>` — the loredex editor deep-link shape
  const EDITOR_LINK = /^[a-z][a-z0-9+.-]*:\/\/file\//
  const isExternal = (url: string): boolean =>
    EXTERNAL.some((p) => url.startsWith(p)) || EDITOR_LINK.test(url)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(process.env.ELECTRON_RENDERER_URL ?? 'file://')) return
    event.preventDefault()
    if (isExternal(url)) void shell.openExternal(url)
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  const query = popout ? `popout=${popout}` : ''
  if (devUrl) void win.loadURL(query ? `${devUrl}?${query}` : devUrl)
  else
    void win.loadFile(
      join(import.meta.dirname, '../renderer/index.html'),
      query ? { search: query } : undefined,
    )

  return win
}
