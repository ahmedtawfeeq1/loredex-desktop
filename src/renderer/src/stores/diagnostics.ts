/**
 * Broken-wikilink diagnostics (story 2.2): per-vault list fed lazily as notes
 * render. Broken links are diagnostics because agents also write the vault —
 * auto-create is dangerous and never happens.
 */
import { create } from 'zustand'

interface DiagnosticsState {
  open: boolean
  /** notePath → broken raw link targets found while rendering it */
  byNote: Record<string, string[]>
  report(note: string, link: string): void
  clearNote(note: string): void
  clear(): void
  setOpen(open: boolean): void
}

/** Panel ordering: the open note first, then alphabetical (pure, story 14.2). */
export function orderNotes(byNote: Record<string, string[]>, selected: string | null): string[] {
  return Object.keys(byNote).sort((a, b) =>
    a === selected ? -1 : b === selected ? 1 : a.localeCompare(b),
  )
}

/** Total broken links across the vault — the badge count (pure, story 14.2). */
export function brokenLinkCount(byNote: Record<string, string[]>): number {
  return Object.values(byNote).reduce((n, links) => n + links.length, 0)
}

export const useDiagnostics = create<DiagnosticsState>((set) => ({
  open: false,
  byNote: {},

  report(note, link) {
    set((s) => {
      const existing = s.byNote[note] ?? []
      if (existing.includes(link)) return s
      return { byNote: { ...s.byNote, [note]: [...existing, link] } }
    })
  },

  clearNote(note) {
    set((s) => {
      if (!(note in s.byNote)) return s
      const byNote = { ...s.byNote }
      delete byNote[note]
      return { byNote }
    })
  },

  clear() {
    set({ byNote: {}, open: false })
  },

  setOpen(open) {
    set({ open })
  },
}))
