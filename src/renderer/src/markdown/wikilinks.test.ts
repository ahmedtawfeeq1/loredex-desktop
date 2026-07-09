/**
 * Story 2.2 (renderer): the remark plugin parses [[x]] and [[x|alias]] into
 * wikilink anchors carrying the raw target; resolved/broken styles apply from
 * seeded resolutions (cache is readable synchronously).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './pipeline'
import { seedResolution } from './resolveCache'

const html = (md: string): string => renderToStaticMarkup(renderMarkdown(md))

describe('remarkWikilinks plugin through the sanctioned pipeline', () => {
  it('parses [[target]] into a wikilink anchor carrying the raw target', () => {
    const out = html('see [[rate limiting research]] for context')
    expect(out).toContain('data-wikilink="rate limiting research"')
    expect(out).toContain('class="wikilink"')
    expect(out).toContain('>rate limiting research</a>')
    expect(out).toContain('see ')
    expect(out).toContain(' for context')
  })

  it('parses [[target|alias]] showing the alias, keeping the full raw target', () => {
    const out = html('read [[projects/nimbus-api/notes|the api notes]] first')
    expect(out).toContain('data-wikilink="projects/nimbus-api/notes|the api notes"')
    expect(out).toContain('>the api notes</a>')
    expect(out).not.toContain('>projects/nimbus-api/notes<')
  })

  it('handles multiple wikilinks per line and leaves normal links alone', () => {
    const out = html('[[a]] then [[b]] and [ext](https://example.com)')
    expect(out.match(/data-wikilink/g)).toHaveLength(2)
    expect(out).toContain('href="https://example.com"')
  })

  it('applies the broken diagnostic style from a broken resolution', () => {
    seedResolution('ghost-note', '', { status: 'broken' })
    const out = html('dangling [[ghost-note]]')
    expect(out).toContain('wikilink-broken')
    expect(out).toContain('never auto-created')
  })

  it('renders resolved links without the broken style', () => {
    seedResolution('real-note', '', { status: 'resolved', target: 'real-note.md' })
    expect(html('[[real-note]]')).not.toContain('wikilink-broken')
  })
})
