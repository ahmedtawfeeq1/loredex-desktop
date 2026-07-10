/**
 * epic23 / D1 amendment 7 §D: vault switcher menu wiring. Each menu action maps
 * to exactly the right main-process capability — switch-in-place goes through
 * setVault (restart THIS window's core), open-in-new-window spawns a window on
 * the chosen/last vault, and a cancelled folder pick is a no-op.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api', () => ({
  listRecentVaults: vi.fn(),
  openInNewWindow: vi.fn(),
  pickVaultFolder: vi.fn(),
  setVault: vi.fn(),
}))

import { listRecentVaults, openInNewWindow, pickVaultFolder, setVault } from '../api'
import { useVaultMenu } from './vaultMenu'

const mocks = {
  listRecentVaults: vi.mocked(listRecentVaults),
  openInNewWindow: vi.mocked(openInNewWindow),
  pickVaultFolder: vi.mocked(pickVaultFolder),
  setVault: vi.mocked(setVault),
}

beforeEach(() => {
  useVaultMenu.setState({ open: false, recents: [], busy: false })
  mocks.listRecentVaults.mockResolvedValue([])
  mocks.openInNewWindow.mockResolvedValue(null)
  mocks.pickVaultFolder.mockResolvedValue(null)
  mocks.setVault.mockResolvedValue('/x')
})
afterEach(() => vi.clearAllMocks())

describe('toggle + refresh', () => {
  it('opening loads recents; toggling again closes without a reload', async () => {
    mocks.listRecentVaults.mockResolvedValue([
      { path: '/a', name: 'a', openedAt: '2026-07-11T00:00:00.000Z' },
    ])
    await useVaultMenu.getState().toggle()
    expect(useVaultMenu.getState().open).toBe(true)
    expect(useVaultMenu.getState().recents.map((r) => r.path)).toEqual(['/a'])
    expect(mocks.listRecentVaults).toHaveBeenCalledTimes(1)

    await useVaultMenu.getState().toggle()
    expect(useVaultMenu.getState().open).toBe(false)
    expect(mocks.listRecentVaults).toHaveBeenCalledTimes(1)
  })

  it('refresh degrades to an empty list when the bridge throws', async () => {
    mocks.listRecentVaults.mockRejectedValue(new Error('no bridge'))
    await useVaultMenu.getState().refresh()
    expect(useVaultMenu.getState().recents).toEqual([])
  })
})

describe('switchTo (switch in place)', () => {
  it('sends the chosen recent through setVault and closes the menu', async () => {
    useVaultMenu.setState({ open: true })
    await useVaultMenu.getState().switchTo('/vaults/nimbus')
    expect(mocks.setVault).toHaveBeenCalledExactlyOnceWith('/vaults/nimbus')
    expect(mocks.openInNewWindow).not.toHaveBeenCalled()
    expect(useVaultMenu.getState().open).toBe(false)
    expect(useVaultMenu.getState().busy).toBe(false)
  })

  it('ignores a re-entrant call while busy', async () => {
    useVaultMenu.setState({ busy: true })
    await useVaultMenu.getState().switchTo('/vaults/nimbus')
    expect(mocks.setVault).not.toHaveBeenCalled()
  })
})

describe('openHere (pick → switch in place)', () => {
  it('switches in place on the picked folder', async () => {
    mocks.pickVaultFolder.mockResolvedValue('/vaults/picked')
    await useVaultMenu.getState().openHere()
    expect(mocks.setVault).toHaveBeenCalledExactlyOnceWith('/vaults/picked')
  })

  it('is a no-op when the folder pick is cancelled', async () => {
    mocks.pickVaultFolder.mockResolvedValue(null)
    await useVaultMenu.getState().openHere()
    expect(mocks.setVault).not.toHaveBeenCalled()
  })
})

describe('openNewWindow', () => {
  it('opens a new window directly on a given recent path — never touches this window', async () => {
    await useVaultMenu.getState().openNewWindow('/vaults/other')
    expect(mocks.openInNewWindow).toHaveBeenCalledExactlyOnceWith('/vaults/other')
    expect(mocks.pickVaultFolder).not.toHaveBeenCalled()
    expect(mocks.setVault).not.toHaveBeenCalled()
  })

  it('without a path, picks a folder first then opens the new window on it', async () => {
    mocks.pickVaultFolder.mockResolvedValue('/vaults/fresh')
    await useVaultMenu.getState().openNewWindow()
    expect(mocks.openInNewWindow).toHaveBeenCalledExactlyOnceWith('/vaults/fresh')
  })

  it('cancelled pick opens nothing', async () => {
    mocks.pickVaultFolder.mockResolvedValue(null)
    await useVaultMenu.getState().openNewWindow()
    expect(mocks.openInNewWindow).not.toHaveBeenCalled()
  })
})
