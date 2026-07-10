/**
 * Edit-mode store (story 16.4, Addendum D1): per-note draft + save through
 * the core host. Session-only state — the note file is the only truth; a
 * draft never persists. Exiting edit keeps the draft in memory so ⌘E back
 * restores it; opening a DIFFERENT note resets everything.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { Identity } from '../../../shared/types'
import { invoke } from '../api'
import { useReader } from './reader'
import { useToasts } from './toasts'

interface EditorState {
  /** vault-relative path the draft belongs to */
  path: string | null
  editing: boolean
  draft: string
  /** the body as last loaded/saved — draft !== saved ⇒ the unsaved dot */
  saved: string
  busy: boolean
  error: string | null
  enter(path: string, body: string): void
  exit(): void
  setDraft(draft: string): void
  save(identity: Identity): Promise<boolean>
  reset(): void
}

export const useEditor = create<EditorState>((set, get) => ({
  path: null,
  editing: false,
  draft: '',
  saved: '',
  busy: false,
  error: null,

  enter(path, body) {
    const s = get()
    // re-entering the same note restores the kept draft; a new note starts fresh
    if (s.path === path) set({ editing: true, error: null })
    else set({ path, editing: true, draft: body, saved: body, busy: false, error: null })
  },

  exit() {
    set({ editing: false })
  },

  setDraft(draft) {
    set({ draft })
  },

  async save(identity) {
    const { path, draft, saved, busy } = get()
    if (!path || busy) return false
    if (draft === saved) return true // nothing to write — no empty commits
    set({ busy: true, error: null })
    try {
      const result = await invoke('note.save', { path, body: draft, identity })
      set({ saved: draft, busy: false, error: null })
      useToasts.getState().push('Note saved', `${result.path} · committed — will push on next sync`)
      return true
    } catch (e) {
      set({ busy: false, error: isErrEnvelope(e) ? e.message : String(e) })
      return false
    }
  },

  reset() {
    set({ path: null, editing: false, draft: '', saved: '', busy: false, error: null })
  },
}))

// A different note opened → the draft belongs to nobody; drop edit mode.
useReader.subscribe((s, prev) => {
  if (s.selected === prev.selected) return
  const editor = useEditor.getState()
  if (editor.path && editor.path !== s.selected) editor.reset()
})
