/**
 * Preload — receives the brokered core-host port. The renderer page itself
 * never touches ipcRenderer. Story 1.2 wraps this port in the typed bridge
 * (window.loredex); for Story 1.1 it proves the transport with a ping.
 */
import { ipcRenderer } from 'electron'

ipcRenderer.on('core-port', (event) => {
  const [port] = event.ports
  if (!port) return
  port.onmessage = (e) => {
    if ((e.data as { t?: string })?.t === 'pong') {
      console.log('[loredex] pong received from core host — transport alive')
    }
  }
  port.postMessage({ t: 'ping' })
})
