/**
 * Story 10.7: changed/affected partition from fixture activity events —
 * touched → glow, 1-hop → ring, others → none; since-point boundary included
 * once; live event application; cluster counts from typed ids.
 */
import { describe, expect, it } from 'vitest'
import type { AtlasEdge, AtlasNode } from '../../../../shared/types'
import {
  affectedNodeIds,
  changedNodeIds,
  clusterChangedCounts,
  withLiveChanges,
} from './changed-since'
import { nodeDecorClass } from './decor'

const node = (id: string, over: Partial<AtlasNode> = {}): AtlasNode => ({
  id,
  type: 'note',
  label: id,
  x: 0,
  y: 0,
  ...over,
})

const NODES: AtlasNode[] = [
  node('note:alpha/streaming/a', { path: 'projects/alpha/streaming/a.md' }),
  node('note:beta/channels/b', { path: 'projects/beta/channels/b.md' }),
  node('note:beta/channels/c', { path: 'projects/beta/channels/c.md' }),
  node('handoff:beta/h1', { type: 'handoff', label: 'h1', path: 'projects/beta/handoffs/h1.md' }),
]
const EDGES: AtlasEdge[] = [
  { id: 'e1', source: 'note:alpha/streaming/a', target: 'note:beta/channels/b', category: 'wikilink' },
  { id: 'e2', source: 'note:beta/channels/b', target: 'note:beta/channels/c', category: 'wikilink' },
]

const event = (at: string, path?: string, handoffId?: string) => ({
  at,
  subject: { ...(path ? { path } : {}), ...(handoffId ? { handoffId } : {}) },
})

describe('changedNodeIds', () => {
  it('partitions exactly: touched glow, boundary included once, older ignored', () => {
    const changed = changedNodeIds(
      [
        event('2026-07-10T09:00:00Z', 'projects/alpha/streaming/a.md'),
        event('2026-07-08', 'projects/beta/channels/b.md'), // before since → none
        event('2026-07-09', 'projects/alpha/streaming/a.md'), // boundary, duplicate path
        event('2026-07-10', undefined, 'h1'), // handoff by id
        event('2026-07-10', 'projects/ghost/x.md'), // unmapped → ignored
      ],
      '2026-07-09',
      NODES,
    )
    expect([...changed].sort()).toEqual(['handoff:beta/h1', 'note:alpha/streaming/a'])
  })
})

describe('affectedNodeIds', () => {
  it('rings exactly the 1-hop neighbors that are not themselves changed', () => {
    const changed = new Set(['note:alpha/streaming/a'])
    const affected = affectedNodeIds(changed, EDGES)
    expect([...affected]).toEqual(['note:beta/channels/b']) // c is 2 hops → none
  })

  it('changed neighbors stay glow, never double as affected (decor precedence)', () => {
    const decor = {
      changed: new Set(['note:alpha/streaming/a']),
      affected: new Set(['note:alpha/streaming/a', 'note:beta/channels/b']),
    }
    expect(nodeDecorClass('note:alpha/streaming/a', decor)).toBe(' atlas-node-changed')
    expect(nodeDecorClass('note:beta/channels/b', decor)).toBe(' atlas-node-affected')
    expect(nodeDecorClass('note:beta/channels/c', decor)).toBe('')
  })
})

describe('withLiveChanges', () => {
  it('a live watcher/poller batch moves its nodes into the glow set', () => {
    const before = new Set(['handoff:beta/h1'])
    const after = withLiveChanges(before, ['projects/beta/channels/c.md', 'projects/nowhere.md'], NODES)
    expect([...after].sort()).toEqual(['handoff:beta/h1', 'note:beta/channels/c'])
    expect([...before]).toEqual(['handoff:beta/h1']) // input set untouched
  })
})

describe('clusterChangedCounts', () => {
  it('counts changed notes/handoffs per owning project from typed ids', () => {
    const counts = clusterChangedCounts(
      new Set(['note:alpha/streaming/a', 'note:beta/channels/b', 'handoff:beta/h1', 'commit:abc1234']),
    )
    expect(counts.get('alpha')).toBe(1)
    expect(counts.get('beta')).toBe(2)
    expect(counts.has('commit')).toBe(false) // commits carry no project prefix
  })
})
