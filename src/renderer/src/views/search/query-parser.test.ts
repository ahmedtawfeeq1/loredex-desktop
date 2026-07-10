/**
 * epic22 / D1 amendment 7 §B: the client-side query-operator parser. Each
 * operator, combined operators, date ranges, quoted values, bare terms, the
 * facet↔query round-trip (setOperator), and rank-preserving project grouping.
 */
import { describe, expect, it } from 'vitest'
import type { SearchHit } from '../../../../shared/ipc-contract'
import { splitForHighlight } from './palette-nav'
import {
  activeFilters,
  filtersToFacets,
  groupHitsByProject,
  parseQuery,
  setOperator,
} from './query-parser'

describe('parseQuery — operators', () => {
  it('parses each operator into its filter', () => {
    expect(parseQuery('project:nimbus-backend').filters).toEqual({ project: 'nimbus-backend' })
    expect(parseQuery('topic:auth').filters).toEqual({ topic: 'auth' })
    expect(parseQuery('type:handoff').filters).toEqual({ type: 'handoff' })
    expect(parseQuery('status:open').filters).toEqual({ status: 'open' })
    expect(parseQuery('tag:retry').filters).toEqual({ tag: 'retry' })
    expect(parseQuery('from:api').filters).toEqual({ from: 'api' })
    expect(parseQuery('to:web').filters).toEqual({ to: 'web' })
    expect(parseQuery('before:2026-07-01').filters).toEqual({ before: '2026-07-01' })
    expect(parseQuery('after:2026-06-01').filters).toEqual({ after: '2026-06-01' })
    expect(parseQuery('on:2026-07-09').filters).toEqual({ on: '2026-07-09' })
  })

  it('bare terms stay full-text; no operators → no filters', () => {
    const p = parseQuery('rate limiting retry')
    expect(p.terms).toBe('rate limiting retry')
    expect(p.filters).toEqual({})
  })

  it('combines operators + bare terms, order-independent', () => {
    const p = parseQuery('websocket project:nimbus-backend type:handoff latency')
    expect(p.terms).toBe('websocket latency')
    expect(p.filters).toEqual({ project: 'nimbus-backend', type: 'handoff' })
  })

  it('parses a date range (before + after) alongside terms', () => {
    const p = parseQuery('after:2026-06-30 auth before:2026-07-09')
    expect(p.terms).toBe('auth')
    expect(p.filters).toEqual({ after: '2026-06-30', before: '2026-07-09' })
  })

  it('supports quoted operator values with spaces', () => {
    const p = parseQuery('topic:"rate limiting" websocket')
    expect(p.filters).toEqual({ topic: 'rate limiting' })
    expect(p.terms).toBe('websocket')
  })

  it('last operator wins on repeats', () => {
    expect(parseQuery('project:a project:b').filters).toEqual({ project: 'b' })
  })

  it('is case-insensitive on the operator key', () => {
    expect(parseQuery('Project:nimbus').filters).toEqual({ project: 'nimbus' })
  })

  it('unknown operators fall through as bare terms', () => {
    const p = parseQuery('foo:bar websocket')
    expect(p.filters).toEqual({})
    expect(p.terms).toBe('foo:bar websocket')
  })

  it('empty query parses to nothing', () => {
    expect(parseQuery('')).toEqual({ terms: '', filters: {} })
  })
})

describe('filtersToFacets + activeFilters', () => {
  it('maps defined filters onto the Facets transport', () => {
    expect(filtersToFacets({ project: 'x', tag: 'y', before: '2026-01-01' })).toEqual({
      project: 'x',
      tag: 'y',
      before: '2026-01-01',
    })
  })

  it('lists active filters in operator order', () => {
    expect(activeFilters({ type: 'handoff', project: 'x' })).toEqual([
      ['project', 'x'],
      ['type', 'handoff'],
    ])
  })
})

describe('setOperator — facet↔query round-trip', () => {
  it('adds an operator, leaving bare terms verbatim', () => {
    expect(setOperator('websocket', 'project', 'nimbus-backend')).toBe(
      'websocket project:nimbus-backend',
    )
  })

  it('replaces an existing operator without touching others', () => {
    expect(setOperator('project:a type:handoff foo', 'project', 'b')).toBe(
      'type:handoff foo project:b',
    )
  })

  it('clears an operator with an empty value (chip ×)', () => {
    expect(setOperator('project:a websocket', 'project', '')).toBe('websocket')
  })

  it('quotes a spaced value', () => {
    expect(setOperator('web', 'topic', 'rate limiting')).toBe('web topic:"rate limiting"')
  })

  it('round-trips: parse(setOperator(...)) recovers the filter', () => {
    const q = setOperator(setOperator('note', 'project', 'api'), 'status', 'open')
    expect(parseQuery(q).filters).toEqual({ project: 'api', status: 'open' })
    expect(parseQuery(q).terms).toBe('note')
  })
})

describe('ranking + highlight', () => {
  const hit = (name: string, project: string, score: number): SearchHit => ({
    name,
    project,
    topic: '',
    date: '',
    status: 'active',
    kind: 'note',
    excerpt: '',
    path: `/${project}/${name}.md`,
    score,
  })

  it('groups by project WITHOUT reordering rank (best-hit order, in-group order)', () => {
    const ranked = [
      hit('a', 'web', 9),
      hit('b', 'api', 8),
      hit('c', 'web', 7),
      hit('d', 'api', 6),
    ]
    const groups = groupHitsByProject(ranked)
    expect(groups.map((g) => g.project)).toEqual(['web', 'api']) // web's best hit ranked first
    expect(groups[0]?.hits.map((h) => h.name)).toEqual(['a', 'c'])
    expect(groups[1]?.hits.map((h) => h.name)).toEqual(['b', 'd'])
  })

  it('highlights the parsed bare terms, never the operator tokens', () => {
    const parsed = parseQuery('project:nimbus-backend rate limit')
    const parts = splitForHighlight('the rate limit and project budget', parsed.terms)
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(['rate', 'limit'])
    // the operator value must not leak into highlighting
    expect(parts.some((p) => p.hit && p.text.includes('project'))).toBe(false)
  })
})
