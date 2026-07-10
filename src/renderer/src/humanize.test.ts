/**
 * Story 17.1 (DESIGN.md "D1 amendment 3 — Humanized note titles"): the pure
 * humanizeTitle/noteDate contract, plus a drift guard — every surface the
 * amendment names is pinned (grep-level) to THIS module, and the date-metadata
 * styles are pinned to mono `--text-2` in the stylesheet.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { humanizeTitle, noteDate } from './humanize'

describe('humanizeTitle (D1a3 rules, verbatim)', () => {
  it('strips the leading YYYY-MM-DD-, dashes → spaces, Title Case', () => {
    expect(humanizeTitle('2026-07-05-error-handling-strategy')).toBe('Error Handling Strategy')
    expect(humanizeTitle('2026-07-09-streaming-api')).toBe('Streaming Api')
  })

  it('lowercases the spec small-word list mid-title', () => {
    expect(humanizeTitle('state-of-the-art-review')).toBe('State of the Art Review')
    expect(humanizeTitle('notes-on-caching-for-a-cdn')).toBe('Notes on Caching for a Cdn')
    expect(humanizeTitle('2026-07-01-guide-to-auth-and-tokens-in-prod')).toBe(
      'Guide to Auth and Tokens in Prod',
    )
    expect(humanizeTitle('plan-an-api-or-an-sdk-of-the-week')).toBe(
      'Plan an Api or an Sdk of the Week',
    )
  })

  it('always capitalizes the first word, even a small word', () => {
    expect(humanizeTitle('the-plan')).toBe('The Plan')
    expect(humanizeTitle('2026-07-08-on-call-rotation')).toBe('On Call Rotation')
    expect(humanizeTitle('a-note')).toBe('A Note')
  })

  it('handles no-date names', () => {
    expect(humanizeTitle('meeting-notes')).toBe('Meeting Notes')
    expect(humanizeTitle('readme')).toBe('Readme')
  })

  it('collapses consecutive dashes to one space', () => {
    expect(humanizeTitle('notes--api---v2')).toBe('Notes Api V2')
    expect(humanizeTitle('2026-07-05--double-dash')).toBe('Double Dash')
  })

  it('preserves mid-word casing (API/OAuth style names survive)', () => {
    expect(humanizeTitle('OAuth-flow-for-API-keys')).toBe('OAuth Flow for API Keys')
  })

  it('strips .md and any path prefix — callers pass whatever they hold', () => {
    expect(humanizeTitle('2026-07-05-error-handling.md')).toBe('Error Handling')
    expect(humanizeTitle('projects/nimbus-backend/streaming/2026-07-05-sse-fallback.md')).toBe(
      'Sse Fallback',
    )
  })

  it('a name that IS a bare date stays literal', () => {
    expect(humanizeTitle('2026-07-09')).toBe('2026-07-09')
    expect(humanizeTitle('2026-07-09.md')).toBe('2026-07-09')
  })
})

describe('noteDate (date extraction helper)', () => {
  it('extracts the leading filed date', () => {
    expect(noteDate('2026-07-05-error-handling')).toBe('2026-07-05')
    expect(noteDate('projects/p/t/2026-07-09-streaming-api.md')).toBe('2026-07-09')
  })

  it('returns null when there is no leading date', () => {
    expect(noteDate('meeting-notes')).toBeNull()
    expect(noteDate('error-2026-07-05-handling')).toBeNull() // not leading
    expect(noteDate('2026-07-notes')).toBeNull() // partial date
    expect(noteDate('2026-07-09')).toBeNull() // bare date: nothing was stripped
  })
})

describe('real-vault scale (~25 topics in one project, the user pain)', () => {
  // synthesized to the shape of the user's real vault: one project, ~25
  // topics, dated machine names everywhere — every row must read as a title
  const topics = [
    'auth-token-rotation', 'sse-streaming-fallback', 'rate-limit-tiers',
    'openapi-drift', 'billing-webhooks', 'tenant-isolation', 'queue-backpressure',
    'schema-migrations', 'gh-actions-cache', 'error-taxonomy', 'sdk-versioning',
    'pagination-cursors', 'audit-log-retention', 'metrics-cardinality',
    'oncall-runbooks', 'feature-flags', 'cache-invalidation', 'search-indexing',
    'api-deprecations', 'load-shedding', 'session-affinity', 'export-pipelines',
    'pii-redaction', 'sandbox-environments', 'incident-postmortems',
  ]
  const names = topics.map((t, i) => `2026-06-${String((i % 28) + 1).padStart(2, '0')}-${t}-notes`)

  it('every dated note humanizes: date stripped, no dashes, Title Cased', () => {
    expect(names).toHaveLength(25)
    for (const name of names) {
      const title = humanizeTitle(name)
      expect(title, name).not.toMatch(/\d{4}-\d{2}-\d{2}/)
      expect(title, name).not.toContain('-')
      expect(title[0], name).toMatch(/[A-Z]/)
      expect(title, name).toMatch(/ Notes$/)
      expect(noteDate(name), name).toMatch(/^2026-06-\d{2}$/)
    }
  })

  it('is pure and stable — same input, same output', () => {
    for (const name of names) expect(humanizeTitle(name)).toBe(humanizeTitle(name))
  })
})

describe('every D1a3 surface uses the ONE util (no per-view drift)', () => {
  const src = (rel: string): string => readFileSync(join(import.meta.dirname, rel), 'utf8')
  const surfaces: Array<[string, string[]]> = [
    // [file, required references]
    ['views/reader/NoteView.tsx', ['humanizeTitle(', 'noteDate(', 'note-date']],
    ['views/reader/VaultTree.tsx', ['humanizeTitle(', 'noteDate(', 'tree-file-date']],
    ['views/search/SearchView.tsx', ['humanizeTitle(']],
    ['views/search/Palette.tsx', ['humanizeTitle(']],
    ['views/atlas/AtlasNodeCard.tsx', ['humanizeTitle(', 'noteDate(']],
    ['views/handoffs/ReadingOrderInline.tsx', ['humanizeTitle(', 'noteDate(', 'ro-date']],
    ['views/home/HomeView.tsx', ['humanizeTitle(']],
  ]

  it.each(surfaces)('%s imports and applies humanize', (file, needles) => {
    const text = src(file)
    expect(text, `${file} imports the shared util`).toMatch(
      /import \{[^}]*humanizeTitle[^}]*\} from '(\.\.\/)+humanize'/,
    )
    for (const needle of needles) expect(text, `${file} uses ${needle}`).toContain(needle)
  })

  it('the real filename stays in the frontmatter panel + tooltips', () => {
    expect(src('views/reader/NoteView.tsx')).toContain('path={selected}') // frontmatter file row
    expect(src('views/reader/NoteView.tsx')).toContain('title={selected}') // reader h1 tooltip
    expect(src('views/reader/VaultTree.tsx')).toContain('title={node.path}')
    expect(src('views/search/SearchView.tsx')).toContain('title={hit.path}')
    expect(src('views/handoffs/ReadingOrderInline.tsx')).toContain('title={target}')
    expect(src('views/home/HomeView.tsx')).toContain('title={card.name}')
    expect(src('views/atlas/AtlasNodeCard.tsx')).toContain('<title>{node.label}</title>')
  })

  it('date metadata styles are mono --text-2 (stylesheet contract)', () => {
    const css = src('styles.css')
    for (const cls of ['.note-date', '.tree-file-date', '.ro-date']) {
      const start = css.indexOf(`${cls} {`)
      expect(start, `${cls} present`).toBeGreaterThanOrEqual(0)
      const blockText = css.slice(start, css.indexOf('}', start))
      expect(blockText, `${cls} mono`).toContain('font-family: var(--font-mono);')
      expect(blockText, `${cls} quiet`).toContain('color: var(--text-2);')
    }
    // tree rows: humanized name + small right-aligned date ride a flex row
    const tf = css.slice(css.indexOf('.tree-file {'), css.indexOf('}', css.indexOf('.tree-file {')))
    expect(tf).toContain('display: flex;')
  })
})
