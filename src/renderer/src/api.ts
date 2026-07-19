/**
 * Renderer-side typed wrappers over window.loredex (the only bridge global).
 * All payload types come from the shared contract — never redefine them here.
 */
import type { CoreApi, CoreEvent, Unsubscribe } from '../../shared/ipc-contract'
import type { RecentVault } from '../../shared/recent-vaults'

declare global {
  interface Window {
    loredex: {
      invoke(ch: string, arg: unknown): Promise<unknown>
      onEvent(cb: (e: CoreEvent) => void): Unsubscribe
      pickVault(): Promise<string | null>
      onVaultChanged(cb: (vaultPath: string) => void): Unsubscribe
      onOpenHandoff(cb: (relPath: string) => void): Unsubscribe
      pickRouteFile(): Promise<string | null>
      pickProjectRoot(): Promise<string | null>
      pickWizardFolder(kind: 'create' | 'join'): Promise<string | null>
      setVault(vaultPath: string): Promise<string>
      pickVaultFolder(): Promise<string | null>
      listRecentVaults(): Promise<RecentVault[]>
      openInNewWindow(vaultPath?: string): Promise<null>
      openAgentWindow(vaultPath: string | null, conversationId: string): Promise<null>
      openTerminalWindow(vaultPath: string | null): Promise<null>
      onJoinLink(cb: (url: string) => void): Unsubscribe
      onOpenAgent(cb: (conversationId: string) => void): Unsubscribe
      pathForFile(file: File): string
      saveExport(defaultName: string, data: string | ArrayBuffer): Promise<string | null>
      // WP-F: reveal in the OS file manager / open in the default app (vault-relative path)
      revealPath(relPath: string): Promise<{ ok: boolean }>
      openPath(relPath: string): Promise<{ ok: boolean; revealed?: boolean }>
      platform: string
    }
  }
}

/** WP-F: reveal a vault-relative path in the OS file manager (best-effort). */
export function revealPath(relPath: string): Promise<{ ok: boolean }> {
  return window.loredex.revealPath(relPath)
}

/** WP-F: open a vault-relative path in the OS default app (reveal-fallback for
 *  non-allowlisted files / directories). */
export function openPath(relPath: string): Promise<{ ok: boolean; revealed?: boolean }> {
  return window.loredex.openPath(relPath)
}

export function invoke<K extends keyof CoreApi>(
  ch: K,
  arg: CoreApi[K]['in'],
): Promise<CoreApi[K]['out']> {
  return window.loredex.invoke(ch, arg) as Promise<CoreApi[K]['out']>
}

export function onEvent(cb: (e: CoreEvent) => void): Unsubscribe {
  return window.loredex.onEvent(cb)
}

/** Native vault picker (main-owned); resolves after the core host restarted. */
export function pickVault(): Promise<string | null> {
  return window.loredex.pickVault()
}

export function onVaultChanged(cb: (vaultPath: string) => void): Unsubscribe {
  return window.loredex.onVaultChanged(cb)
}

/** Notification click (story 3.7): '' = batched summary → the board. */
export function onOpenHandoff(cb: (relPath: string) => void): Unsubscribe {
  return window.loredex.onOpenHandoff(cb)
}

/** Native markdown picker for route-a-note (story 7.4, main-owned — NFR12). */
export function pickRouteFile(): Promise<string | null> {
  return window.loredex.pickRouteFile()
}

/** Native folder picker for contract project roots (story 11.1, main-owned). */
export function pickProjectRoot(): Promise<string | null> {
  return window.loredex.pickProjectRoot()
}

/** Wizard destination pick (story 13.1, main-owned native panel). */
export function pickWizardFolder(kind: 'create' | 'join'): Promise<string | null> {
  return window.loredex.pickWizardFolder(kind)
}

/** Wizard success pivot (story 13.1): persist the vault choice + restart the
 *  core host on it; resolves after the fresh port is brokered. */
export function setVault(vaultPath: string): Promise<string> {
  return window.loredex.setVault(vaultPath)
}

/** story 23.1: pick a vault folder with NO side effect (the menu chooses the action). */
export function pickVaultFolder(): Promise<string | null> {
  return window.loredex.pickVaultFolder()
}

/** story 23.1: the app-wide recently-opened vaults list (main-owned JSON). */
export function listRecentVaults(): Promise<RecentVault[]> {
  return window.loredex.listRecentVaults()
}

/** story 23.1: open a brand-new window bound to `vaultPath` (its own core host). */
export function openInNewWindow(vaultPath?: string): Promise<null> {
  return window.loredex.openInNewWindow(vaultPath)
}

/** B3 pop-out: open one agent conversation in its own standalone window (its own
 *  core host, same vault app.db → resumed from the persisted transcript). */
export function openAgentWindow(vaultPath: string | null, conversationId: string): Promise<null> {
  return window.loredex.openAgentWindow(vaultPath, conversationId)
}

/** Terminal-only pop-out: a standalone window with just the terminal, full-window. */
export function openTerminalWindow(vaultPath: string | null): Promise<null> {
  return window.loredex.openTerminalWindow(vaultPath)
}

/** The pop-out mode of THIS window, read from the ?popout= URL query at load
 *  (main sets it per createMainWindow). null for the normal full app window. */
export function popoutMode(): 'chat' | 'terminal' | null {
  const m = new URLSearchParams(window.location.search).get('popout')
  return m === 'chat' || m === 'terminal' ? m : null
}

/** loredex://join deep link (story 13.2): raw URL, parsed by shared/join-link. */
export function onJoinLink(cb: (url: string) => void): Unsubscribe {
  return window.loredex.onJoinLink(cb)
}

/** B3 pop-out: the standalone agent window receives its conversation id post-load
 *  (mirrors onJoinLink) and resumes it from the vault app.db. */
export function onOpenAgent(cb: (conversationId: string) => void): Unsubscribe {
  return window.loredex.onOpenAgent(cb)
}

/** Real filesystem path of a dropped File (preload webUtils, story 7.4). */
export function pathForFile(file: File): string {
  return window.loredex.pathForFile(file)
}

/** Atlas export save panel (story 10.7, main-owned): null = user cancelled. */
export function saveExport(defaultName: string, data: string | ArrayBuffer): Promise<string | null> {
  return window.loredex.saveExport(defaultName, data)
}
