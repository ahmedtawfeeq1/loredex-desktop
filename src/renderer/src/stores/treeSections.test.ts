/**
 * Story 16.3 (Addendum D1) — tree-sections store: toggles apply immediately
 * and persist the whole per-vault set through settings.treeSections.*; load
 * applies the stored paths; a missing bridge/core degrades to session-only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTreeSections } from './treeSections'

const invoke = vi.fn()

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue(undefined)
  vi.stubGlobal('window', { loredex: { invoke } })
  useTreeSections.setState({ collapsed: [] })
})

afterEach(() => vi.unstubAllGlobals())

describe('toggle persists the WHOLE per-vault collapsed set', () => {
  it('collapsing a section adds its path and writes the set', () => {
    useTreeSections.getState().toggle('projects/nimbus-backend')
    expect(useTreeSections.getState().collapsed).toEqual(['projects/nimbus-backend'])
    expect(invoke).toHaveBeenCalledWith('settings.treeSections.set', {
      collapsed: ['projects/nimbus-backend'],
    })
  })

  it('a second toggle expands again (and persists the removal)', () => {
    useTreeSections.setState({ collapsed: ['_index', 'projects'] })
    useTreeSections.getState().toggle('projects')
    expect(useTreeSections.getState().collapsed).toEqual(['_index'])
    expect(invoke).toHaveBeenLastCalledWith('settings.treeSections.set', {
      collapsed: ['_index'],
    })
  })

  it('sections collapse independently — the set accumulates', () => {
    useTreeSections.getState().toggle('projects')
    useTreeSections.getState().toggle('projects/nimbus-mobile')
    expect(useTreeSections.getState().collapsed).toEqual(['projects', 'projects/nimbus-mobile'])
  })

  it('persistence failure keeps the session state applied (best-effort)', () => {
    invoke.mockRejectedValue(new Error('core gone'))
    useTreeSections.getState().toggle('_index')
    expect(useTreeSections.getState().collapsed).toEqual(['_index'])
  })

  it('no bridge at all (node tests) still toggles — session-only', () => {
    vi.unstubAllGlobals()
    useTreeSections.getState().toggle('_index')
    expect(useTreeSections.getState().collapsed).toEqual(['_index'])
  })
})

describe('load applies the vault’s stored collapsed set', () => {
  it('reads settings.treeSections.get and applies the paths', async () => {
    invoke.mockResolvedValue({ collapsed: ['projects', '_index'] })
    await useTreeSections.getState().load()
    expect(invoke).toHaveBeenCalledWith('settings.treeSections.get', undefined)
    expect(useTreeSections.getState().collapsed).toEqual(['projects', '_index'])
  })

  it('load failure leaves everything expanded (no core yet)', async () => {
    invoke.mockRejectedValue(new Error('no core'))
    await useTreeSections.getState().load()
    expect(useTreeSections.getState().collapsed).toEqual([])
  })

  it('reset returns to expanded (vault switch, before the new load)', () => {
    useTreeSections.setState({ collapsed: ['projects'] })
    useTreeSections.getState().reset()
    expect(useTreeSections.getState().collapsed).toEqual([])
  })
})
