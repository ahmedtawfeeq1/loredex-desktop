/**
 * Inline-comments store (story 16.4, Addendum D1): the open note's anchored
 * comments + the margin composer. Follows the reader — a new selection
 * resets, a re-read doc (save/watcher) reloads. Session-only state; the
 * comment notes themselves are the truth.
 */
import { create } from 'zustand'
import { toVaultRelative } from '../../../shared/handoff-lanes'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { Identity, NoteComment } from '../../../shared/types'
import { invoke } from '../api'
import { useApp } from './app'
import { useReader } from './reader'
import { receiptDetail, useToasts } from './toasts'

interface CommentsState {
  /** note the list belongs to */
  path: string | null
  list: NoteComment[] | null
  /** the exact selected text a composer is open for; null = closed */
  composerAnchor: string | null
  busy: boolean
  error: string | null
  load(path: string): Promise<void>
  openComposer(anchor: string): void
  closeComposer(): void
  create(body: string, identity: Identity): Promise<boolean>
  reset(): void
}

export const useComments = create<CommentsState>((set, get) => ({
  path: null,
  list: null,
  composerAnchor: null,
  busy: false,
  error: null,

  async load(path) {
    try {
      const list = await invoke('note.comments', { path })
      // a slow response for a note we already left must not land (stale guard)
      if (useReader.getState().selected === path) set({ path, list, error: null })
    } catch (e) {
      set({ path, list: [], error: isErrEnvelope(e) ? e.message : String(e) })
    }
  },

  openComposer(anchor) {
    if (anchor.trim()) set({ composerAnchor: anchor, error: null })
  },

  closeComposer() {
    set({ composerAnchor: null })
  },

  async create(body, identity) {
    const { path, composerAnchor, busy } = get()
    if (!path || !composerAnchor || busy || !body.trim()) return false
    set({ busy: true, error: null })
    try {
      const result = await invoke('note.comment.create', {
        path,
        anchor: composerAnchor,
        body: body.trim(),
        identity,
      })
      set({ busy: false, composerAnchor: null })
      const vaultPath = useApp.getState().identity?.vaultPath ?? ''
      useToasts
        .getState()
        .push('Comment added', receiptDetail(toVaultRelative(result.path, vaultPath), result.pushed))
      await get().load(path)
      return true
    } catch (e) {
      set({ busy: false, error: isErrEnvelope(e) ? e.message : String(e) })
      return false
    }
  },

  reset() {
    set({ path: null, list: null, composerAnchor: null, busy: false, error: null })
  },
}))

// Follow the reader: new note → reset + load; re-read doc (save, watcher,
// comment create's vault.changed) → reload the list for the same note.
useReader.subscribe((s, prev) => {
  if (typeof window === 'undefined' || !window.loredex) return // node tests
  const comments = useComments.getState()
  if (s.selected !== prev.selected) {
    comments.reset()
    if (s.selected) void comments.load(s.selected)
  } else if (s.doc !== prev.doc && s.selected) {
    void comments.load(s.selected)
  }
})
