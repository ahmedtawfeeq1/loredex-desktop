/**
 * Edit-mode store (story 16.4, Addendum D1): per-note draft + save through
 * the core host. Session-only state — the note file is the only truth; a
 * draft never persists. Exiting edit keeps the draft in memory so ⌘E back
 * restores it; opening a DIFFERENT note resets everything.
 *
 * Story 16.7 (D1 amendment 2) adds the dirty-guard: a note/view switch with
 * an unsaved draft prompts save/discard instead of dropping work silently.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { Identity } from '../../../shared/types'
import { invoke } from '../api'
import { useApp } from './app'
import { effectiveIdentity, useIdentity } from './identity'
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

/**
 * Dirty-guard (story 16.7, D1 amendment 2): a note/view switch with an
 * unsaved draft prompts save/discard — never a silent drop. Confirm = save
 * through note.save (needs an identity — without one the draft is kept in
 * memory and a toast says why); cancel = discard. Where no prompt exists
 * (node tests, headless), discard keeps the pre-16.7 behavior.
 */
function guardDirtySwitch(kind: 'note' | 'view'): void {
  const editor = useEditor.getState()
  const name = (editor.path ?? '').split('/').pop() ?? ''
  const wantsSave =
    typeof globalThis.confirm === 'function' &&
    globalThis.confirm(`“${name}” has unsaved changes.\n\nOK saves them; Cancel discards.`)
  if (!wantsSave) {
    if (kind === 'note') editor.reset()
    else useEditor.setState({ draft: editor.saved })
    return
  }
  const identity = effectiveIdentity(useIdentity.getState())
  if (!identity) {
    // nothing is lost: the draft stays in memory under its note path
    useToasts.getState().push('Unsaved changes kept', 'Saving needs an identity — set it in Settings')
    return
  }
  void editor.save(identity).then((ok) => {
    if (ok && kind === 'note') useEditor.getState().reset()
  })
}

// A different note opened → the draft belongs to nobody; a clean draft drops
// silently, a dirty one goes through the save/discard guard (16.7).
useReader.subscribe((s, prev) => {
  if (s.selected === prev.selected) return
  const editor = useEditor.getState()
  if (!editor.path || editor.path === s.selected) return
  if (editor.draft !== editor.saved) guardDirtySwitch('note')
  else editor.reset()
})

// Leaving the reader view while a dirty draft is open → same guard (16.7);
// clean drafts keep the 16.4 behavior (kept in memory, ⌘E back restores).
useApp.subscribe((s, prev) => {
  if (s.view === prev.view || prev.view !== 'reader') return
  const editor = useEditor.getState()
  if (editor.path && editor.draft !== editor.saved) guardDirtySwitch('view')
})
