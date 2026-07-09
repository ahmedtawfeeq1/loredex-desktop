/**
 * Core host entry — forked from main via utilityProcess.fork.
 * Receives brokered MessagePortMain ends from main and serves the typed IPC
 * seam over them (dispatch + event fan-out in ./ipc).
 */
import type { PortLike } from '../shared/ipc-contract'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc } from './ipc'
import { initSettings } from './settings'

// Config resolves exactly once, BEFORE any handler is registered (F6).
// Main passes the picked vault (persisted userData JSON) as `--vault <path>`;
// the override wins over any loredex config file (story 1.4).
const vaultFlag = process.argv.indexOf('--vault')
const vaultOverride = vaultFlag !== -1 ? process.argv[vaultFlag + 1] : undefined
const config = initEngine(vaultOverride)
// App-side settings (identity profile) live under main's userData dir (story 3.4).
const userDataFlag = process.argv.indexOf('--user-data')
initSettings(userDataFlag !== -1 ? process.argv[userDataFlag + 1] : undefined)
const ipc = createCoreIpc()
registerCoreHandlers(ipc)

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
