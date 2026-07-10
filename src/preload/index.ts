/**
 * Preload — receives the brokered core-host port (the renderer page never
 * touches ipcRenderer) and exposes exactly ONE global: window.loredex
 * (typed invoke/onEvent). Nothing else crosses the contextBridge.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
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
  // story 7.4: native markdown picker + drop-path extraction (webUtils is
  // preload-only; the sandboxed page never sees a Node API)
  pickRouteFile: (): Promise<string | null> => ipcRenderer.invoke('loredex:pick-route-file'),
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  onVaultChanged: (cb: (vaultPath: string) => void): (() => void) => {
    const listener = (_e: unknown, vaultPath: string): void => cb(vaultPath)
    ipcRenderer.on('vault-changed', listener)
    return () => ipcRenderer.removeListener('vault-changed', listener)
  },
  // story 3.7: notification click → deep-navigate ('' = open the board)
  onOpenHandoff: (cb: (relPath: string) => void): (() => void) => {
    const listener = (_e: unknown, relPath: string): void => cb(relPath)
    ipcRenderer.on('open-handoff', listener)
    return () => ipcRenderer.removeListener('open-handoff', listener)
  },
})
