/**
 * Session caches for wikilink resolution + hover previews (story 2.2).
 * One `vault.resolveLink` per unique target per note — N repeated links cost
 * one invoke (chatty-clean seam). Cleared on refresh / vault change.
 */
import type { Doc } from '../../../shared/ipc-contract'
import type { LinkResolution } from '../../../shared/types'
import { invoke } from '../api'

export interface CacheEntry<T> {
  promise: Promise<T>
  /** settled value, readable synchronously on re-renders (no flicker) */
  result?: T
}

const resolutions = new Map<string, CacheEntry<LinkResolution>>()
const previews = new Map<string, CacheEntry<Doc>>()

function enter<T>(map: Map<string, CacheEntry<T>>, key: string, start: () => Promise<T>): CacheEntry<T> {
  let entry = map.get(key)
  if (!entry) {
    let promise: Promise<T>
    try {
      promise = start()
    } catch {
      promise = new Promise<T>(() => {}) // no bridge (unit tests) — stays pending
    }
    const e: CacheEntry<T> = { promise }
    promise.then(
      (result) => {
        e.result = result
      },
      () => {},
    )
    map.set(key, e)
    entry = e
  }
  return entry
}

export function resolveCached(link: string, from: string): CacheEntry<LinkResolution> {
  return enter(resolutions, `${from}::${link}`, () => invoke('vault.resolveLink', { link, from }))
}

export function previewCached(path: string): CacheEntry<Doc> {
  return enter(previews, path, () => invoke('vault.readNote', { path }))
}

/** Test seam + optimistic updates. */
export function seedResolution(link: string, from: string, result: LinkResolution): void {
  resolutions.set(`${from}::${link}`, { promise: Promise.resolve(result), result })
}

export function clearLinkCaches(): void {
  resolutions.clear()
  previews.clear()
}
