/**
 * Main process — logic-free by rule (architecture.md#coding-standards #4).
 * Owns: window lifecycle, forking the core host, brokering MessagePortMain
 * pairs, the native vault picker (menu item + renderer button) and the
 * persisted vault choice (story 1.4).
 *
 * Multi-window (story 23.1, D1 amendment 7 §D): N windows, each bound to its
 * OWN vault via its OWN core-host process. The single-core assumption is
 * replaced by a window→{core, vaultPath} registry; a single window still boots
 * exactly as before. Each core-host process is its own `import 'loredex'` site
 * (config resolved once per process — F6 holds per window). Known limitation:
 * the in-app MCP server binds one fixed port, so only the first window claims
 * it — additional windows show a graceful port-conflict in Sync (documented in
 * the story), the vault UI is unaffected.
 */
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, MessageChannelMain, utilityProcess } from 'electron'
import {
  loadRecentVaults,
  loadVaultPath,
  pickProjectRootDialog,
  pickRouteFileDialog,
  pickVaultDialog,
  pickWizardFolderDialog,
  recordRecentVault,
  saveExportDialog,
  saveVaultPath,
} from './dialogs'
import { handleCoreMessage } from './notifications'
import { createMainWindow } from './windows'

// Parity harness (docs/design/reference): LOREDEX_DEBUG_PORT exposes CDP so
// the reference screenshot loop can drive the real app. Dev tooling only —
// unset in normal runs, never set by the app itself.
if (process.env.LOREDEX_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.LOREDEX_DEBUG_PORT)
}

interface WinCore {
  /** the window's core-host process (null while respawning) */
  core: Electron.UtilityProcess | null
  /** the vault this window's core is (re)forked on; null = no vault yet */
  vaultPath: string | null
}

/** window.id → its dedicated core host + bound vault. */
const winCores = new Map<number, WinCore>()
let quitting = false

// ── loredex:// deep links (story 13.2): main only REGISTERS and FORWARDS the
//    raw URL — parsing lives renderer-side (shared/join-link.ts). open-url can
//    fire before any window exists; buffer the last link until one loads. ────
let pendingDeepLink: string | null = null

function forwardDeepLink(url: string): void {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length === 0) {
    pendingDeepLink = url
    return
  }
  for (const win of wins) win.webContents.send('join-link', url)
  pendingDeepLink = null
}

app.setAsDefaultProtocolClient('loredex')
app.on('open-url', (event, url) => {
  event.preventDefault()
  forwardDeepLink(url)
})

/**
 * Fork a core host bound to this window's vault and wire its per-window
 * message/exit handlers. The persisted vault crosses to the core host at fork
 * time — config resolves exactly once per core-host lifetime (F6).
 */
function forkCoreHostFor(win: BrowserWindow): void {
  const wc = winCores.get(win.id)
  if (!wc) return
  const args = ['--user-data', app.getPath('userData')]
  if (wc.vaultPath) args.push('--vault', wc.vaultPath)
  const core = utilityProcess.fork(join(import.meta.dirname, 'core.js'), args, {
    serviceName: 'loredex-core',
  })
  wc.core = core
  // story 3.7: notification/badge requests route to THIS window (its vault)
  core.on('message', (msg) => handleCoreMessage(msg, win))
  core.on('exit', (code) => {
    wc.core = null
    if (quitting || win.isDestroyed()) return
    // Respawn rule: re-fork on the CURRENT bound vault and re-broker; a
    // vault switch sets wc.vaultPath before killing, so respawn picks it up.
    console.warn(`[loredex] core host for window ${win.id} exited (code ${code}) — respawning`)
    forkCoreHostFor(win)
    brokerPorts(win)
  })
}

/** Hand one end of a fresh MessageChannelMain to the window's core, the other to the renderer. */
function brokerPorts(win: BrowserWindow): void {
  const core = winCores.get(win.id)?.core
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
 * Bring up a window's core host + brokering. Records the vault in the recents
 * list. Used by the initial window and every "Open in new window".
 */
function bootWindowCore(win: BrowserWindow, vaultPath: string | null): void {
  winCores.set(win.id, { core: null, vaultPath })
  if (vaultPath) recordRecentVault(vaultPath)
  forkCoreHostFor(win)
  win.webContents.on('did-finish-load', () => {
    brokerPorts(win)
    if (pendingDeepLink) forwardDeepLink(pendingDeepLink)
  })
  win.on('closed', () => {
    const wc = winCores.get(win.id)
    winCores.delete(win.id)
    wc?.core?.kill()
  })
}

/** Open a brand-new window bound to `vaultPath` (its own core host). */
function openWindow(vaultPath: string | null): BrowserWindow {
  const win = createMainWindow()
  bootWindowCore(win, vaultPath)
  return win
}

/**
 * Vault picker flow (menu + renderer button): native panel → switch THIS
 * window in place.
 */
async function pickVault(win: BrowserWindow | null): Promise<string | null> {
  const picked = await pickVaultDialog(win)
  if (!picked || !win) return null
  await applyVault(win, picked)
  return picked
}

/**
 * Pivot ONE window to a vault path: persist the choice (app-wide "last vault" +
 * recents), restart that window's core host so config re-resolves (F6), notify
 * that window's renderer after the fresh port is brokered. Shared by the
 * picker, the switcher menu (switch-in-place) and the wizards' success pivot.
 */
async function applyVault(win: BrowserWindow, picked: string): Promise<void> {
  saveVaultPath(picked)
  recordRecentVault(picked)
  let wc = winCores.get(win.id)
  if (!wc) {
    wc = { core: null, vaultPath: picked }
    winCores.set(win.id, wc)
  }
  if (wc.core) {
    // Set the bound vault BEFORE killing so the standing exit handler re-forks
    // (and re-brokers) on the NEW vault.
    wc.vaultPath = picked
    const old = wc.core
    await new Promise<void>((resolve) => {
      old.once('exit', () => setImmediate(resolve))
      old.kill()
    })
  } else {
    wc.vaultPath = picked
    forkCoreHostFor(win)
    brokerPorts(win)
  }
  win.webContents.send('vault-changed', picked)
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
          {
            label: 'Open in New Window',
            accelerator: 'CmdOrCtrl+Shift+N',
            click: () => openWindow(loadVaultPath()),
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
  // story 9.1: window focus state drives ITS core host's poll cadence
  // (60 s focused / 5 min blurred). Forwarding only — no logic here.
  app.on('browser-window-focus', (_e, win) =>
    winCores.get(win.id)?.core?.postMessage({ t: 'focus', focused: true }),
  )
  app.on('browser-window-blur', (_e, win) =>
    winCores.get(win.id)?.core?.postMessage({ t: 'focus', focused: false }),
  )
  const windowFor = (event: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(event.sender)
  ipcMain.handle('loredex:pick-vault', (event) => pickVault(windowFor(event)))
  // story 23.1: pick a vault folder WITHOUT side effects — the renderer menu
  // then decides (switch in place vs open in new window)
  ipcMain.handle('loredex:pick-vault-folder', (event) => pickVaultDialog(windowFor(event)))
  ipcMain.handle('loredex:list-recent-vaults', () => loadRecentVaults())
  ipcMain.handle('loredex:open-in-new-window', (_event, vaultPath?: string) => {
    openWindow(typeof vaultPath === 'string' && vaultPath ? vaultPath : loadVaultPath())
    return null
  })
  // story 7.4: native markdown picker for route-a-note (no business logic here)
  ipcMain.handle('loredex:pick-route-file', (event) => pickRouteFileDialog(windowFor(event)))
  // story 11.1: native folder picker for contract project roots (TCC rule)
  ipcMain.handle('loredex:pick-project-root', (event) => pickProjectRootDialog(windowFor(event)))
  // story 13.1: wizard destination pick (create target / clone dest) + the
  // success pivot — persist the wizard's vault and restart the core host on it
  ipcMain.handle('loredex:pick-wizard-folder', (event, kind: 'create' | 'join') =>
    pickWizardFolderDialog(windowFor(event), kind),
  )
  ipcMain.handle('loredex:set-vault', async (event, vaultPath: string) => {
    const win = windowFor(event)
    if (win) await applyVault(win, String(vaultPath))
    return vaultPath
  })
  // story 10.7: atlas export — renderer sends finished bytes, main saves them
  ipcMain.handle(
    'loredex:save-export',
    (event, defaultName: string, data: string | ArrayBuffer) =>
      saveExportDialog(windowFor(event), defaultName, data),
  )
  openWindow(loadVaultPath())
})

app.on('before-quit', () => {
  quitting = true
  for (const wc of winCores.values()) wc.core?.kill()
})

app.on('window-all-closed', () => {
  app.quit()
})
