/**
 * Preload — receives the brokered core-host port (the renderer page never
 * touches ipcRenderer) and exposes exactly ONE global: window.loredex
 * (typed invoke/onEvent). Nothing else crosses the contextBridge.
 */
import { contextBridge, ipcRenderer } from 'electron'
import { createIpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'

const client = createIpcClient()

function domPortAdapter(port: MessagePort): PortLike {
  return {
    postMessage: (data) => port.postMessage(data),
    onMessage: (cb) => {
      port.onmessage = (e) => cb(e.data)
    },
    start: () => port.start(),
  }
}

ipcRenderer.on('core-port', (event) => {
  const [port] = event.ports
  if (port) client.attach(domPortAdapter(port))
})

// The bridge is untyped by necessity (structured-clone boundary); the renderer
// re-types it in src/renderer/src/api.ts against the shared contract.
const untypedInvoke = client.invoke as (ch: string, arg: unknown) => Promise<unknown>

contextBridge.exposeInMainWorld('loredex', {
  invoke: (ch: string, arg: unknown) => untypedInvoke(ch, arg),
  onEvent: (cb: (e: unknown) => void) => client.onEvent(cb),
  // Main-owned native capabilities (story 1.4): the vault picker lives in the
  // main process (native panel + persisted choice) — still ONE bridge global.
  pickVault: (): Promise<string | null> => ipcRenderer.invoke('loredex:pick-vault'),
  onVaultChanged: (cb: (vaultPath: string) => void): (() => void) => {
    const listener = (_e: unknown, vaultPath: string): void => cb(vaultPath)
    ipcRenderer.on('vault-changed', listener)
    return () => ipcRenderer.removeListener('vault-changed', listener)
  },
})
