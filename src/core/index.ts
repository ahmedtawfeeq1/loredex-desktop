/**
 * Core host entry — forked from main via utilityProcess.fork.
 * Owns the engine (from Story 1.3 on); receives brokered MessagePortMain ends
 * from main and serves the IPC seam over them.
 */
import { isWireMessage } from '../shared/ipc-contract'

type PortEvent = { data: unknown; ports: Electron.MessagePortMain[] }

process.parentPort.on('message', (e: PortEvent) => {
  const msg = e.data as { t?: string } | null
  if (msg?.t !== 'port' || !e.ports[0]) return
  const port = e.ports[0]
  port.on('message', (ev) => {
    if (isWireMessage(ev.data) && ev.data.t === 'ping') {
      console.log('[loredex-core] ping received — replying pong')
      port.postMessage({ t: 'pong' })
    }
  })
  port.start()
})

console.log('[loredex-core] core host started')
