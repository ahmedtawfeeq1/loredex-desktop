/**
 * Addendum D1 (story 16.1): a Reading order section never renders an empty
 * list — empty sections are detected (readingOrderEmptied) and unresolved
 * names render as plain rust text wired to Link Diagnostics.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearLinkCaches, seedResolution } from '../../markdown/resolveCache'
import { useDiagnostics } from '../../stores/diagnostics'
import { ReadingOrderInline, readingOrderEmptied } from './ReadingOrderInline'

describe('readingOrderEmptied', () => {
  it('detects the 2026-07-10 writer defect: heading with zero wikilinks', () => {
    const born_empty =
      '# Handoff — a → b\n\n## Reading order\n\n\n---\n_Consume with:_ `loredex handoffs`\n'
    expect(readingOrderEmptied(born_empty)).toBe(true)
  })

  it('is false when the section lists notes, when they sit before a next section, or without the heading', () => {
    expect(readingOrderEmptied('## Reading order\n\n1. [[a-note]]\n')).toBe(false)
    expect(
      readingOrderEmptied('## Reading order\n\n1. [[a]]\n\n## Next actions\n\n- build now\n'),
    ).toBe(false)
    expect(readingOrderEmptied('# Just a note\n\nno reading order at all')).toBe(false)
  })

  it('is true when the only wikilinks live in a LATER section', () => {
    expect(readingOrderEmptied('## Reading order\n\n## See also\n\n[[elsewhere]]\n')).toBe(true)
  })
})

describe('unresolved reading-order names (rust plain text, wired to diagnostics)', () => {
  beforeEach(() => {
    clearLinkCaches()
    useDiagnostics.getState().clear()
  })

  it('renders a broken name as ro-unresolved plain text, not a mute details section', () => {
    seedResolution('ghost-note', 'projects/x/handoffs/h.md', { status: 'broken' })
    const out = renderToStaticMarkup(
      createElement(ReadingOrderInline, {
        targets: ['ghost-note'],
        from: 'projects/x/handoffs/h.md',
      }),
    )
    expect(out).toContain('ro-unresolved')
    expect(out).toContain('ghost-note')
    expect(out).toContain('not found in this vault')
    expect(out).not.toContain('<details')
  })

  it('resolved names keep the expandable inline section', () => {
    seedResolution('real-note', 'projects/x/handoffs/h.md', {
      status: 'resolved',
      target: 'projects/x/notes/real-note.md',
    })
    const out = renderToStaticMarkup(
      createElement(ReadingOrderInline, {
        targets: ['real-note'],
        from: 'projects/x/handoffs/h.md',
      }),
    )
    expect(out).toContain('<details')
    expect(out).not.toContain('ro-unresolved')
  })

  it('renders nothing at all only when there are no targets (the body owns the empty-state)', () => {
    const out = renderToStaticMarkup(
      createElement(ReadingOrderInline, { targets: [], from: 'projects/x/handoffs/h.md' }),
    )
    expect(out).toBe('')
  })
})
