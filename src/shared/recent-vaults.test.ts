/**
 * epic23 / D1 amendment 7 §D: recent-vaults list logic — the persisted,
 * app-wide backing for the vault switcher menu.
 */
import { describe, expect, it } from 'vitest'
import { MAX_RECENT_VAULTS, pushRecent, type RecentVault, vaultNameFromPath } from './recent-vaults'

const v = (path: string, openedAt = '2026-07-11T00:00:00.000Z'): RecentVault => ({
  path,
  name: vaultNameFromPath(path),
  openedAt,
})

describe('pushRecent', () => {
  it('front-inserts newest-first', () => {
    let list: RecentVault[] = []
    for (const p of ['/a', '/b', '/c']) list = pushRecent(list, v(p))
    expect(list.map((r) => r.path)).toEqual(['/c', '/b', '/a'])
  })

  it('dedups by path — re-opening moves to the front, never duplicates', () => {
    let list = [v('/c'), v('/b'), v('/a')]
    list = pushRecent(list, v('/a', '2026-07-11T09:00:00.000Z'))
    expect(list.map((r) => r.path)).toEqual(['/a', '/c', '/b'])
    expect(list).toHaveLength(3)
    // the re-opened entry carries the fresh timestamp, not the stale one
    expect(list[0]?.openedAt).toBe('2026-07-11T09:00:00.000Z')
  })

  it('caps at MAX_RECENT_VAULTS (8), dropping the oldest', () => {
    let list: RecentVault[] = []
    for (let i = 0; i < 12; i++) list = pushRecent(list, v(`/vault-${i}`))
    expect(list).toHaveLength(MAX_RECENT_VAULTS)
    expect(list[0]?.path).toBe('/vault-11')
    expect(list.at(-1)?.path).toBe('/vault-4')
    expect(list.some((r) => r.path === '/vault-3')).toBe(false)
  })

  it('honors a custom cap and never returns a negative slice', () => {
    let list = [v('/c'), v('/b'), v('/a')]
    list = pushRecent(list, v('/d'), 2)
    expect(list.map((r) => r.path)).toEqual(['/d', '/c'])
    expect(pushRecent(list, v('/e'), 0)).toEqual([])
  })
})

describe('vaultNameFromPath', () => {
  it('takes the trailing segment, tolerant of trailing slashes and separators', () => {
    expect(vaultNameFromPath('/Users/me/nimbus-vault')).toBe('nimbus-vault')
    expect(vaultNameFromPath('/Users/me/nimbus-vault/')).toBe('nimbus-vault')
    expect(vaultNameFromPath('C:\\vaults\\team')).toBe('team')
    expect(vaultNameFromPath('solo')).toBe('solo')
  })
})
