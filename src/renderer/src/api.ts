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

/** Real filesystem path of a dropped File (preload webUtils, story 7.4). */
export function pathForFile(file: File): string {
  return window.loredex.pathForFile(file)
}

/** Atlas export save panel (story 10.7, main-owned): null = user cancelled. */
export function saveExport(defaultName: string, data: string | ArrayBuffer): Promise<string | null> {
  return window.loredex.saveExport(defaultName, data)
}
