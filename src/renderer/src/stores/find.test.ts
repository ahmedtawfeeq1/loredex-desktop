/**
 * Find bar store (story epic17.3, D1a3): the node-testable seam between the
 * ⌘F action, the FindBar UI, and the reader's DOM scan. Open/close (Esc),
 * case toggle, and prev/next wrap-around off the reported match total.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useFind } from './find'

beforeEach(() => useFind.getState().reset())

describe('find store (D1a3)', () => {
  it('openBar shows the bar; close (Esc) hides it', () => {
    useFind.getState().openBar()
    expect(useFind.getState().open).toBe(true)
    useFind.getState().close()
    expect(useFind.getState().open).toBe(false)
  })

  it('setResults seats the cursor on the first match, or -1 when none', () => {
    useFind.getState().setResults(17)
    expect(useFind.getState()).toMatchObject({ total: 17, current: 0 })
    useFind.getState().setResults(0)
    expect(useFind.getState()).toMatchObject({ total: 0, current: -1 })
  })

  it('next/prev wrap around the reported total', () => {
    useFind.getState().setResults(3)
    const s = useFind.getState()
    s.next()
    expect(useFind.getState().current).toBe(1)
    s.next()
    s.next()
    expect(useFind.getState().current).toBe(0) // wrapped forward past the last
    s.prev()
    expect(useFind.getState().current).toBe(2) // wrapped backward before the first
  })

  it('case toggle flips the flag (default off)', () => {
    expect(useFind.getState().caseSensitive).toBe(false)
    useFind.getState().toggleCase()
    expect(useFind.getState().caseSensitive).toBe(true)
  })

  it('reset clears query, case, cursor, and closes', () => {
    useFind.getState().openBar()
    useFind.getState().setQuery('api')
    useFind.getState().toggleCase()
    useFind.getState().setResults(4)
    useFind.getState().reset()
    expect(useFind.getState()).toMatchObject({
      open: false,
      query: '',
      caseSensitive: false,
      total: 0,
      current: -1,
    })
  })
})
