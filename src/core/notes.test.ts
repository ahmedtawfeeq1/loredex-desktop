/**
 * Story 16.4 pure units: body splice preserves the frontmatter block
 * byte-for-byte (agents own frontmatter — no YAML round-trip, ever), and the
 * comment-note → margin-rail view parsing follows the compose contract while
 * degrading gracefully on agent-authored shapes.
 */
import { describe, expect, it } from 'vitest'
import { commentProse, commentView, spliceBody } from './notes'

describe('spliceBody — frontmatter preserved byte-for-byte (AC1)', () => {
  it('keeps an oddly-formatted frontmatter block verbatim (quoting, comments, order)', () => {
    const fm = [
      '---',
      "date: '2026-07-10' # quoted on purpose",
      'tags:',
      '  - api',
      'weird:   spacing',
      '---',
      '',
    ].join('\n')
    const raw = `${fm}# Old\n\nbody\n`
    const out = spliceBody(raw, '# New\n\nedited body\n')
    // the exact frontmatter block (through the closing --- line) is untouched
    expect(out).toBe(`${raw.slice(0, raw.indexOf('# Old'))}# New\n\nedited body\n`)
  })

  it('an unedited body round-trips to the byte-identical file', () => {
    const raw = "---\na: 1\nb: 'two'\n---\n\n# Title\n\ntext\n"
    const body = '\n# Title\n\ntext\n' // what gray-matter .content yields
    expect(spliceBody(raw, body)).toBe(raw)
  })

  it('files without frontmatter are replaced wholesale', () => {
    expect(spliceBody('# Just markdown\n', '# Edited\n')).toBe('# Edited\n')
  })

  it('a --- thematic break inside the body is not mistaken for frontmatter', () => {
    const raw = '# No fm\n\n---\n\nafter the break\n'
    expect(spliceBody(raw, 'new\n')).toBe('new\n')
  })
})

describe('commentView — the anchored-comment contract (AC3/AC4)', () => {
  const meta = {
    type: 'comment',
    replies_to: 'streaming-api',
    anchor: 'the SSE contract',
    author: 'Dana Reyes <dana@nimbus.dev>',
    created: '2026-07-10T10:00:00.000Z',
    date: '2026-07-10',
  }
  const body = [
    '# Comment on streaming-api',
    '',
    'On [[streaming-api]]:',
    '',
    '> the SSE contract',
    '',
    'Is this still v2? The mobile team saw v1 headers.',
    '',
    '— Dana Reyes <dana@nimbus.dev>',
  ].join('\n')

  it('parses the compose contract: author, created, anchor, prose only', () => {
    const view = commentView(meta, body, 'streaming-api')
    expect(view).toEqual({
      author: 'Dana Reyes <dana@nimbus.dev>',
      at: '2026-07-10T10:00:00.000Z',
      anchor: 'the SSE contract',
      body: 'Is this still v2? The mobile team saw v1 headers.',
    })
  })

  it('returns null for other parents, non-comments, and non-anchored comments', () => {
    expect(commentView(meta, body, 'another-note')).toBeNull()
    expect(commentView({ ...meta, type: 'note' }, body, 'streaming-api')).toBeNull()
    // non-anchored = the thread rail's (story 8.2) — never duplicated here
    expect(commentView({ ...meta, anchor: undefined }, body, 'streaming-api')).toBeNull()
  })

  it('degrades on agent-authored shapes: attribution line as author, date as time', () => {
    const view = commentView(
      { type: 'comment', replies_to: 'n', anchor: 'x', date: '2026-07-09' },
      'plain words\n\n— Robo Agent <robo@nimbus.dev>\n',
      'n',
    )
    expect(view).toEqual({
      author: 'Robo Agent <robo@nimbus.dev>',
      at: '2026-07-09',
      anchor: 'x',
      body: 'plain words',
    })
  })

  it('commentProse keeps mid-body structure and falls back to the raw body', () => {
    expect(commentProse('# H\n\nOn [[p]]:\n\n> q\n\nline one\n\n> a real quote\n\nline two\n')).toBe(
      'line one\n\n> a real quote\n\nline two',
    )
    expect(commentProse('# only-a-heading\n')).toBe('# only-a-heading')
  })
})
