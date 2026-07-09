/**
 * Core host entry — forked from main via utilityProcess.fork.
 * Receives brokered MessagePortMain ends from main and serves the typed IPC
 * seam over them (dispatch + event fan-out in ./ipc).
 */
import { createCoreIpc } from './ipc'
import type { PortLike } from '../shared/ipc-contract'

const ipc = createCoreIpc()

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

console.log('[loredex-core] core host started')

export { ipc }
