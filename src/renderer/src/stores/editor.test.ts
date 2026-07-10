/**
 * Story 16.4 — edit-mode store: enter/exit keep the draft, unsaved is
 * draft ≠ saved, save writes through note.save with a receipt toast, and a
 * different note opening resets the draft (it belongs to nobody else).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Doc } from '../../../shared/ipc-contract'
import { useEditor } from './editor'
import { useReader } from './reader'
import { useToasts } from './toasts'

const dana = { name: 'Dana Reyes', email: 'dana@nimbus.dev' }
const invoke = vi.fn()

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue({ path: 'projects/p/t/note.md' })
  vi.stubGlobal('window', { loredex: { invoke } })
  useEditor.getState().reset()
  useToasts.setState({ toasts: [] })
})

afterEach(() => vi.unstubAllGlobals())

describe('enter / draft / exit', () => {
  it('enter seeds draft+saved from the body; edits raise the unsaved flag', () => {
    useEditor.getState().enter('a.md', 'body\n')
    expect(useEditor.getState()).toMatchObject({ editing: true, draft: 'body\n', saved: 'body\n' })
    useEditor.getState().setDraft('body edited\n')
    const s = useEditor.getState()
    expect(s.draft !== s.saved).toBe(true)
  })

  it('exit keeps the draft; re-entering the SAME note restores it', () => {
    useEditor.getState().enter('a.md', 'body\n')
    useEditor.getState().setDraft('kept\n')
    useEditor.getState().exit()
    expect(useEditor.getState().editing).toBe(false)
    useEditor.getState().enter('a.md', 'body\n')
    expect(useEditor.getState().draft).toBe('kept\n')
  })

  it('entering a DIFFERENT note starts fresh', () => {
    useEditor.getState().enter('a.md', 'aaa')
    useEditor.getState().setDraft('changed')
    useEditor.getState().enter('b.md', 'bbb')
    expect(useEditor.getState()).toMatchObject({ path: 'b.md', draft: 'bbb', saved: 'bbb' })
  })

  it('opening another note in the reader resets the editor entirely', () => {
    useEditor.getState().enter('a.md', 'aaa')
    useReader.setState({ selected: 'b.md' })
    expect(useEditor.getState()).toMatchObject({ path: null, editing: false, draft: '' })
    useReader.setState({ selected: null })
  })
})

describe('save (⌘S → note.save)', () => {
  it('saves the draft, marks it clean, and pushes the receipt toast', async () => {
    useEditor.getState().enter('projects/p/t/note.md', 'old\n')
    useEditor.getState().setDraft('new\n')
    expect(await useEditor.getState().save(dana)).toBe(true)
    expect(invoke).toHaveBeenCalledWith('note.save', {
      path: 'projects/p/t/note.md',
      body: 'new\n',
      identity: dana,
    })
    expect(useEditor.getState().saved).toBe('new\n')
    const toast = useToasts.getState().toasts.at(-1)
    expect(toast?.title).toBe('Note saved')
    expect(toast?.detail).toContain('projects/p/t/note.md')
  })

  it('a clean draft never writes (no empty commits)', async () => {
    useEditor.getState().enter('a.md', 'same\n')
    expect(await useEditor.getState().save(dana)).toBe(true)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('a failed save surfaces the envelope message and keeps the draft', async () => {
    invoke.mockRejectedValue({ code: 'VAULT_OUTSIDE_PATH', message: 'nope' })
    useEditor.getState().enter('a.md', 'old')
    useEditor.getState().setDraft('new')
    expect(await useEditor.getState().save(dana)).toBe(false)
    expect(useEditor.getState()).toMatchObject({ error: 'nope', draft: 'new' })
  })
})
