/**
 * Pure SVG geometry for the Atlas canvas (story 10.2) — viewBox fit, wheel
 * zoom, edge anchoring between card boxes, and keyboard traversal order.
 * No DOM, fully unit-tested; the canvas component just applies the numbers.
 */
import { MARGIN, NODE_H, NODE_W } from '../../../../shared/atlas-layout'

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

export const MIN_ZOOM_W = 320
export const MAX_ZOOM_W = 6000

/** ViewBox that contains every node card plus a margin; a sane default when empty. */
export function fitViewBox(nodes: FocusTarget[], paneW: number, paneH: number): ViewBox {
  if (nodes.length === 0) return { x: 0, y: 0, w: Math.max(paneW, 1), h: Math.max(paneH, 1) }
  let maxX = 0
  let maxY = 0
  for (const n of nodes) {
    maxX = Math.max(maxX, n.x + NODE_W)
    maxY = Math.max(maxY, n.y + NODE_H)
  }
  const w = Math.max(maxX + MARGIN, paneW)
  const h = Math.max(maxY + MARGIN, paneH)
  // preserve the pane's aspect so 1 SVG unit ≈ 1 px at fit
  const scale = Math.max(w / Math.max(paneW, 1), h / Math.max(paneH, 1))
  return { x: 0, y: 0, w: Math.max(paneW, 1) * scale, h: Math.max(paneH, 1) * scale }
}

/** Wheel zoom about a pointer position (SVG coords), clamped. */
export function zoomViewBox(vb: ViewBox, factor: number, atX: number, atY: number): ViewBox {
  const w = Math.min(Math.max(vb.w * factor, MIN_ZOOM_W), MAX_ZOOM_W)
  const scale = w / vb.w
  const h = vb.h * scale
  return { x: atX - (atX - vb.x) * scale, y: atY - (atY - vb.y) * scale, w, h }
}

export function panViewBox(vb: ViewBox, dx: number, dy: number): ViewBox {
  return { ...vb, x: vb.x + dx, y: vb.y + dy }
}

/** Edge endpoints clipped to the card borders: leaves the source's right or
 *  left edge center toward the target (layout is left→right by depth). */
export function edgeAnchors(
  a: Pick<FocusTarget, 'x' | 'y'>,
  b: Pick<FocusTarget, 'x' | 'y'>,
): { x1: number; y1: number; x2: number; y2: number; midX: number; midY: number } {
  const leftToRight = a.x + NODE_W / 2 <= b.x + NODE_W / 2
  const x1 = leftToRight ? a.x + NODE_W : a.x
  const y1 = a.y + NODE_H / 2
  const x2 = leftToRight ? b.x : b.x + NODE_W
  const y2 = b.y + NODE_H / 2
  return { x1, y1, x2, y2, midX: (x1 + x2) / 2, midY: (y1 + y2) / 2 }
}

/** ViewBox fitted AROUND a highlighted subset (tour steps, story 10.5):
 *  centered on the set's bounding box, pane aspect preserved, zoom clamped. */
export function fitViewBoxAround(
  targets: FocusTarget[],
  paneW: number,
  paneH: number,
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
    maxX = Math.max(maxX, t.x + NODE_W)
    maxY = Math.max(maxY, t.y + NODE_H)
  }
  const w0 = maxX - minX + pad * 2
  const h0 = maxY - minY + pad * 2
  const scale = Math.max(w0 / Math.max(paneW, 1), h0 / Math.max(paneH, 1))
  let w = Math.max(paneW, 1) * scale
  let h = Math.max(paneH, 1) * scale
  if (w < MIN_ZOOM_W) {
    h = (h * MIN_ZOOM_W) / w
    w = MIN_ZOOM_W
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

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
