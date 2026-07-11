/**
 * Story 10.2 (reworked by the epic10 layout-v2 defect burndown): pure canvas
 * geometry — fit-to-content viewBox (48px pad, centered, zoom clamped 0.5–2),
 * orthogonal elbow routing through card-free channels, label-chip clearance,
 * parallel-lane offsets, keyboard traversal order, aggregation badge text.
 */
import { describe, expect, it } from 'vitest'
import {
  CHIP_H,
  CHIP_W,
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
  badgeRect,
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
  resolveChipCollisions,
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

  it('zooms about the pointer and clamps to the 0.4×–2.5× band (D1a5)', () => {
    const zoomed = zoomViewBox(vb, 0.5, 500, 375, 1000)
    expect(zoomed.w).toBe(500) // 2× zoom in — inside the band
    expect(zoomed.x).toBe(250) // pointer point stays put
    expect(zoomed.y).toBe(187.5)
    // most zoomed IN: fitW / ZOOM_MAX_SCALE = 1000 / 2.5 = 400
    expect(zoomViewBox(vb, 0.0001, 0, 0, 1000).w).toBe(400) // never past 2.5×
    // most zoomed OUT: fitW / ZOOM_MIN_SCALE = 1000 / 0.4 = 2500
    expect(zoomViewBox(vb, 100000, 0, 0, 1000).w).toBe(2500) // never past 0.4×
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

  it('fans parallel edges between the same pair out by ≥ CHIP_H per lane (WP1)', () => {
    const offsets = laneOffsets([
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'a' },
      { id: 'lone', source: 'a', target: 'c' },
    ])
    expect(offsets.get('e1')).toBe(-12)
    expect(offsets.get('e2')).toBe(12)
    // the fan step must clear the chip height so two stacked lanes' pills never
    // vertically overlap (the collision root cause: was 12 < CHIP_H=18)
    const step = Math.abs((offsets.get('e1') ?? 0) - (offsets.get('e2') ?? 0))
    expect(step).toBe(24)
    expect(step).toBeGreaterThanOrEqual(CHIP_H)
    expect(offsets.get('lone')).toBe(0)
    // a same-pair reciprocal pair puts its labels on OPPOSITE sides of the
    // channel (chipOff sign follows the lane direction) and never stacks
    const a = rect(0, 0, CLUSTER_W, CLUSTER_H)
    const b = rect(CLUSTER_W + GUTTER, 0, CLUSTER_W, CLUSTER_H)
    const labA = orthoRoute(a, b, -12).label
    const labB = orthoRoute(b, a, 12).label
    expect(Math.sign(labA.y - CLUSTER_H / 2)).toBe(-Math.sign(labB.y - CLUSTER_H / 2))
    expect(rectsOverlap(chipRect(labA), chipRect(labB))).toBe(false)
  })
})

describe('badgeRect (WP1 — text-sized pill)', () => {
  it('never narrower than CHIP_W, widens for a long count, and centers on x', () => {
    // a short label floors at the fixed pill width
    const short = badgeRect({ x: 100, y: 50 }, 'x')
    expect(short.w).toBe(CHIP_W)
    expect(short.x + short.w / 2).toBe(100) // centered on the label
    expect(short.h).toBe(CHIP_H)
    // a real "N open / M total" already exceeds the old fixed 112px pill, so it
    // MUST grow rather than spill (the overflow bug this fixes)
    const longText = routeBadge(1200, 9999)
    const long = badgeRect({ x: 100, y: 50 }, longText)
    expect(long.w).toBeGreaterThan(CHIP_W)
    expect(long.w).toBeGreaterThanOrEqual(longText.length * 6)
    expect(long.x + long.w / 2).toBe(100)
  })
})

describe('resolveChipCollisions (WP1 — global de-collision pass)', () => {
  const overlaps = (rects: Rect[]): boolean => {
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++)
        if (rectsOverlap(rects[i] as Rect, rects[j] as Rect)) return true
    return false
  }
  const applied = (chips: Array<{ id: string; rect: Rect }>): Rect[] => {
    const shifts = resolveChipCollisions(chips)
    return chips.map(({ id, rect: r }) => {
      const s = shifts.get(id) ?? { dx: 0, dy: 0 }
      return { ...r, x: r.x + s.dx, y: r.y + s.dy }
    })
  }

  it('leaves a non-colliding set untouched', () => {
    const chips = [
      { id: 'a', rect: chipRect({ x: 0, y: 0 }) },
      { id: 'b', rect: chipRect({ x: 400, y: 0 }) },
    ]
    const shifts = resolveChipCollisions(chips)
    expect(shifts.get('a')).toEqual({ dx: 0, dy: 0 })
    expect(shifts.get('b')).toEqual({ dx: 0, dy: 0 })
  })

  it('separates a crafted colliding set until no two chips overlap', () => {
    // five chips stacked on the SAME point — the worst case
    const chips = ['e1', 'e2', 'e3', 'e4', 'e5'].map((id) => ({
      id,
      rect: chipRect({ x: 200, y: 120 }),
    }))
    expect(overlaps(chips.map((c) => c.rect))).toBe(true) // precondition
    expect(overlaps(applied(chips))).toBe(false)
  })

  it('clears a dense 25-topic-style grid of near-coincident chips', () => {
    // 25 chips clustered inside a single CHIP_W×CHIP_H cell (a pathological
    // dominant-topic / nimbus fan) — the pass must fully de-collide them
    const chips: Array<{ id: string; rect: Rect }> = []
    for (let i = 0; i < 25; i++) {
      chips.push({ id: `t${String(i).padStart(2, '0')}`, rect: chipRect({ x: 300 + (i % 5) * 6, y: 200 + i * 3 }) })
    }
    expect(overlaps(applied(chips))).toBe(false)
  })

  it('is deterministic — same input yields the same offsets', () => {
    const build = (): Array<{ id: string; rect: Rect }> =>
      ['e3', 'e1', 'e2'].map((id) => ({ id, rect: chipRect({ x: 100, y: 100 }) }))
    const a = resolveChipCollisions(build())
    const b = resolveChipCollisions(build())
    for (const id of ['e1', 'e2', 'e3']) expect(a.get(id)).toEqual(b.get(id))
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
