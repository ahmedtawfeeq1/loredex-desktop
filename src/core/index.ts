/**
 * Core host entry — forked from main via utilityProcess.fork.
 * Receives brokered MessagePortMain ends from main and serves the typed IPC
 * seam over them (dispatch + event fan-out in ./ipc).
 */
import type { PortLike } from '../shared/ipc-contract'
import { initAppDb } from './db/index'
import { removeDiscovery } from './discovery'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc } from './ipc'
import { bootMcpServer, PREFERRED_MCP_PORT } from './mcp-server'
import { initSettings, loadMcpPortOverride, loadOrCreateMcpToken } from './settings'

// Config resolves exactly once, BEFORE any handler is registered (F6).
// Main passes the picked vault (persisted userData JSON) as `--vault <path>`;
// the override wins over any loredex config file (story 1.4).
const vaultFlag = process.argv.indexOf('--vault')
const vaultOverride = vaultFlag !== -1 ? process.argv[vaultFlag + 1] : undefined
const config = initEngine(vaultOverride)
// app.db opens FIRST (story 9.2 — the core host is the sole opener); settings
// then live in its meta table, importing the v0.1 settings.json shim once.
const userDataFlag = process.argv.indexOf('--user-data')
const userDataDir = userDataFlag !== -1 ? process.argv[userDataFlag + 1] : undefined
initAppDb(userDataDir)
initSettings(userDataDir)
const ipc = createCoreIpc()
// Display requests (native notifications, dock badge) go to main over the
// control channel — core decides, main displays (story 3.7).
const notifier = registerCoreHandlers(ipc, (msg) => process.parentPort.postMessage(msg))
// Startup check: seed the snapshot + set the badge before any user action.
notifier.refresh()

// In-app MCP server (story 1.6): shares the once-resolved config — the F6 fix
// by construction. No config yet (picker pending) → no server; picking a vault
// restarts this host, which boots it then.
if (config) {
  const portOverride = loadMcpPortOverride()
  void bootMcpServer({
    port: portOverride ?? PREFERRED_MCP_PORT,
    portOverride,
    token: loadOrCreateMcpToken(),
    onWarning: (text) => ipc.emit({ kind: 'git.warning', text }),
  })
}
// Clean shutdown removes the discovery file (main kills this host on quit —
// SIGTERM on posix; 'exit' also covers engine crashes after a clean boot).
process.on('exit', () => removeDiscovery())
process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

function mainPortAdapter(port: Electron.MessagePortMain): PortLike {
  return {
    postMessage: (data) => port.postMessage(data),
    onMessage: (cb) => port.on('message', (e) => cb(e.data)),
    start: () => port.start(),
  }
}

type PortEvent = { data: unknown; ports: Electron.MessagePortMain[] }

process.parentPort.on('message', (e: PortEvent) => {
  const msg = e.data as { t?: string } | null
  if (msg?.t !== 'port' || !e.ports[0]) return
  ipc.attach(mainPortAdapter(e.ports[0]))
})

console.log(
  `[loredex-core] core host started — config: ${config ? config.vaultPath : 'none (vault picker pending)'}`,
)

export { ipc }
