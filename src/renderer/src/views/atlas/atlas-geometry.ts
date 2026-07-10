/**
 * Pure SVG geometry for the Atlas canvas (story 10.2, reworked by the epic10
 * layout-v2 defect burndown) — fit-to-content viewBox (48px padding, centered,
 * zoom clamped 0.5–2 around the fit), orthogonal elbow edge routing through
 * the card-free channels the core layout reserves, label-chip anchoring that
 * can never clip under a card, and keyboard traversal order.
 * No DOM, fully unit-tested; the canvas component just applies the numbers.
 */
import {
  FIT_PAD,
  NODE_W,
  READABLE_CARD_MIN,
  type Rect,
  ZOOM_MAX_SCALE,
  ZOOM_MIN_SCALE,
} from '../../../../shared/atlas-layout'

// the geometry both sides of the seam must agree on (card boxes, overlap
// test, orthogonal routing, chips, lanes, the panel card box) lives in
// shared/atlas-layout — re-exported here so the canvas keeps one geometry
// import (panelRect moved shared in story 16.5 for the drilled invariants)
export {
  chipRect,
  laneOffsets,
  nodeRect,
  type OrthoRoute,
  orthoRoute,
  panelRect,
  type Rect,
  rectsOverlap,
} from '../../../../shared/atlas-layout'

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

/** ViewBox fitted to the content bounding box: FIT_PAD padding, pane aspect
 *  preserved, never zoomed past 1:1. When the whole graph fits at a readable
 *  card size it sits CENTERED at natural size (small/medium graphs). When it
 *  does NOT — a large graph would need cards below READABLE_CARD_MIN to fit —
 *  the fit stops at that readable floor and frames the TOP-LEFT starting region
 *  (newest-activity topic), leaving the rest to pan/scroll rather than shrinking
 *  the whole map to an unreadable line. */
export function fitViewBox(rects: Rect[], paneW: number, paneH: number): ViewBox {
  const w0 = Math.max(paneW, 1)
  const h0 = Math.max(paneH, 1)
  if (rects.length === 0) return { x: 0, y: 0, w: w0, h: h0 }
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }
  const needW = maxX - minX + FIT_PAD * 2
  const needH = maxY - minY + FIT_PAD * 2
  const fitScale = Math.max(needW / w0, needH / h0, 1) // never above 100%
  // the widest zoom-out that still renders a card ≥ READABLE_CARD_MIN
  const floorScale = Math.max(NODE_W / READABLE_CARD_MIN, 1)
  const scale = Math.min(fitScale, floorScale)
  const w = w0 * scale
  const h = h0 * scale
  if (fitScale <= floorScale + 1e-9) {
    // fits at a readable size → center (no dead top-left corner)
    return { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h }
  }
  // clamped at the readable floor → frame the top-left starting region and pan
  return { x: minX - FIT_PAD, y: minY - FIT_PAD, w, h }
}

/** Wheel/pinch zoom about a pointer position (SVG coords), clamped to the
 *  ZOOM_MIN_SCALE–ZOOM_MAX_SCALE band (0.4×–2.5×, D1 amendment 5) of the fitted
 *  view (`fitW` = the fit viewBox width). The anchor point stays fixed. */
export function zoomViewBox(
  vb: ViewBox,
  factor: number,
  atX: number,
  atY: number,
  fitW: number,
): ViewBox {
  const w = Math.min(Math.max(vb.w * factor, fitW / ZOOM_MAX_SCALE), fitW / ZOOM_MIN_SCALE)
  const scale = w / vb.w
  const h = vb.h * scale
  return { x: atX - (atX - vb.x) * scale, y: atY - (atY - vb.y) * scale, w, h }
}

export function panViewBox(vb: ViewBox, dx: number, dy: number): ViewBox {
  return { ...vb, x: vb.x + dx, y: vb.y + dy }
}

/** ViewBox fitted AROUND a highlighted subset (tour steps, story 10.5):
 *  centered on the set's bounding box, pane aspect preserved, zoom clamped
 *  to the same 0.5×–2× band around the full fit. */
export function fitViewBoxAround(
  targets: Rect[],
  paneW: number,
  paneH: number,
  fitW: number,
  pad = 80,
): ViewBox | null {
  if (targets.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const t of targets) {
    minX = Math.min(minX, t.x)
    minY = Math.min(minY, t.y)
    maxX = Math.max(maxX, t.x + t.w)
    maxY = Math.max(maxY, t.y + t.h)
  }
  const w0 = maxX - minX + pad * 2
  const h0 = maxY - minY + pad * 2
  const scale = Math.max(w0 / Math.max(paneW, 1), h0 / Math.max(paneH, 1))
  let w = Math.max(paneW, 1) * scale
  let h = Math.max(paneH, 1) * scale
  const minW = fitW / 2
  if (w < minW) {
    h = (h * minW) / w
    w = minW
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

// ── keyboard traversal (unchanged from story 10.2) ───────────────────────────

/** Anything focusable on the canvas: node cards and topic atoms alike. */
export interface FocusTarget {
  id: string
  x: number
  y: number
}

/** Stable reading order for roving focus: top→bottom rows, left→right. */
export function traversalOrder<T extends FocusTarget>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
}

/** Arrow-key traversal over the ordered nodes: Left/Right walk the reading
 *  order; Up/Down jump to the nearest node in the adjacent row direction. */
export function nextFocus(
  ordered: FocusTarget[],
  currentId: string | null,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown',
): string | null {
  if (ordered.length === 0) return null
  const index = currentId ? ordered.findIndex((n) => n.id === currentId) : -1
  if (index === -1) return (ordered[0] as FocusTarget).id
  const current = ordered[index] as FocusTarget
  if (key === 'ArrowRight') return ordered[Math.min(index + 1, ordered.length - 1)]?.id ?? null
  if (key === 'ArrowLeft') return ordered[Math.max(index - 1, 0)]?.id ?? null
  const dir = key === 'ArrowDown' ? 1 : -1
  let best: FocusTarget | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const n of ordered) {
    if (dir === 1 ? n.y <= current.y : n.y >= current.y) continue
    const dist = Math.abs(n.y - current.y) * 2 + Math.abs(n.x - current.x)
    if (dist < bestDist) {
      best = n
      bestDist = dist
    }
  }
  return best?.id ?? current.id
}

/** `N open / M total` badge text for an aggregated route edge. */
export function routeBadge(openCount: number | undefined, totalCount: number | undefined): string {
  return `${openCount ?? 0} open / ${totalCount ?? 0} total`
}
