/**
 * BL-19: the Changes panel's non-trivial bits are the toggle (second click on
 * the same note closes) and the race guard (a slow read for note A must not
 * land after the user opened note B).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('../api', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))

const { useNoteDiff } = await import('./noteDiff')

const DIFF = {
  rel: 'notes/a.md',
  oldText: 'before',
  newText: 'after',
  sha: 'abc123',
  subject: 'edit a',
  when: '2026-07-20T10:00:00Z',
}

describe('useNoteDiff', () => {
  beforeEach(() => {
    invoke.mockReset()
    useNoteDiff.setState({ path: null, diff: null, busy: false, error: null })
  })

  it('loads the diff for a note', async () => {
    invoke.mockResolvedValue(DIFF)
    await useNoteDiff.getState().open('notes/a.md')
    expect(useNoteDiff.getState()).toMatchObject({ path: 'notes/a.md', diff: DIFF, busy: false })
  })

  it('reports a note with no git history instead of erroring', async () => {
    invoke.mockResolvedValue(null)
    await useNoteDiff.getState().open('notes/new.md')
    expect(useNoteDiff.getState().diff).toBeNull()
    expect(useNoteDiff.getState().error).toMatch(/No history/)
  })

  it('closes when the same note is opened twice', async () => {
    invoke.mockResolvedValue(DIFF)
    await useNoteDiff.getState().open('notes/a.md')
    await useNoteDiff.getState().open('notes/a.md')
    expect(useNoteDiff.getState().path).toBeNull()
    expect(invoke).toHaveBeenCalledTimes(1) // the toggle-close never re-reads
  })

  it('drops a stale read when another note was opened meanwhile', async () => {
    let resolveA: (v: unknown) => void = () => {}
    invoke.mockImplementationOnce(() => new Promise((r) => (resolveA = r)))
    const slow = useNoteDiff.getState().open('notes/a.md')

    invoke.mockResolvedValueOnce({ ...DIFF, rel: 'notes/b.md' })
    await useNoteDiff.getState().open('notes/b.md')

    resolveA(DIFF)
    await slow
    expect(useNoteDiff.getState().path).toBe('notes/b.md')
    expect(useNoteDiff.getState().diff?.rel).toBe('notes/b.md')
  })
})
