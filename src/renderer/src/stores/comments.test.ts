/**
 * Story 16.4 — inline-comments store: load guards staleness, the composer
 * carries the exact selected text, create writes through note.comment.create
 * and reloads, failures surface without losing the composer's anchor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useComments } from './comments'
import { useReader } from './reader'
import { useToasts } from './toasts'

const dana = { name: 'Dana Reyes', email: 'dana@nimbus.dev' }
const invoke = vi.fn()

beforeEach(() => {
  invoke.mockReset()
  // select BEFORE stubbing the bridge — the reader-follow subscription must
  // not fire a load against the un-primed mock
  useReader.setState({ selected: 'projects/p/t/note.md' })
  vi.stubGlobal('window', { loredex: { invoke } })
  useComments.getState().reset()
  useToasts.setState({ toasts: [] })
})

afterEach(() => {
  useReader.setState({ selected: null })
  vi.unstubAllGlobals()
})

describe('load', () => {
  it('loads the open note’s anchored comments', async () => {
    const list = [{ path: 'c.md', author: 'Dana <d@n.dev>', at: 't', anchor: 'x', body: 'b' }]
    invoke.mockResolvedValue(list)
    await useComments.getState().load('projects/p/t/note.md')
    expect(invoke).toHaveBeenCalledWith('note.comments', { path: 'projects/p/t/note.md' })
    expect(useComments.getState().list).toEqual(list)
  })

  it('a stale response for a note we already left never lands', async () => {
    invoke.mockResolvedValue([{ path: 'c.md', author: '', at: '', anchor: 'x', body: 'b' }])
    const pending = useComments.getState().load('projects/p/t/other-note.md')
    await pending
    expect(useComments.getState().list).toBeNull() // selected ≠ loaded path
  })
})

describe('composer + create', () => {
  it('openComposer keeps the exact selected text; create writes and reloads', async () => {
    invoke.mockImplementation((ch: string) =>
      ch === 'note.comment.create'
        ? Promise.resolve({ id: 'c', path: '/vault/projects/p/t/c.md', pushed: false })
        : Promise.resolve([]),
    )
    useComments.setState({ path: 'projects/p/t/note.md' })
    useComments.getState().openComposer('the exact selected text')
    expect(useComments.getState().composerAnchor).toBe('the exact selected text')

    expect(await useComments.getState().create('  why?  ', dana)).toBe(true)
    expect(invoke).toHaveBeenCalledWith('note.comment.create', {
      path: 'projects/p/t/note.md',
      anchor: 'the exact selected text',
      body: 'why?',
      identity: dana,
    })
    expect(useComments.getState().composerAnchor).toBeNull()
    expect(useToasts.getState().toasts.at(-1)?.title).toBe('Comment added')
    expect(invoke).toHaveBeenCalledWith('note.comments', { path: 'projects/p/t/note.md' })
  })

  it('whitespace-only selections never open a composer; blank bodies never write', async () => {
    useComments.setState({ path: 'n.md' })
    useComments.getState().openComposer('   ')
    expect(useComments.getState().composerAnchor).toBeNull()
    useComments.getState().openComposer('x')
    expect(await useComments.getState().create('   ', dana)).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('a failed create keeps the anchor and surfaces the message', async () => {
    invoke.mockRejectedValue({ code: 'INTERNAL', message: 'no identity' })
    useComments.setState({ path: 'n.md', composerAnchor: 'x' })
    expect(await useComments.getState().create('body', dana)).toBe(false)
    expect(useComments.getState()).toMatchObject({ composerAnchor: 'x', error: 'no identity' })
  })
})
