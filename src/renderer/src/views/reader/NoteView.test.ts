/**
 * Story 2.1: frontmatter metadata panel handles the value types loredex
 * frontmatter carries (strings, arrays, dates); 1 MB notes go through the
 * pipeline without pathological cost.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Doc } from '../../../../shared/ipc-contract'
import { renderMarkdown } from '../../markdown/pipeline'
import { formatValue, FrontmatterPanel, NoteArticle } from './NoteView'

function renderNote(selected: string, body: string, meta: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(NoteArticle, { selected, doc: { meta, body } as Doc, readingOrder: [] }),
  )
}

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

describe('Addendum D1 regressions (story 16.1)', () => {
  it('index/MOC pages never render their H1 twice — duplicate leading H1 is stripped', () => {
    const out = renderNote('_index/nimbus-backend.md', '# nimbus-backend\n\n## streaming\n\ntext\n')
    expect(out.match(/<h1/g)).toHaveLength(1)
    expect(out).toContain('streaming')
  })

  it('a different leading H1 is curated wording and stays', () => {
    const out = renderNote('_index/Home.md', '# Start Here — Nimbus\n\ntext\n')
    expect(out.match(/<h1/g)).toHaveLength(2)
  })

  it('an empty Reading order section renders the rust diagnostic line, never silence (2026-07-10 vault defect)', () => {
    // verbatim shape of projects/nimbus-backend/handoffs/2026-07-10-handoff-nimbus-frontend.md
    const body = [
      '# Handoff — nimbus-frontend → nimbus-backend',
      '',
      '**Objective:** Status panel delivered — SSE contract confirmed',
      '',
      '## Reading order',
      '',
      '',
      '---',
      '_Consume with:_ `loredex handoffs --consume <this note>`',
    ].join('\n')
    const out = renderNote('projects/nimbus-backend/handoffs/2026-07-10-handoff-nimbus-frontend.md', body)
    expect(out).toContain('ro-empty')
    expect(out).toContain('Link Diagnostics')
  })

  it('a populated Reading order section renders no empty-state', () => {
    const body = '# Handoff — a → b\n\n## Reading order\n\n1. [[2026-07-09-streaming-api]]\n'
    const out = renderNote('projects/b/handoffs/2026-07-10-handoff-a.md', body)
    expect(out).not.toContain('ro-empty')
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
