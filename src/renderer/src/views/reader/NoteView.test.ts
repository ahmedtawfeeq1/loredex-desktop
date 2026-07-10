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
import { NoteEditor } from './NoteEditor'
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

describe('Addendum D1: edit mode + inline comments (story 16.4)', () => {
  const editorProps = {
    selected: 'projects/p/t/n.md',
    doc: { meta: { project: 'p' }, body: 'original body' } as Doc,
    draft: 'draft body',
    unsaved: false,
    busy: false,
    error: null,
    identity: { name: 'Dana Reyes', email: 'dana@nimbus.dev' },
  }

  it('Read mode renders the mode toggle with Read pressed and an Edit (\u2318E) affordance', () => {
    const out = renderNote('projects/p/t/n.md', 'text\n')
    expect(out).toContain('note-mode')
    expect(out).toMatch(/aria-pressed="true"[^>]*>Read<\/button>/)
    expect(out).toContain('>Edit</button>')
    expect(out).not.toContain('unsaved-dot')
  })

  it('a kept draft shows the unsaved dot on the Read-mode toggle too', () => {
    const out = renderToStaticMarkup(
      createElement(NoteArticle, {
        selected: 'n.md',
        doc: { meta: {}, body: 'text' } as Doc,
        readingOrder: [],
        unsaved: true,
      }),
    )
    expect(out).toContain('unsaved-dot')
  })

  it('editor v2 (story 16.7): CodeMirror host + full D1-amendment-2 toolbar + LOCKED frontmatter', () => {
    const out = renderToStaticMarkup(createElement(NoteEditor, editorProps))
    expect(out).toContain('note-editor-cm') // CodeMirror mounts into this host at effect time
    expect(out).toContain('editor-toolbar')
    // headings dropdown H1\u2013H4
    expect(out).toContain('tb-heading')
    for (const level of ['H1', 'H2', 'H3', 'H4']) expect(out, level).toContain(`>${level}</option>`)
    // every specced action present, tooltips carrying the in-editor shortcuts
    for (const hint of [
      'Bold \u2014 \u2318B',
      'Italic \u2014 \u2318I',
      'Strikethrough',
      'Inline code',
      'Code block',
      'Wikilink',
      'Link \u2014 \u2318K',
      'Quote',
      'Bullet list',
      'Numbered list',
      'Task list',
      'Table',
      'Horizontal rule',
      'Undo \u2014 \u2318Z',
      'Redo \u2014 \u21e7\u2318Z',
    ]) {
      expect(out, hint).toContain(hint)
    }
    // the scoped editor-v2 stylesheet rides theme tokens (both themes flip via vars)
    expect(out).toContain('var(--hairline)')
    expect(out).toContain('fm-locked-label')
    expect(out).toContain('project') // the locked panel still shows frontmatter
    expect(out).not.toContain('unsaved-dot') // clean draft — no dot
  })

  it('an edited draft shows the unsaved dot and arms Save', () => {
    const out = renderToStaticMarkup(createElement(NoteEditor, { ...editorProps, unsaved: true }))
    expect(out).toContain('unsaved-dot')
    expect(out).not.toMatch(/<button[^>]*class="button-primary"[^>]*disabled/)
  })

  it('anchored comments render in the margin rail; missing anchors orphan with the rust chip', () => {
    const comments = [
      { path: 'c1.md', author: 'Dana Reyes <d@n.dev>', at: '2026-07-10', anchor: 'still here', body: 'ok' },
      { path: 'c2.md', author: 'Omar Farouk <o@n.dev>', at: '2026-07-10', anchor: 'gone text', body: 'hm' },
    ]
    const out = renderToStaticMarkup(
      createElement(NoteArticle, {
        selected: 'projects/p/t/n.md',
        doc: { meta: {}, body: 'the words still here remain\n' } as Doc,
        readingOrder: [],
        comments,
      }),
    )
    expect(out).toContain('comment-rail')
    expect(out).toContain('Dana Reyes')
    expect(out).toContain('orphan-chip')
    expect(out).toContain('Omar Farouk')
    // the orphaned card sits at note end, inside the article
    expect(out.indexOf('orphaned-comments')).toBeLessThan(out.indexOf('comment-rail'))
  })

  it('the margin composer opens on a composer anchor even with zero comments', () => {
    const out = renderToStaticMarkup(
      createElement(NoteArticle, {
        selected: 'n.md',
        doc: { meta: {}, body: 'text' } as Doc,
        readingOrder: [],
        composerAnchor: 'the exact selected text',
      }),
    )
    expect(out).toContain('comment-composer')
    expect(out).toContain('the exact selected text')
  })
})
