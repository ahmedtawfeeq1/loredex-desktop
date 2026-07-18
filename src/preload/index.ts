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
  // story 11.1: native folder picker for contract project roots (TCC rule)
  pickProjectRoot: (): Promise<string | null> => ipcRenderer.invoke('loredex:pick-project-root'),
  // story 13.1: wizard folder pick + success pivot (persist + core restart)
  pickWizardFolder: (kind: 'create' | 'join'): Promise<string | null> =>
    ipcRenderer.invoke('loredex:pick-wizard-folder', kind),
  setVault: (vaultPath: string): Promise<string> =>
    ipcRenderer.invoke('loredex:set-vault', vaultPath),
  // story 23.1 (D1 amendment 7 §D): vault switcher menu + multi-window
  pickVaultFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('loredex:pick-vault-folder'),
  listRecentVaults: (): Promise<import('../shared/recent-vaults').RecentVault[]> =>
    ipcRenderer.invoke('loredex:list-recent-vaults'),
  openInNewWindow: (vaultPath?: string): Promise<null> =>
    ipcRenderer.invoke('loredex:open-in-new-window', vaultPath),
  // B3 pop-out: open one agent conversation in its own standalone window (its
  // own core host, same vault app.db → resumes from the persisted transcript)
  openAgentWindow: (vaultPath: string | null, conversationId: string): Promise<null> =>
    ipcRenderer.invoke('loredex:open-agent-window', { vaultPath, conversationId }),
  // story 10.7: atlas export — bytes rendered in the page, saved via a native panel
  saveExport: (defaultName: string, data: string | ArrayBuffer): Promise<string | null> =>
    ipcRenderer.invoke('loredex:save-export', defaultName, data),
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
  // story 13.2: loredex://join deep link — main forwards the raw URL
  onJoinLink: (cb: (url: string) => void): (() => void) => {
    const listener = (_e: unknown, url: string): void => cb(url)
    ipcRenderer.on('join-link', listener)
    return () => ipcRenderer.removeListener('join-link', listener)
  },
  // B3 pop-out: a standalone agent window receives its conversation id
  // post-load (mirrors onJoinLink) and resumes it from the vault app.db
  onOpenAgent: (cb: (conversationId: string) => void): (() => void) => {
    const listener = (_e: unknown, conversationId: string): void => cb(conversationId)
    ipcRenderer.on('open-agent', listener)
    return () => ipcRenderer.removeListener('open-agent', listener)
  },
})
