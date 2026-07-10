/**
 * Story 16.2 (Addendum D1) — rails store: toggles apply immediately and
 * persist per vault through settings.rails.*; load applies the stored state;
 * a missing bridge/core degrades to session-only expanded rails.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRails } from './rails'

const invoke = vi.fn()

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue(undefined)
  vi.stubGlobal('window', { loredex: { invoke } })
  useRails.setState({ sidebar: false, list: false, listWidth: 300 })
})

afterEach(() => vi.unstubAllGlobals())

describe('toggles persist the WHOLE per-vault state', () => {
  it('toggleSidebar flips the flag and writes both flags', () => {
    useRails.getState().toggleSidebar()
    expect(useRails.getState().sidebar).toBe(true)
    expect(invoke).toHaveBeenCalledWith('settings.rails.set', { sidebar: true, list: false })
  })

  it('toggleList flips the flag and writes both flags', () => {
    useRails.setState({ sidebar: true, list: false })
    useRails.getState().toggleList()
    expect(useRails.getState().list).toBe(true)
    expect(invoke).toHaveBeenCalledWith('settings.rails.set', { sidebar: true, list: true })
  })

  it('a second toggle expands again (and persists that too)', () => {
    useRails.getState().toggleList()
    useRails.getState().toggleList()
    expect(useRails.getState().list).toBe(false)
    expect(invoke).toHaveBeenLastCalledWith('settings.rails.set', { sidebar: false, list: false })
  })

  it('persistence failure keeps the session state applied (best-effort)', () => {
    invoke.mockRejectedValue(new Error('core gone'))
    useRails.getState().toggleSidebar()
    expect(useRails.getState().sidebar).toBe(true)
  })

  it('no bridge at all (node tests) still toggles — session-only', () => {
    vi.unstubAllGlobals()
    useRails.getState().toggleSidebar()
    expect(useRails.getState().sidebar).toBe(true)
  })
})

describe('load applies the vault’s stored state', () => {
  it('reads settings.rails.get and applies both flags', async () => {
    invoke.mockResolvedValue({ sidebar: true, list: true })
    await useRails.getState().load()
    expect(invoke).toHaveBeenCalledWith('settings.rails.get', undefined)
    expect(useRails.getState()).toMatchObject({ sidebar: true, list: true })
  })

  it('load failure leaves the rails expanded (no core yet)', async () => {
    invoke.mockRejectedValue(new Error('no core'))
    useRails.setState({ sidebar: false, list: false })
    await useRails.getState().load()
    expect(useRails.getState()).toMatchObject({ sidebar: false, list: false })
  })

  it('reset returns to expanded (vault switch, before the new load)', () => {
    useRails.setState({ sidebar: true, list: true, listWidth: 420 })
    useRails.getState().reset()
    expect(useRails.getState()).toMatchObject({ sidebar: false, list: false, listWidth: 300 })
  })

  it('load also applies the vault’s stored list width (own app_settings row)', async () => {
    invoke.mockImplementation((channel: string) =>
      channel === 'settings.listWidth.get'
        ? Promise.resolve({ width: 420 })
        : Promise.resolve({ sidebar: false, list: false }),
    )
    await useRails.getState().load()
    expect(invoke).toHaveBeenCalledWith('settings.listWidth.get', undefined)
    expect(useRails.getState().listWidth).toBe(420)
  })

  it('load clamps a hand-widened stored width into the band', async () => {
    invoke.mockImplementation((channel: string) =>
      channel === 'settings.listWidth.get'
        ? Promise.resolve({ width: 9000 })
        : Promise.resolve({ sidebar: false, list: false }),
    )
    await useRails.getState().load()
    expect(useRails.getState().listWidth).toBe(480)
  })
})

describe('list-pane resize (story epic17.4)', () => {
  it('dragListWidth clamps to the band and does NOT persist (live drag)', () => {
    useRails.getState().dragListWidth(150) // below the 200 floor
    expect(useRails.getState().listWidth).toBe(200)
    useRails.getState().dragListWidth(999) // above the 480 ceiling
    expect(useRails.getState().listWidth).toBe(480)
    expect(invoke).not.toHaveBeenCalledWith('settings.listWidth.set', expect.anything())
  })

  it('commitListWidth persists the current width (drag-end)', () => {
    useRails.getState().dragListWidth(360)
    useRails.getState().commitListWidth()
    expect(invoke).toHaveBeenCalledWith('settings.listWidth.set', { width: 360 })
  })

  it('resetListWidth returns to 300 and persists (double-click)', () => {
    useRails.setState({ listWidth: 470 })
    useRails.getState().resetListWidth()
    expect(useRails.getState().listWidth).toBe(300)
    expect(invoke).toHaveBeenCalledWith('settings.listWidth.set', { width: 300 })
  })

  it('a persist failure keeps the dragged width applied (best-effort)', () => {
    invoke.mockRejectedValue(new Error('core gone'))
    useRails.getState().dragListWidth(340)
    useRails.getState().commitListWidth()
    expect(useRails.getState().listWidth).toBe(340)
  })
})
