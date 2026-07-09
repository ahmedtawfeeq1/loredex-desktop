/**
 * Main process — logic-free by rule (architecture.md#coding-standards #4).
 * Owns: window lifecycle, forking the core host, brokering MessagePortMain pairs.
 */
import { join } from 'node:path'
import { app, BrowserWindow, MessageChannelMain, utilityProcess } from 'electron'
import { createMainWindow } from './windows'

let core: Electron.UtilityProcess | null = null
let quitting = false

function forkCoreHost(): void {
  core = utilityProcess.fork(join(import.meta.dirname, 'core.js'), [], {
    serviceName: 'loredex-core',
  })
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
  if (!core) return
  const { port1, port2 } = new MessageChannelMain()
  core.postMessage({ t: 'port' }, [port1])
  win.webContents.postMessage('core-port', null, [port2])
}

app.whenReady().then(() => {
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
