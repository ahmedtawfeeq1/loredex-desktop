/**
 * Story 10.2: pure canvas geometry — viewBox fit/zoom/pan, edge anchoring,
 * keyboard traversal order, aggregation badge text.
 */
import { describe, expect, it } from 'vitest'
import { NODE_H, NODE_W } from '../../../../shared/atlas-layout'
import type { AtlasNode } from '../../../../shared/types'
import {
  edgeAnchors,
  fitViewBox,
  MAX_ZOOM_W,
  MIN_ZOOM_W,
  nextFocus,
  panViewBox,
  routeBadge,
  traversalOrder,
  zoomViewBox,
} from './atlas-geometry'

const node = (id: string, x: number, y: number): AtlasNode => ({
  id,
  type: 'project',
  label: id,
  x,
  y,
})

describe('fitViewBox', () => {
  it('contains every card plus margin and preserves the pane aspect', () => {
    const vb = fitViewBox([node('a', 0, 0), node('b', 900, 400)], 800, 600)
    expect(vb.x).toBe(0)
    expect(vb.y).toBe(0)
    expect(vb.w).toBeGreaterThanOrEqual(900 + NODE_W)
    expect(vb.h).toBeGreaterThanOrEqual(400 + NODE_H)
    expect(vb.w / vb.h).toBeCloseTo(800 / 600, 5)
  })

  it('degrades to the pane box when the graph is empty', () => {
    expect(fitViewBox([], 800, 600)).toEqual({ x: 0, y: 0, w: 800, h: 600 })
  })
})

describe('zoom + pan', () => {
  const vb = { x: 0, y: 0, w: 1000, h: 750 }

  it('zooms about the pointer and clamps to the min/max width', () => {
    const zoomed = zoomViewBox(vb, 0.5, 500, 375)
    expect(zoomed.w).toBe(500)
    expect(zoomed.x).toBe(250) // pointer point stays put
    expect(zoomed.y).toBe(187.5)
    expect(zoomViewBox(vb, 0.0001, 0, 0).w).toBe(MIN_ZOOM_W)
    expect(zoomViewBox(vb, 100000, 0, 0).w).toBe(MAX_ZOOM_W)
  })

  it('pans by deltas without touching the size', () => {
    expect(panViewBox(vb, 10, -20)).toEqual({ x: 10, y: -20, w: 1000, h: 750 })
  })
})

describe('edgeAnchors', () => {
  it('leaves the right edge toward a rightward target, left edge otherwise', () => {
    const a = node('a', 0, 0)
    const b = node('b', 600, 100)
    const fwd = edgeAnchors(a, b)
    expect(fwd.x1).toBe(NODE_W) // right edge of a
    expect(fwd.x2).toBe(600) // left edge of b
    expect(fwd.y1).toBe(NODE_H / 2)
    const back = edgeAnchors(b, a)
    expect(back.x1).toBe(600) // left edge of b
    expect(back.x2).toBe(NODE_W) // right edge of a
  })
})

describe('keyboard traversal', () => {
  const grid = [node('a', 0, 0), node('b', 300, 0), node('c', 0, 130), node('d', 300, 130)]

  it('orders top→bottom then left→right', () => {
    expect(traversalOrder([...grid].reverse()).map((n) => n.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ArrowRight/Left walk the reading order; edges clamp', () => {
    const ordered = traversalOrder(grid)
    expect(nextFocus(ordered, 'a', 'ArrowRight')).toBe('b')
    expect(nextFocus(ordered, 'b', 'ArrowLeft')).toBe('a')
    expect(nextFocus(ordered, 'a', 'ArrowLeft')).toBe('a')
    expect(nextFocus(ordered, 'd', 'ArrowRight')).toBe('d')
  })

  it('ArrowDown/Up jump to the nearest node in the adjacent row', () => {
    const ordered = traversalOrder(grid)
    expect(nextFocus(ordered, 'a', 'ArrowDown')).toBe('c')
    expect(nextFocus(ordered, 'd', 'ArrowUp')).toBe('b')
    expect(nextFocus(ordered, 'a', 'ArrowUp')).toBe('a') // top row stays
  })

  it('no selection focuses the first node; empty graph focuses nothing', () => {
    expect(nextFocus(traversalOrder(grid), null, 'ArrowRight')).toBe('a')
    expect(nextFocus([], null, 'ArrowDown')).toBeNull()
  })
})

describe('routeBadge', () => {
  it('renders N open / M total', () => {
    expect(routeBadge(2, 5)).toBe('2 open / 5 total')
    expect(routeBadge(undefined, undefined)).toBe('0 open / 0 total')
  })
})
