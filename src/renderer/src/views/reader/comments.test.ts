/**
 * Story 16.4 (AC4 + DoD): anchor orphaning — the exact quoted text no longer
 * found in the note demotes the comment to the rust-chip list at note end.
 */
import { describe, expect, it } from 'vitest'
import type { NoteComment } from '../../../../shared/types'
import { anchorPreview, byAnchorPosition, relativeTime, splitComments } from './comments'

const comment = (anchor: string, at = '2026-07-10T10:00:00Z'): NoteComment => ({
  path: `projects/p/t/c-${anchor}.md`,
  author: 'Dana Reyes <dana@nimbus.dev>',
  at,
  anchor,
  body: 'why?',
})

describe('splitComments — anchor orphaning (DoD)', () => {
  it('anchors found in the rendered text stay anchored; missing quotes orphan', () => {
    const { anchored, orphaned } = splitComments(
      [comment('the SSE contract'), comment('a deleted sentence')],
      ['We confirmed the SSE contract with mobile.'],
    )
    expect(anchored.map((c) => c.anchor)).toEqual(['the SSE contract'])
    expect(orphaned.map((c) => c.anchor)).toEqual(['a deleted sentence'])
  })

  it('the markdown source is a fallback haystack (agent-quoted **source**)', () => {
    const { anchored, orphaned } = splitComments(
      [comment('**bold** source')],
      ['bold source rendered', 'raw **bold** source body'],
    )
    expect(anchored).toHaveLength(1)
    expect(orphaned).toHaveLength(0)
  })

  it('editing the anchored text away orphans the comment (edit → orphan flow)', () => {
    const before = splitComments([comment('keep me')], ['please keep me here'])
    expect(before.orphaned).toHaveLength(0)
    const after = splitComments([comment('keep me')], ['that text is gone now'])
    expect(after.orphaned).toHaveLength(1)
  })
})

describe('rail order + labels', () => {
  it('sorts by first anchor occurrence, unfound anchors last', () => {
    const text = 'alpha … beta … gamma'
    const sorted = byAnchorPosition([comment('gamma'), comment('missing'), comment('alpha')], text)
    expect(sorted.map((c) => c.anchor)).toEqual(['alpha', 'gamma', 'missing'])
  })

  it('relativeTime buckets minutes/hours/days and falls back to the date', () => {
    const now = Date.parse('2026-07-10T12:00:00Z')
    expect(relativeTime('2026-07-10T11:59:40Z', now)).toBe('just now')
    expect(relativeTime('2026-07-10T11:15:00Z', now)).toBe('45m ago')
    expect(relativeTime('2026-07-10T06:00:00Z', now)).toBe('6h ago')
    expect(relativeTime('2026-07-07T06:00:00Z', now)).toBe('3d ago')
    expect(relativeTime('2026-05-01T06:00:00Z', now)).toBe('2026-05-01')
    expect(relativeTime('not-a-date', now)).toBe('not-a-date')
  })

  it('anchorPreview flattens whitespace and truncates with an ellipsis', () => {
    expect(anchorPreview('two  lines\nof text')).toBe('two lines of text')
    expect(anchorPreview('x'.repeat(120)).endsWith('…')).toBe(true)
    expect(anchorPreview('x'.repeat(120))).toHaveLength(90)
  })
})
