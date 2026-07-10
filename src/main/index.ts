/**
 * Main process — logic-free by rule (architecture.md#coding-standards #4).
 * Owns: window lifecycle, forking the core host, brokering MessagePortMain
 * pairs, the native vault picker (menu item + renderer button) and the
 * persisted vault choice (story 1.4).
 */
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, MessageChannelMain, utilityProcess } from 'electron'
import {
  loadVaultPath,
  pickRouteFileDialog,
  pickVaultDialog,
  saveExportDialog,
  saveVaultPath,
} from './dialogs'
import { handleCoreMessage } from './notifications'
import { createMainWindow } from './windows'

let core: Electron.UtilityProcess | null = null
let quitting = false

function forkCoreHost(): void {
  // The persisted vault crosses to the core host at fork time — config
  // resolves exactly once per core-host lifetime (F6).
  const vaultPath = loadVaultPath()
  const args = ['--user-data', app.getPath('userData')]
  if (vaultPath) args.push('--vault', vaultPath)
  core = utilityProcess.fork(join(import.meta.dirname, 'core.js'), args, {
    serviceName: 'loredex-core',
  })
  // story 3.7: notification/badge display requests from the core host
  core.on('message', handleCoreMessage)
  core.on('exit', (code) => {
    core = null
    if (quitting) return
    // Respawn rule: re-fork and re-broker fresh ports; windows stay open.
    console.warn(`[loredex] core host exited (code ${code}) — respawning`)
    forkCoreHost()
    for (const win of BrowserWindow.getAllWindows()) brokerPorts(win)
  })
}

/** Hand one end of a fresh MessageChannelMain to the core host, the other to the renderer. */
function brokerPorts(win: BrowserWindow): void {
  if (!core || win.isDestroyed() || win.webContents.isDestroyed()) return
  const { port1, port2 } = new MessageChannelMain()
  try {
    // The render frame can be disposed between the guard and the call (window
    // closing, reload mid-flight) — Electron then throws "Render frame was
    // disposed before WebFrameMain could be accessed". Skip; the next
    // did-finish-load brokers a fresh pair.
    win.webContents.postMessage('core-port', null, [port2])
  } catch {
    port1.close()
    port2.close()
    return
  }
  core.postMessage({ t: 'port' }, [port1])
}

/**
 * Vault picker flow (menu + renderer button): native panel → persist → restart
 * the core host so config re-resolves with the new vault → notify renderers
 * AFTER the fresh port is brokered (message ordering on the same channel).
 */
async function pickVault(win: BrowserWindow | null): Promise<string | null> {
  const picked = await pickVaultDialog(win)
  if (!picked) return null
  saveVaultPath(picked)
  if (core) {
    const old = core
    await new Promise<void>((resolve) => {
      // The standing 'exit' handler (registered first) re-forks + re-brokers.
      old.once('exit', () => setImmediate(resolve))
      old.kill()
    })
  } else {
    forkCoreHost()
    for (const w of BrowserWindow.getAllWindows()) brokerPorts(w)
  }
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('vault-changed', picked)
  return picked
}

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      {
        label: 'File',
        submenu: [
          {
            label: 'Open Vault…',
            accelerator: 'CmdOrCtrl+O',
            click: (_item, win) =>
              void pickVault(win instanceof BrowserWindow ? win : null),
          },
          { type: 'separator' },
          { role: 'close' },
        ],
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  )
}

app.whenReady().then(() => {
  buildMenu()
  // story 9.1: window focus state drives the core host's poll cadence
  // (60 s focused / 5 min blurred). Forwarding only — no logic here.
  app.on('browser-window-focus', () => core?.postMessage({ t: 'focus', focused: true }))
  app.on('browser-window-blur', () => core?.postMessage({ t: 'focus', focused: false }))
  ipcMain.handle('loredex:pick-vault', (event) =>
    pickVault(BrowserWindow.fromWebContents(event.sender)),
  )
  // story 7.4: native markdown picker for route-a-note (no business logic here)
  ipcMain.handle('loredex:pick-route-file', (event) =>
    pickRouteFileDialog(BrowserWindow.fromWebContents(event.sender)),
  )
  // story 10.7: atlas export — renderer sends finished bytes, main saves them
  ipcMain.handle(
    'loredex:save-export',
    (event, defaultName: string, data: string | ArrayBuffer) =>
      saveExportDialog(BrowserWindow.fromWebContents(event.sender), defaultName, data),
  )
  forkCoreHost()
  const win = createMainWindow()
  // did-finish-load also covers renderer reloads — each load gets a fresh port pair
  win.webContents.on('did-finish-load', () => brokerPorts(win))
})

app.on('before-quit', () => {
  quitting = true
  core?.kill()
})

app.on('window-all-closed', () => {
  app.quit()
})
