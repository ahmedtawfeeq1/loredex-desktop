/**
 * epic22 / D1 amendment 7 §B: recent + saved search list logic and the
 * localStorage persistence round-trip (degrades to session-only without storage).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  loadStrings,
  MAX_RECENT_SEARCHES,
  pushRecent,
  RECENTS_KEY,
  saveStrings,
  toggleSaved,
} from './search-recents'

afterEach(() => {
  vi.unstubAllGlobals()
})

function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size
    },
  } as Storage
}

describe('pushRecent', () => {
  it('front-inserts, dedups, and caps at 8', () => {
    let list: string[] = []
    for (const q of ['a', 'b', 'c']) list = pushRecent(list, q)
    expect(list).toEqual(['c', 'b', 'a'])
    // re-running an existing query moves it to the front (no duplicate)
    list = pushRecent(list, 'a')
    expect(list).toEqual(['a', 'c', 'b'])
  })

  it('caps at MAX_RECENT_SEARCHES, oldest dropped', () => {
    let list: string[] = []
    for (let i = 0; i < 12; i++) list = pushRecent(list, `q${i}`)
    expect(list).toHaveLength(MAX_RECENT_SEARCHES)
    expect(list[0]).toBe('q11')
    expect(list).not.toContain('q3')
  })

  it('ignores blank queries', () => {
    expect(pushRecent(['a'], '   ')).toEqual(['a'])
  })
})

describe('toggleSaved', () => {
  it('adds when absent, removes when present', () => {
    expect(toggleSaved([], 'project:api')).toEqual(['project:api'])
    expect(toggleSaved(['project:api'], 'project:api')).toEqual([])
    expect(toggleSaved(['x'], 'y')).toEqual(['y', 'x'])
  })
})

describe('persistence', () => {
  it('round-trips through localStorage', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    saveStrings(RECENTS_KEY, ['project:api websocket', 'auth'])
    expect(loadStrings(RECENTS_KEY)).toEqual(['project:api websocket', 'auth'])
  })

  it('survives a fresh module read (a new launch reads what was written)', () => {
    const store = fakeStorage()
    vi.stubGlobal('localStorage', store)
    saveStrings(RECENTS_KEY, ['a', 'b'])
    // simulate relaunch: same backing storage, fresh load
    vi.stubGlobal('localStorage', store)
    expect(loadStrings(RECENTS_KEY)).toEqual(['a', 'b'])
  })

  it('degrades to empty (never throws) when storage is absent', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(loadStrings(RECENTS_KEY)).toEqual([])
    expect(() => saveStrings(RECENTS_KEY, ['a'])).not.toThrow()
  })

  it('ignores corrupt JSON', () => {
    const store = fakeStorage()
    store.setItem(RECENTS_KEY, '{not json')
    vi.stubGlobal('localStorage', store)
    expect(loadStrings(RECENTS_KEY)).toEqual([])
  })
})
