/** Defect 14.2-4: diagnostics panel — badge count, ordering, dedupe (pure). */
import { describe, expect, it } from 'vitest'
import { brokenLinkCount, orderNotes, useDiagnostics } from './diagnostics'

describe('brokenLinkCount', () => {
  it('totals every broken link across notes — the badge number', () => {
    expect(brokenLinkCount({})).toBe(0)
    expect(brokenLinkCount({ 'a.md': ['x', 'y'], 'b.md': ['z'] })).toBe(3)
  })
})

describe('orderNotes', () => {
  it('puts the open note first, the rest alphabetical', () => {
    const byNote = { 'z.md': ['a'], 'm.md': ['b'], 'a.md': ['c'] }
    expect(orderNotes(byNote, 'm.md')).toEqual(['m.md', 'a.md', 'z.md'])
    expect(orderNotes(byNote, null)).toEqual(['a.md', 'm.md', 'z.md'])
  })
})

describe('useDiagnostics store', () => {
  it('reports each source note + raw target once, never duplicating', () => {
    const s = useDiagnostics.getState()
    s.clear()
    s.report('projects/x/note.md', 'Missing Note')
    s.report('projects/x/note.md', 'Missing Note') // re-render feeds again
    s.report('projects/x/note.md', 'Other Gone')
    expect(useDiagnostics.getState().byNote['projects/x/note.md']).toEqual([
      'Missing Note',
      'Other Gone',
    ])
    expect(brokenLinkCount(useDiagnostics.getState().byNote)).toBe(2)
    useDiagnostics.getState().clear()
  })
})
