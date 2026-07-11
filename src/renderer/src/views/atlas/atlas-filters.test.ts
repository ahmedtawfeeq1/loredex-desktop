/**
 * Story 10.6: filter facet composition (AND) + clear, search score → ring
 * tier mapping, focus fade = exactly the 1-hop set, blocked preset isolation,
 * and the decor class taxonomy.
 */
import { describe, expect, it } from 'vitest'
import type { AtlasEdge, AtlasNode } from '../../../../shared/types'
import {
  activeFilterCount,
  applyAtlasFilters,
  DEFAULT_FILTERS,
  EMPTY_FILTERS,
  effectiveStatus,
  focusNeighborhood,
  searchRingTiers,
} from './atlas-filters'
import { edgeDecorClass, nodeDecorClass } from './decor'

const node = (id: string, over: Partial<AtlasNode> = {}): AtlasNode => ({
  id,
  type: 'note',
  label: id,
  x: 0,
  y: 0,
  ...over,
})
const edge = (id: string, source: string, target: string, over: Partial<AtlasEdge> = {}): AtlasEdge => ({
  id,
  source,
  target,
  category: 'wikilink',
  ...over,
})

const NODES: AtlasNode[] = [
  node('project:alpha', { type: 'project', label: 'alpha' }),
  node('project:beta', { type: 'project', label: 'beta' }),
  node('note:a', { topic: 'streaming', path: 'projects/alpha/streaming/a.md' }),
  node('note:b', { topic: 'channels', path: 'projects/beta/channels/b.md' }),
  node('handoff:open', { type: 'handoff', kind: 'request', status: 'open' }),
  node('handoff:done', { type: 'handoff', kind: 'delivery', status: 'consumed' }),
  node('handoff:expired', { type: 'handoff', kind: 'request', status: 'snoozed', expired: true }),
]
const EDGES: AtlasEdge[] = [
  edge('w1', 'note:a', 'note:b'),
  edge('r-block', 'project:alpha', 'project:beta', { category: 'route', blocking: true }),
  edge('r-calm', 'project:beta', 'project:alpha', { category: 'route', blocking: false }),
  edge('c-mention', 'note:a', 'handoff:open', { category: 'contract-link', confidence: 'mentioned' }),
  edge('c-guess', 'note:b', 'handoff:open', { category: 'contract-link', confidence: 'heuristic' }),
  edge('aff', 'note:a', 'note:b', { category: 'affinity' }),
]

describe('applyAtlasFilters', () => {
  it('no active facets = everything passes', () => {
    const out = applyAtlasFilters(NODES, EDGES, EMPTY_FILTERS)
    expect(out.nodes).toHaveLength(NODES.length)
    expect(out.edges).toHaveLength(EDGES.length)
  })

  it('facets compose with AND across node type + status + topic', () => {
    const out = applyAtlasFilters(NODES, EDGES, {
      ...EMPTY_FILTERS,
      nodeTypes: ['note', 'handoff'],
      statuses: ['open'],
      topics: ['streaming'],
    })
    // notes narrowed to streaming; handoffs narrowed to effective-open
    // (expired snooze reads as open); projects dropped by the type facet
    expect(out.nodes.map((n) => n.id).sort()).toEqual([
      'handoff:expired',
      'handoff:open',
      'note:a',
    ])
    // surviving edges only between visible endpoints
    expect(out.edges.map((e) => e.id)).toEqual(['c-mention'])
  })

  it('edge category and confidence tier narrow edges only', () => {
    const categories = applyAtlasFilters(NODES, EDGES, {
      ...EMPTY_FILTERS,
      edgeCategories: ['route'],
    })
    expect(categories.edges.map((e) => e.id).sort()).toEqual(['r-block', 'r-calm'])
    expect(categories.nodes).toHaveLength(NODES.length)

    const tier = applyAtlasFilters(NODES, EDGES, { ...EMPTY_FILTERS, confidence: 'mentioned' })
    expect(tier.edges.some((e) => e.id === 'c-guess')).toBe(false)
    expect(tier.edges.some((e) => e.id === 'c-mention')).toBe(true)
  })

  it('blocked preset isolates blocking chains: blocking handoffs, routes, endpoints', () => {
    const out = applyAtlasFilters(NODES, EDGES, { ...EMPTY_FILTERS, blocked: true })
    expect(out.nodes.map((n) => n.id).sort()).toEqual([
      'handoff:expired', // expired snooze counts as open
      'handoff:open',
      'project:alpha',
      'project:beta',
    ])
    expect(out.edges.map((e) => e.id)).toEqual(['r-block'])
  })

  it('activeFilterCount counts facets, and EMPTY_FILTERS clears to zero', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0)
    expect(
      activeFilterCount({
        ...EMPTY_FILTERS,
        nodeTypes: ['note'],
        statuses: ['open'],
        confidence: 'heuristic',
        blocked: true,
      }),
    ).toBe(4)
  })

  it('affinity is hidden by DEFAULT_FILTERS and returns when toggled on (WP2)', () => {
    // the Atlas opens decluttered: the dashed cross-project affinity web is off
    const off = applyAtlasFilters(NODES, EDGES, DEFAULT_FILTERS)
    expect(off.edges.some((e) => e.category === 'affinity')).toBe(false)
    // every other edge survives — only affinity is suppressed
    expect(off.edges.map((e) => e.id).sort()).toEqual(['c-guess', 'c-mention', 'r-block', 'r-calm', 'w1'])

    // enabling the Filters affinity toggle empties the exclusion → the web shows
    const on = applyAtlasFilters(NODES, EDGES, { ...DEFAULT_FILTERS, excludedEdgeCategories: [] })
    expect(on.edges.some((e) => e.id === 'aff')).toBe(true)
    expect(on.edges).toHaveLength(EDGES.length)
  })

  it('EMPTY_FILTERS keeps all-pass semantics (affinity included)', () => {
    const out = applyAtlasFilters(NODES, EDGES, EMPTY_FILTERS)
    expect(out.edges.some((e) => e.category === 'affinity')).toBe(true)
  })

  it('the declutter exclusion is not counted as an active facet', () => {
    // it is a default, not a user narrowing — the panel must not read "1 active"
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0)
  })

  it('effectiveStatus derives expired snoozes as open', () => {
    expect(effectiveStatus({ status: 'snoozed', expired: true })).toBe('open')
    expect(effectiveStatus({ status: 'snoozed', expired: false })).toBe('snoozed')
    expect(effectiveStatus({})).toBe('open')
  })
})

describe('focusNeighborhood', () => {
  it('is exactly the node plus its 1-hop neighbors', () => {
    const focus = focusNeighborhood('note:a', EDGES)
    expect([...focus].sort()).toEqual(['handoff:open', 'note:a', 'note:b'])
  })

  it('an isolated node focuses to itself alone', () => {
    expect([...focusNeighborhood('handoff:done', EDGES)]).toEqual(['handoff:done'])
  })
})

describe('searchRingTiers', () => {
  it('tiers by score relative to the best hit; strongest tier wins duplicates', () => {
    const nodes = [
      node('note:a', { path: 'projects/alpha/streaming/a.md' }),
      node('note:b', { path: 'projects/beta/channels/b.md' }),
      node('note:c', { path: 'projects/beta/channels/c.md' }),
    ]
    const tiers = searchRingTiers(
      [
        { path: 'projects/alpha/streaming/a.md', score: 9 },
        { path: 'projects/beta/channels/b.md', score: 4 },
        { path: 'projects/beta/channels/c.md', score: 1 },
        { path: 'projects/unmapped/x.md', score: 9 },
      ],
      nodes,
    )
    expect(tiers.get('note:a')).toBe(1)
    expect(tiers.get('note:b')).toBe(2)
    expect(tiers.get('note:c')).toBe(3)
    expect(tiers.size).toBe(3) // unmapped hit ignored
  })

  it('clearing the query clears the rings (empty hits → empty map)', () => {
    expect(searchRingTiers([], [node('note:a', { path: 'a.md' })]).size).toBe(0)
  })
})

describe('decor classes (ring taxonomy stays distinct)', () => {
  it('composes tour, search tier, path and fade classes per node', () => {
    const decor = {
      tour: new Set(['n1']),
      search: new Map<string, 1 | 2 | 3>([['n1', 1]]),
      path: new Set(['n2']),
      focus: new Set(['n1']),
    }
    expect(nodeDecorClass('n1', decor)).toBe(' atlas-node-tour atlas-ring-search-1')
    expect(nodeDecorClass('n2', decor)).toBe(' atlas-node-path atlas-node-faded')
    expect(nodeDecorClass('n1', undefined)).toBe('')
  })

  it('edges go gold on the traced path and fade outside focus', () => {
    const decor = { pathEdges: new Set(['e1']), focus: new Set(['a', 'b']) }
    expect(edgeDecorClass({ id: 'e1', source: 'a', target: 'b' }, decor)).toBe(' atlas-edge-path')
    expect(edgeDecorClass({ id: 'e2', source: 'a', target: 'z' }, decor)).toBe(' atlas-edge-faded')
  })
})
