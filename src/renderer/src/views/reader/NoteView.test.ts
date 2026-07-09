/**
 * Story 2.1: frontmatter metadata panel handles the value types loredex
 * frontmatter carries (strings, arrays, dates); 1 MB notes go through the
 * pipeline without pathological cost.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../markdown/pipeline'
import { formatValue, FrontmatterPanel } from './NoteView'

describe('frontmatter metadata panel', () => {
  it('formats strings, arrays, dates and objects', () => {
    expect(formatValue('active')).toBe('active')
    expect(formatValue(['api', 'throttling'])).toBe('api, throttling')
    expect(formatValue(new Date('2026-07-02T00:00:00Z'))).toBe('2026-07-02')
    expect(formatValue({ a: 1 })).toBe('{"a":1}')
  })

  it('renders key/value rows and skips null/undefined; empty meta renders nothing', () => {
    const out = renderToStaticMarkup(
      createElement(FrontmatterPanel, {
        meta: { project: 'nimbus-api', tags: ['api'], superseded_by: undefined },
      }),
    )
    expect(out).toContain('project')
    expect(out).toContain('nimbus-api')
    expect(out).toContain('api')
    expect(out).not.toContain('superseded_by')
    expect(renderToStaticMarkup(createElement(FrontmatterPanel, { meta: {} }))).toBe('')
  })
})

describe('1 MB note perf (AC4)', () => {
  it('renders a generated 1 MB markdown note through the pipeline', () => {
    const paragraph = `Lore entry ${'x'.repeat(80)} with [a link](https://example.com) and \`code\`.\n\n`
    const big = `# Big note\n\n${paragraph.repeat(Math.ceil(1_048_576 / paragraph.length))}`
    expect(big.length).toBeGreaterThan(1_048_576)
    const started = performance.now()
    const out = renderToStaticMarkup(renderMarkdown(big))
    const elapsed = performance.now() - started
    expect(out).toContain('Big note')
    // budget: parse+sanitize+render server-side well under the UI freeze bar
    expect(elapsed).toBeLessThan(5_000)
  })
})
