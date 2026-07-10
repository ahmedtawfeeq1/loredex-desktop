/**
 * Recent + saved searches (epic22, D1 amendment 7 §B). Last-8 recent queries and
 * an optional saved-search list, persisted app-wide in localStorage so they
 * survive launches; degrade to session-only where storage is absent (node tests /
 * locked partition), exactly like boardFilter. Pure list logic is separated from
 * the storage wrapper so it stays node-testable.
 */

export const MAX_RECENT_SEARCHES = 8
export const RECENTS_KEY = 'loredex.recentSearches'
export const SAVED_KEY = 'loredex.savedSearches'

/** Push a query to the front, dedup, cap at `max`. Blank queries are ignored. */
export function pushRecent(list: string[], q: string, max = MAX_RECENT_SEARCHES): string[] {
  const t = q.trim()
  if (!t) return list
  return [t, ...list.filter((x) => x !== t)].slice(0, max)
}

/** Toggle a saved search: add if absent, remove if present (front-inserted). */
export function toggleSaved(list: string[], q: string): string[] {
  const t = q.trim()
  if (!t) return list
  return list.includes(t) ? list.filter((x) => x !== t) : [t, ...list]
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadStrings(key: string): string[] {
  const s = storage()
  if (!s) return []
  try {
    const raw = s.getItem(key)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function saveStrings(key: string, list: string[]): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(key, JSON.stringify(list))
  } catch {
    // stays applied for this session
  }
}
