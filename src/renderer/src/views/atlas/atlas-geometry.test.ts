/**
 * Story 10.2 (reworked by the epic10 layout-v2 defect burndown): pure canvas
 * geometry — fit-to-content viewBox (48px pad, centered, zoom clamped 0.5–2),
 * orthogonal elbow routing through card-free channels, label-chip clearance,
 * parallel-lane offsets, keyboard traversal order, aggregation badge text.
 */
import { describe, expect, it } from 'vitest'
import {
  CLUSTER_H,
  CLUSTER_W,
  FIT_PAD,
  GUTTER,
  NODE_H,
  NODE_W,
  NOTE_ROW_PITCH,
  PANEL_ASPECT,
  READABLE_CARD_MIN,
  panelWrapRows,
  PILL_H,
  PILL_W,
  TOPIC_COL_PITCH,
  V_GAP,
} from '../../../../shared/atlas-layout'
import type { AtlasNode } from '../../../../shared/types'
import {
  chipRect,
  fitViewBox,
  laneOffsets,
  nextFocus,
  nodeRect,
  orthoRoute,
  panelRect,
  panViewBox,
  type Rect,
  rectsOverlap,
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

const rect = (x: number, y: number, w = NODE_W, h = NODE_H): Rect => ({ x, y, w, h })

describe('nodeRect', () => {
  it('projects are cluster cards at overview and pills at drilled levels', () => {
    expect(nodeRect(node('p', 0, 0), 'overview')).toEqual({ x: 0, y: 0, w: CLUSTER_W, h: CLUSTER_H })
    expect(nodeRect(node('p', 0, 0), 'learn')).toEqual({ x: 0, y: 0, w: PILL_W, h: PILL_H })
    expect(nodeRect({ type: 'note', x: 5, y: 6 }, 'deep')).toEqual({ x: 5, y: 6, w: NODE_W, h: NODE_H })
  })
})

describe('fitViewBox', () => {
  it('a graph that fits at a readable size is centered and fully covered', () => {
    // content needs a modest zoom-out (< the readable floor) → fit covers all,
    // centered, no dead top-left corner (epic17.2 layout-fix, centered branch)
    const vb = fitViewBox([rect(0, 0), rect(700, 400)], 800, 600)
    // contains everything plus the pad
    expect(vb.x).toBeLessThanOrEqual(-FIT_PAD)
    expect(vb.y).toBeLessThanOrEqual(-FIT_PAD)
    expect(vb.x + vb.w).toBeGreaterThanOrEqual(700 + NODE_W + FIT_PAD)
    expect(vb.y + vb.h).toBeGreaterThanOrEqual(400 + NODE_H + FIT_PAD)
    // aspect preserved, content centered
    expect(vb.w / vb.h).toBeCloseTo(800 / 600, 5)
    expect(vb.x + vb.w / 2).toBeCloseTo((700 + NODE_W) / 2, 5)
    expect(vb.y + vb.h / 2).toBeCloseTo((400 + NODE_H) / 2, 5)
    // a card renders at least the readable floor
    expect((NODE_W * 800) / vb.w).toBeGreaterThanOrEqual(READABLE_CARD_MIN - 1e-6)
  })

  it('a graph too big to fit readably clamps at the floor and frames top-left', () => {
    // content that would need cards below READABLE_CARD_MIN to fit → the fit
    // stops at the readable floor and frames the top-left start region, leaving
    // the rest to pan (epic17.2 layout-fix, D1a3 "eye knows where to start")
    const vb = fitViewBox([rect(0, 0), rect(2000, 1200)], 800, 600)
    // framed at the top-left start region, not centered
    expect(vb.x).toBeCloseTo(-FIT_PAD, 5)
    expect(vb.y).toBeCloseTo(-FIT_PAD, 5)
    // aspect preserved
    expect(vb.w / vb.h).toBeCloseTo(800 / 600, 5)
    // clamped at the readable floor — a card renders at exactly READABLE_CARD_MIN
    expect((NODE_W * 800) / vb.w).toBeCloseTo(READABLE_CARD_MIN, 5)
    // it does NOT cover everything — the far content pans off-view
    expect(vb.x + vb.w).toBeLessThan(2000)
  })

  it('never zooms past 1:1 — small graphs sit centered at natural size', () => {
    const vb = fitViewBox([rect(0, 0)], 1200, 800)
    expect(vb.w).toBe(1200) // scale clamped to 1, not blown up to fill
    expect(vb.x + vb.w / 2).toBeCloseTo(NODE_W / 2, 5) // still centered
  })

  it('degrades to the pane box when the graph is empty', () => {
    expect(fitViewBox([], 800, 600)).toEqual({ x: 0, y: 0, w: 800, h: 600 })
  })
})

describe('zoom + pan', () => {
  const vb = { x: 0, y: 0, w: 1000, h: 750 }

  it('zooms about the pointer and clamps to 0.5×–2× of the fit', () => {
    const zoomed = zoomViewBox(vb, 0.5, 500, 375, 1000)
    expect(zoomed.w).toBe(500) // 2× zoom in — the clamp boundary
    expect(zoomed.x).toBe(250) // pointer point stays put
    expect(zoomed.y).toBe(187.5)
    expect(zoomViewBox(vb, 0.0001, 0, 0, 1000).w).toBe(500) // never past 2×
    expect(zoomViewBox(vb, 100000, 0, 0, 1000).w).toBe(2000) // never past 0.5×
  })

  it('pans by deltas without touching the size', () => {
    expect(panViewBox(vb, 10, -20)).toEqual({ x: 10, y: -20, w: 1000, h: 750 })
  })
})

describe('orthoRoute', () => {
  it('routes forward edges H→V→H with the vertical run in the gutter', () => {
    const a = rect(0, 0, CLUSTER_W, CLUSTER_H)
    const b = rect(CLUSTER_W + GUTTER, 300, CLUSTER_W, CLUSTER_H)
    const { points, label } = orthoRoute(a, b)
    expect(points[0]).toEqual({ x: CLUSTER_W, y: CLUSTER_H / 2 }) // leaves a's right edge
    expect(points[points.length - 1]).toEqual({ x: CLUSTER_W + GUTTER, y: 300 + CLUSTER_H / 2 }) // enters b's left edge
    // every vertical run sits strictly inside the gutter channel
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1] as { x: number; y: number }
      const q = points[i] as { x: number; y: number }
      expect(p.x === q.x || p.y === q.y).toBe(true) // orthogonal only
      if (p.x === q.x && p.y !== q.y) {
        expect(p.x).toBeGreaterThan(CLUSTER_W)
        expect(p.x).toBeLessThan(CLUSTER_W + GUTTER)
      }
    }
    // the label chip rides the horizontal channel segment, clear of both cards
    expect(rectsOverlap(chipRect(label), a)).toBe(false)
    expect(rectsOverlap(chipRect(label), b)).toBe(false)
  })

  it('routes long spans through the corridor band, never across a lane card', () => {
    const pitch = CLUSTER_W + GUTTER
    const a = rect(0, 0, CLUSTER_W, CLUSTER_H)
    const between = rect(pitch, 0, CLUSTER_W, CLUSTER_H) // same row, middle lane
    const b = rect(pitch * 2, 0, CLUSTER_W, CLUSTER_H)
    const { points, label } = orthoRoute(a, b)
    // no segment may cross the middle card
    for (let i = 1; i < points.length; i++) {
      const p = points[i - 1] as { x: number; y: number }
      const q = points[i] as { x: number; y: number }
      const seg: Rect = {
        x: Math.min(p.x, q.x),
        y: Math.min(p.y, q.y),
        w: Math.abs(p.x - q.x) || 0.1,
        h: Math.abs(p.y - q.y) || 0.1,
      }
      expect(rectsOverlap(seg, between)).toBe(false)
    }
    expect(rectsOverlap(chipRect(label), between)).toBe(false)
  })

  it('routes backward and same-lane pairs without touching either card', () => {
    const a = rect(CLUSTER_W + GUTTER, 0, CLUSTER_W, CLUSTER_H)
    const b = rect(0, 200, CLUSTER_W, CLUSTER_H)
    const back = orthoRoute(a, b)
    expect((back.points[0] as { x: number }).x).toBe(a.x) // leaves a's left edge
    expect((back.points[back.points.length - 1] as { x: number }).x).toBe(b.x + b.w)
    const sameLane = orthoRoute(rect(0, 0), rect(0, 400))
    for (const p of sameLane.points.slice(1, -1)) {
      expect(p.x).toBeLessThanOrEqual(0) // loops out the lane's left channel
    }
  })

  it('fans parallel edges between the same pair out by 12px per lane', () => {
    const offsets = laneOffsets([
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'a' },
      { id: 'lone', source: 'a', target: 'c' },
    ])
    expect(offsets.get('e1')).toBe(-6)
    expect(offsets.get('e2')).toBe(6)
    expect(Math.abs((offsets.get('e1') ?? 0) - (offsets.get('e2') ?? 0))).toBe(12)
    expect(offsets.get('lone')).toBe(0)
    // reciprocal same-row chips separate further than the lines — never stacked
    const a = rect(0, 0, CLUSTER_W, CLUSTER_H)
    const b = rect(CLUSTER_W + GUTTER, 0, CLUSTER_W, CLUSTER_H)
    const chipA = chipRect(orthoRoute(a, b, -6).label)
    const chipB = chipRect(orthoRoute(b, a, 6).label)
    expect(rectsOverlap(chipA, chipB)).toBe(false)
  })
})

describe('panelRect', () => {
  it('wraps the members with panel padding; empty set yields no panel', () => {
    const p = panelRect([rect(100, 100), rect(340, 244)])
    expect(p).toEqual({ x: 76, y: 76, w: 24 * 2 + 240 + NODE_W, h: 24 * 2 + 144 + NODE_H })
    expect(panelRect([])).toBeNull()
  })
})

describe('panelWrapRows (story 16.5 drilled density)', () => {
  it('wraps the panel grid toward PANEL_ASPECT — never one unbounded column', () => {
    expect(panelWrapRows([])).toBe(1)
    expect(panelWrapRows([1])).toBe(1)
    // the user's 18-member nimbus-backend case (5 topic notes + 13 handoffs):
    // 5 rows → a 4×5 grid, not a 13-row strip
    expect(panelWrapRows([5, 13])).toBe(5)
    // single-run panels wrap: rows always shallower than the strip layout
    for (const n of [6, 12, 18, 30, 60]) {
      const rows = panelWrapRows([n])
      expect(rows, `${n} members`).toBeLessThan(n)
      const cols = Math.ceil(n / rows)
      const aspect = (cols * TOPIC_COL_PITCH) / (rows * NOTE_ROW_PITCH)
      expect(aspect, `${n} members`).toBeGreaterThan(0.5)
      expect(aspect, `${n} members`).toBeLessThan(PANEL_ASPECT * 2)
    }
  })

  it('avoids fragmented grids: > 6 members always fill > 0.55 of the grid', () => {
    const cases: number[][] = [
      [5, 13],
      [2, 5, 1, 2], // nimbus-frontend deep: lane singletons fragment naive wraps
      [1, 1, 1, 1, 1, 1, 1],
      [3, 9, 2],
      [18],
    ]
    for (const runs of cases) {
      const total = runs.reduce((a, b) => a + b, 0)
      const rows = panelWrapRows(runs)
      const cols = runs.reduce((n, r) => n + Math.ceil(r / rows), 0)
      const rowsUsed = Math.min(rows, Math.max(...runs))
      expect(total / (cols * rowsUsed), `runs ${runs.join(',')}`).toBeGreaterThan(0.55)
    }
  })

  it('is deterministic for identical runs', () => {
    expect(panelWrapRows([5, 13])).toBe(panelWrapRows([5, 13]))
    expect(panelWrapRows([2, 5, 1, 2])).toBe(panelWrapRows([2, 5, 1, 2]))
  })
})

describe('rectsOverlap', () => {
  it('detects intersections and clears V_GAP-separated cards', () => {
    expect(rectsOverlap(rect(0, 0), rect(NODE_W - 1, 0))).toBe(true)
    expect(rectsOverlap(rect(0, 0), rect(0, NODE_H + V_GAP))).toBe(false)
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
