/**
 * Story epic17.5 — file-pane content-search store: query→results mapping via
 * vault.search, Name↔Content mode split (Name never touches the backend),
 * Enter opens the top hit, Esc clears back to the tree.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchHit } from '../../../shared/ipc-contract'
import { useFileSearch } from './fileSearch'

const invoke = vi.fn()

function hit(name: string, path: string): SearchHit {
  return {
    name,
    project: 'nimbus-backend',
    topic: 'auth',
    date: '2026-07-09',
    status: 'active',
    kind: 'note',
    excerpt: `…${name} excerpt…`,
    path,
    score: 1,
  }
}

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue([])
  vi.stubGlobal('window', { loredex: { invoke } })
  useFileSearch.getState().reset()
})

afterEach(() => vi.unstubAllGlobals())

describe('mode toggle', () => {
  it('starts in Name mode', () => {
    expect(useFileSearch.getState().mode).toBe('name')
  })

  it('Name mode never calls the backend (it only feeds the tree filter)', () => {
    useFileSearch.getState().setQuery('error handling')
    expect(useFileSearch.getState().query).toBe('error handling')
    expect(invoke).not.toHaveBeenCalled()
    expect(useFileSearch.getState().results).toBeNull()
  })

  it('switching to Content with a live query runs a content search', async () => {
    invoke.mockResolvedValue([hit('2026-07-09-auth-retry', 'projects/nimbus-backend/a.md')])
    useFileSearch.getState().setQuery('auth')
    useFileSearch.getState().setMode('content')
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('vault.search', { q: 'auth', facets: {} }),
    )
    expect(useFileSearch.getState().results).toHaveLength(1)
  })

  it('switching back to Name drops the content results but keeps the query', async () => {
    invoke.mockResolvedValue([hit('a', 'a.md')])
    useFileSearch.setState({ mode: 'content', query: 'auth' })
    await useFileSearch.getState().runContentSearch()
    expect(useFileSearch.getState().results).toHaveLength(1)
    useFileSearch.getState().setMode('name')
    expect(useFileSearch.getState().mode).toBe('name')
    expect(useFileSearch.getState().results).toBeNull()
    expect(useFileSearch.getState().query).toBe('auth')
  })
})

describe('content query → results mapping', () => {
  it('maps vault.search hits into results', async () => {
    const hits = [hit('one', '1.md'), hit('two', '2.md')]
    invoke.mockResolvedValue(hits)
    useFileSearch.setState({ mode: 'content', query: 'auth' })
    await useFileSearch.getState().runContentSearch()
    expect(invoke).toHaveBeenCalledWith('vault.search', { q: 'auth', facets: {} })
    expect(useFileSearch.getState().results).toEqual(hits)
    expect(useFileSearch.getState().searching).toBe(false)
  })

  it('an empty query yields no results and no backend call', async () => {
    useFileSearch.setState({ mode: 'content', query: '   ' })
    await useFileSearch.getState().runContentSearch()
    expect(invoke).not.toHaveBeenCalled()
    expect(useFileSearch.getState().results).toBeNull()
  })

  it('a search failure surfaces the error and an empty result list', async () => {
    invoke.mockRejectedValue({ code: 'INTERNAL', message: 'index busy' })
    useFileSearch.setState({ mode: 'content', query: 'auth' })
    await useFileSearch.getState().runContentSearch()
    expect(useFileSearch.getState().results).toEqual([])
    expect(useFileSearch.getState().error).toBe('index busy')
  })

  it('a stale in-flight search never overwrites a newer one', async () => {
    let resolveFirst: (v: SearchHit[]) => void = () => {}
    invoke.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
    useFileSearch.setState({ mode: 'content', query: 'old' })
    const first = useFileSearch.getState().runContentSearch()
    invoke.mockResolvedValueOnce([hit('new', 'new.md')])
    useFileSearch.setState({ query: 'new' })
    await useFileSearch.getState().runContentSearch()
    resolveFirst([hit('old', 'old.md')])
    await first
    expect(useFileSearch.getState().results).toEqual([hit('new', 'new.md')])
  })
})

describe('Enter opens the top hit', () => {
  it('openTop opens results[0] through the passed opener', async () => {
    invoke.mockResolvedValue([hit('top', 'top.md'), hit('second', 'second.md')])
    useFileSearch.setState({ mode: 'content', query: 'auth' })
    await useFileSearch.getState().runContentSearch()
    const open = vi.fn()
    expect(useFileSearch.getState().openTop(open)).toBe(true)
    expect(open).toHaveBeenCalledWith('top.md')
  })

  it('openTop no-ops (returns false) when there are no results', () => {
    const open = vi.fn()
    expect(useFileSearch.getState().openTop(open)).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
})

describe('Esc clears back to the tree', () => {
  it('escape resets to Name mode, empty query, no results', async () => {
    invoke.mockResolvedValue([hit('a', 'a.md')])
    useFileSearch.setState({ mode: 'content', query: 'auth' })
    await useFileSearch.getState().runContentSearch()
    useFileSearch.getState().escape()
    expect(useFileSearch.getState()).toMatchObject({
      mode: 'name',
      query: '',
      results: null,
      error: null,
    })
  })
})
