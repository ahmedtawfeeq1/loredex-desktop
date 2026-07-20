/**
 * BL-19: the note's own before/after review panel.
 *
 * The contract timeline already answers "what changed in this API" with a
 * two-column diff; a note that an agent just rewrote deserves the same read.
 * This asks core for the last commit that touched the note (`note.diff`) and
 * holds the result for ReaderSurface to render over the note body.
 *
 * Read-only and dex-type-neutral: it is plain git history, so it works on
 * research and agent-ops dexes alike.
 */
import { create } from 'zustand'
import { invoke } from '../api'
import type { CoreApi } from '../../../shared/ipc-contract'

export type NoteDiff = NonNullable<CoreApi['note.diff']['out']>

interface NoteDiffState {
  /** the note the panel is open for — null when closed */
  path: string | null
  diff: NoteDiff | null
  busy: boolean
  /** set when the note has no git history (never committed) or the read failed */
  error: string | null
  open(path: string): Promise<void>
  close(): void
}

export const useNoteDiff = create<NoteDiffState>((set, get) => ({
  path: null,
  diff: null,
  busy: false,
  error: null,

  async open(path) {
    // second click on the same note closes it — the button is a toggle
    if (get().path === path) {
      set({ path: null, diff: null, error: null })
      return
    }
    set({ path, diff: null, busy: true, error: null })
    try {
      const diff = await invoke('note.diff', { path })
      // a later open() may have won the race — only land on the current note
      if (get().path !== path) return
      set(
        diff
          ? { diff, busy: false }
          : { busy: false, error: 'No history for this note yet — nothing committed.' },
      )
    } catch (e) {
      if (get().path !== path) return
      set({ busy: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  close() {
    set({ path: null, diff: null, busy: false, error: null })
  },
}))
