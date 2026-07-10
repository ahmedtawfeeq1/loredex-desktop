/**
 * Renderer-side typed wrappers over window.loredex (the only bridge global).
 * All payload types come from the shared contract — never redefine them here.
 */
import type { CoreApi, CoreEvent, Unsubscribe } from '../../shared/ipc-contract'

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
      onJoinLink(cb: (url: string) => void): Unsubscribe
      pathForFile(file: File): string
      saveExport(defaultName: string, data: string | ArrayBuffer): Promise<string | null>
    }
  }
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

/** loredex://join deep link (story 13.2): raw URL, parsed by shared/join-link. */
export function onJoinLink(cb: (url: string) => void): Unsubscribe {
  return window.loredex.onJoinLink(cb)
}

/** Real filesystem path of a dropped File (preload webUtils, story 7.4). */
export function pathForFile(file: File): string {
  return window.loredex.pathForFile(file)
}

/** Atlas export save panel (story 10.7, main-owned): null = user cancelled. */
export function saveExport(defaultName: string, data: string | ArrayBuffer): Promise<string | null> {
  return window.loredex.saveExport(defaultName, data)
}
