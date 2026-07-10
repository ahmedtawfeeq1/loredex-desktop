/**
 * Story 10.6 (ATLAS-6): BFS shortest path over the base model's bidirectional
 * adjacency — linear, diamond (shortest wins), disconnected → null, self →
 * single node, unknown ids → null; deterministic across runs.
 */
import { describe, expect, it } from 'vitest'
import type { AtlasEdge, AtlasNode } from '../shared/types'
import { shortestPath } from './atlas'

const node = (id: string): AtlasNode => ({ id, type: 'note', label: id, x: 0, y: 0 })
const edge = (id: string, source: string, target: string): AtlasEdge => ({
  id,
  source,
  target,
  category: 'wikilink',
})

function model(nodeIds: string[], edges: AtlasEdge[]) {
  return { nodes: new Map(nodeIds.map((id) => [id, node(id)])), edges }
}

describe('shortestPath', () => {
  it('walks a linear chain, returning nodes and the edges between them', () => {
    const m = model(['a', 'b', 'c'], [edge('e1', 'a', 'b'), edge('e2', 'b', 'c')])
    expect(shortestPath(m, 'a', 'c')).toEqual({
      nodeIds: ['a', 'b', 'c'],
      edgeIds: ['e1', 'e2'],
    })
  })

  it('is bidirectional — direction of the stored edge does not matter', () => {
    const m = model(['a', 'b'], [edge('e1', 'b', 'a')])
    expect(shortestPath(m, 'a', 'b')).toEqual({ nodeIds: ['a', 'b'], edgeIds: ['e1'] })
  })

  it('takes the shortest branch of a diamond', () => {
    const m = model(
      ['a', 'b', 'c', 'd'],
      [
        edge('long1', 'a', 'b'),
        edge('long2', 'b', 'c'),
        edge('long3', 'c', 'd'),
        edge('short', 'a', 'd'),
      ],
    )
    expect(shortestPath(m, 'a', 'd')).toEqual({ nodeIds: ['a', 'd'], edgeIds: ['short'] })
  })

  it('returns null for disconnected nodes — one honest sentence downstream', () => {
    const m = model(['a', 'b', 'x'], [edge('e1', 'a', 'b')])
    expect(shortestPath(m, 'a', 'x')).toBeNull()
  })

  it('self-path is the single node with no edges', () => {
    const m = model(['a'], [])
    expect(shortestPath(m, 'a', 'a')).toEqual({ nodeIds: ['a'], edgeIds: [] })
  })

  it('unknown endpoints return null, never a crash', () => {
    const m = model(['a'], [])
    expect(shortestPath(m, 'a', 'ghost')).toBeNull()
    expect(shortestPath(m, 'ghost', 'a')).toBeNull()
  })

  it('is deterministic across runs (sorted adjacency)', () => {
    const edges = [
      edge('z-edge', 'a', 'm'),
      edge('a-edge', 'a', 'n'),
      edge('m-out', 'm', 'z'),
      edge('n-out', 'n', 'z'),
    ]
    const m = model(['a', 'm', 'n', 'z'], edges)
    const first = shortestPath(m, 'a', 'z')
    for (let i = 0; i < 5; i++) expect(shortestPath(m, 'a', 'z')).toEqual(first)
  })
})
