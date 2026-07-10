/**
 * Story 2.4 core tests: facet filtering matrix, mtime memoization
 * invalidation, vocabulary aggregation, and the 1,000-note perf gate.
 * All lib access rides the engine facade (sole 'loredex' import site).
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { SearchHit } from '../shared/ipc-contract'
import * as engine from './engine'
import { aggregateFacetValues, clearFacetCache, filterHits, memoizedMeta } from './facets'
import { listMarkdownFiles } from './tree'

const loadMeta = engine.noteMeta

const tmp: string[] = []
afterAll(() => {
  for (const dir of tmp) rmSync(dir, { recursive: true, force: true })
})

function tempVault(): string {
  const dir = mkdtempSync(join(tmpdir(), 'loredex-facets-'))
  tmp.push(dir)
  return dir
}

function note(vault: string, rel: string, meta: Record<string, string>, body: string): string {
  const abs = join(vault, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  const fm = Object.entries(meta)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  writeFileSync(abs, `---\n${fm}\n---\n\n${body}\n`)
  return abs
}

const hit = (over: Partial<SearchHit>): SearchHit => ({
  name: 'n',
  project: 'api',
  topic: 'auth',
  date: '2026-07-01',
  status: 'active',
  kind: 'note',
  excerpt: '',
  path: '/nowhere.md',
  score: 1,
  ...over,
})

// perf vault built up-front so the engine (config resolves exactly once per
// process) can point at it; the other suites never touch engine.search.
let perfVault: string
beforeAll(() => {
  perfVault = tempVault()
  const topics = ['auth', 'layout', 'billing', 'infra']
  for (let i = 0; i < 1000; i++) {
    note(
      perfVault,
      `projects/proj${i % 8}/2026-07-0${(i % 9) + 1} - note-${i}.md`,
      {
        topic: topics[i % 4] ?? 'auth',
        type: i % 5 === 0 ? 'handoff' : 'research',
        status: i % 7 === 0 ? 'stale' : 'active',
      },
      `Note ${i} discusses rate limiting and retry budgets for tier ${i % 3}.`,
    )
  }
  engine.initEngine(perfVault)
})

beforeEach(() => clearFacetCache())

describe('facet filtering matrix', () => {
  const hits = [
    hit({ name: 'a', project: 'api', topic: 'auth', status: 'active' }),
    hit({ name: 'b', project: 'web', topic: 'auth', status: 'stale' }),
    hit({ name: 'c', project: 'web', topic: 'layout', status: 'active' }),
  ]
  const noMeta = (): Record<string, unknown> => ({})

  it('no facets (or empty facet values) pass everything through', () => {
    expect(filterHits(hits, undefined, noMeta)).toHaveLength(3)
    expect(filterHits(hits, {}, noMeta)).toHaveLength(3)
    expect(filterHits(hits, { project: '' as string }, noMeta)).toHaveLength(3)
  })

  it('single facet narrows', () => {
    expect(filterHits(hits, { project: 'web' }, noMeta).map((h) => h.name)).toEqual(['b', 'c'])
    expect(filterHits(hits, { topic: 'auth' }, noMeta).map((h) => h.name)).toEqual(['a', 'b'])
    expect(filterHits(hits, { status: 'stale' }, noMeta).map((h) => h.name)).toEqual(['b'])
  })

  it('combined facets AND together', () => {
    expect(filterHits(hits, { project: 'web', topic: 'auth' }, noMeta).map((h) => h.name)).toEqual([
      'b',
    ])
    expect(
      filterHits(hits, { project: 'web', status: 'active' }, noMeta).map((h) => h.name),
    ).toEqual(['c'])
  })

  it('no-match yields empty', () => {
    expect(filterHits(hits, { project: 'nope' }, noMeta)).toHaveLength(0)
    expect(filterHits(hits, { project: 'api', status: 'stale' }, noMeta)).toHaveLength(0)
  })

  it('type/from/to facets read frontmatter', () => {
    const vault = tempVault()
    const handoff = note(
      vault,
      'projects/web/handoffs/h.md',
      { type: 'handoff', from: 'api', to: 'web' },
      'handoff body',
    )
    const plain = note(vault, 'projects/web/notes.md', { type: 'research' }, 'note body')
    const pair = [hit({ name: 'h', path: handoff }), hit({ name: 'p', path: plain })]
    expect(filterHits(pair, { type: 'handoff' }, loadMeta).map((h) => h.name)).toEqual(['h'])
    expect(filterHits(pair, { from: 'api', to: 'web' }, loadMeta).map((h) => h.name)).toEqual(['h'])
    expect(filterHits(pair, { to: 'mobile' }, loadMeta)).toHaveLength(0)
  })
})

describe('epic22 operators: tag + date narrowing', () => {
  it('tag: reads frontmatter tags (list or scalar), case-insensitively', () => {
    const vault = tempVault()
    const listed = note(vault, 'projects/api/a.md', { tags: '[auth, retry]' }, 'x')
    const scalar = note(vault, 'projects/api/b.md', { tags: 'billing infra' }, 'x')
    const none = note(vault, 'projects/api/c.md', { type: 'note' }, 'x')
    const hits = [
      hit({ name: 'a', path: listed }),
      hit({ name: 'b', path: scalar }),
      hit({ name: 'c', path: none }),
    ]
    expect(filterHits(hits, { tag: 'auth' }, loadMeta).map((h) => h.name)).toEqual(['a'])
    expect(filterHits(hits, { tag: 'RETRY' }, loadMeta).map((h) => h.name)).toEqual(['a'])
    expect(filterHits(hits, { tag: 'infra' }, loadMeta).map((h) => h.name)).toEqual(['b'])
    expect(filterHits(hits, { tag: 'missing' }, loadMeta)).toHaveLength(0)
  })

  it('before:/after:/on: compare the hit date; undated notes drop under any bound', () => {
    const noMeta = (): Record<string, unknown> => ({})
    const hits = [
      hit({ name: 'jun', date: '2026-06-15' }),
      hit({ name: 'jul01', date: '2026-07-01' }),
      hit({ name: 'jul09', date: '2026-07-09' }),
      hit({ name: 'undated', date: '' }),
    ]
    expect(filterHits(hits, { before: '2026-07-01' }, noMeta).map((h) => h.name)).toEqual(['jun'])
    expect(filterHits(hits, { after: '2026-07-01' }, noMeta).map((h) => h.name)).toEqual(['jul09'])
    expect(filterHits(hits, { on: '2026-07-01' }, noMeta).map((h) => h.name)).toEqual(['jul01'])
    // a date range ANDs before + after
    expect(
      filterHits(hits, { after: '2026-06-30', before: '2026-07-09' }, noMeta).map((h) => h.name),
    ).toEqual(['jul01'])
    // every date bound excludes the undated note
    expect(filterHits(hits, { on: '' as string }, noMeta)).toHaveLength(4)
  })
})

describe('memoization', () => {
  it('parses once per mtime and invalidates when the file changes', () => {
    const vault = tempVault()
    const abs = note(vault, 'projects/api/a.md', { type: 'research' }, 'body')
    let parses = 0
    const counting = (p: string): Record<string, unknown> => {
      parses++
      return loadMeta(p)
    }
    expect(memoizedMeta(abs, counting)['type']).toBe('research')
    expect(memoizedMeta(abs, counting)['type']).toBe('research')
    expect(parses).toBe(1)
    // rewrite with a different mtime → reparse
    writeFileSync(abs, '---\ntype: handoff\n---\n\nbody\n')
    const future = Date.now() / 1000 + 5
    utimesSync(abs, future, future)
    expect(memoizedMeta(abs, counting)['type']).toBe('handoff')
    expect(parses).toBe(2)
  })

  it('unreadable paths memoize as empty meta without throwing', () => {
    expect(memoizedMeta('/does/not/exist.md', loadMeta)).toEqual({})
  })
})

describe('facet vocabulary aggregation', () => {
  it('collects projects from the tree and topic/type/status/from/to from frontmatter', () => {
    const vault = tempVault()
    note(
      vault,
      'projects/api/2026 - auth.md',
      { topic: 'auth', type: 'research', status: 'active' },
      'x',
    )
    note(
      vault,
      'projects/web/handoffs/h.md',
      { type: 'handoff', status: 'open', from: 'api', to: 'mobile' },
      'x',
    )
    const values = aggregateFacetValues(vault, listMarkdownFiles(vault), loadMeta)
    expect(values.projects).toEqual(['api', 'mobile', 'web']) // from/to feed projects too
    expect(values.topics).toEqual(['auth'])
    expect(values.types).toEqual(['handoff', 'research'])
    expect(values.statuses).toEqual(['active', 'open'])
  })
})

describe('performance (AC4)', () => {
  it('faceted search over a 1,000-note vault returns within 500 ms', () => {
    const t0 = performance.now()
    const hits = engine.search('rate limiting', 50)
    // the lib ranks handoffs above raw notes, so the top hits are handoffs;
    // topics cycle independently → the facet strictly narrows
    const narrowed = filterHits(hits, { type: 'handoff', topic: 'auth' }, loadMeta)
    const elapsed = performance.now() - t0
    expect(hits.length).toBeGreaterThan(0)
    expect(narrowed.length).toBeGreaterThan(0)
    expect(narrowed.length).toBeLessThan(hits.length)
    expect(elapsed).toBeLessThan(500)
    console.log(`[perf] 1000-note faceted search: ${elapsed.toFixed(1)} ms`)
  })
})
