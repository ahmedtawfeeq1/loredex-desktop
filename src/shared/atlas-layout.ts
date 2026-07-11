/**
 * Atlas layout constants shared by the core-side layout (story 10.1, reworked
 * by the epic10 layout-v2 defect burndown) and the renderer's SVG geometry
 * (story 10.2). Positions are computed core-side; the renderer only needs the
 * card boxes and grid metrics to draw, route edges, and fit.
 *
 * Layout-v2 lane spec (binding):
 * - overview: columns by route-dependency depth, cluster cards CLUSTER_W wide,
 *   vertical gaps ≥ V_GAP, horizontal gutters ≥ GUTTER reserved as edge
 *   channels — cards NEVER overlap (asserted in unit tests);
 * - learn/deep (story 16.5 density rework, epic17.2 reading flow, epic17.2
 *   layout-fix): the focused cluster expands into one large panel whose content
 *   FILLS it — each topic is a bordered sub-card (its notes column-packed
 *   panelWrapRows deep) and the sub-cards SHELF-WRAP left→right then row-down
 *   onto a shared column grid, the shelf width chosen so the packed bounding box
 *   lands near PANEL_ASPECT (a 25-topic project reads as browsable rows, never
 *   one canvas-wide strip); handoffs and deep context types are trailing cells
 *   in the same flow;
 *   neighboring clusters collapse to compact side pills behind a PILL_GUTTER
 *   chip channel.
 */

/** mini routing-slip card box (DESIGN.md data-visualizations spec) */
export const NODE_W = 200
export const NODE_H = 84
/** overview project cluster card — wider than a note card, same height */
export const CLUSTER_W = 280
export const CLUSTER_H = 84
/** collapsed neighbor pill at learn/deep (and the focused panel's header bar) */
export const PILL_W = 160
export const PILL_H = 40
/** minimum vertical gap between stacked cards */
export const V_GAP = 40
/** horizontal gutter between lanes — reserved as an edge channel (card-free) */
export const GUTTER = 160
/** canvas margin around the whole layout */
export const MARGIN = 48
/** panel dot-grid pitch; panel card positions land on this grid */
export const GRID = 24
export const PANEL_PAD = 24
/** topic column pitch inside a panel: NODE_W + 40, GRID-aligned (24 × 10) */
export const TOPIC_COL_PITCH = 240
/** note row pitch inside a panel: NODE_H + 60 gap, GRID-aligned (24 × 6) */
export const NOTE_ROW_PITCH = 144
/** fit-to-content padding (viewport spec) */
export const FIT_PAD = 48
/** target width/height ratio the focused panel's grid wraps toward — near the
 *  pane aspect (roughly 16:10), so the packed content is a browsable rectangle
 *  rather than a canvas-wide line the fit then shrinks to nothing */
export const PANEL_ASPECT = 1.6
/** post-fit readable floor: the fit never zooms a card narrower than this, so a
 *  topic label + note count stays legible on a large graph. When content at
 *  this floor exceeds the viewport the canvas PANS instead of scaling to a line
 *  (fitViewBox frames the top-left starting region). Matches the ≥140px density
 *  floor. (epic17.2 layout-fix) */
export const READABLE_CARD_MIN = 140
/** fit zoom-IN cap (WP4): a small graph (4-node Overview, thin panel) scales UP
 *  to fill the pane, but never magnifies a card past MAX_FILL× its natural width
 *  — so a lone node fills the pane without ballooning into a wall of one card.
 *  The most-zoomed-in viewBox scale is therefore 1 / MAX_FILL. */
export const MAX_FILL = 1.8
/** WP4 dominant-topic balance: the deepest a single topic block's column may
 *  pack. A dominant topic (the nimbus-backend 14-note handoffs case) wraps into
 *  MORE, shorter columns instead of one tall narrow strip — the panel reads as a
 *  wide browsable grid. Caps the wrap depth panelWrapRows may choose. */
export const PANEL_MAX_COL_DEPTH = 6
/** interactive zoom band (D1 amendment 5 — trackpad-native navigation): pinch /
 *  ⌘=/⌘− zoom is clamped between these scales RELATIVE to the fitted view — so
 *  the smallest viewBox (most zoomed in) is fitW / ZOOM_MAX_SCALE and the widest
 *  (most zoomed out) is fitW / ZOOM_MIN_SCALE. Widened from the prior 0.5–2 band
 *  so pinch has more travel without losing the map. */
export const ZOOM_MIN_SCALE = 0.4
export const ZOOM_MAX_SCALE = 2.5
/** side-pill column → panel gutter (GRID-aligned, 24 × 9): a wide edge channel
 *  with real clearance to the side pill AND the panel card (GUTTER left it too
 *  tight — the clipped-label defect, story 16.5) */
export const PILL_GUTTER = 216

// ── topic sub-cards + recency reading flow (story epic17.2, D1 amendment 3) ──
/** topic sub-card inset around its member notes (tighter than PANEL_PAD) */
export const SUBCARD_PAD = 12

/**
 * Ellipsize a label to fit `widthPx` at an approximate glyph advance
 * (`charPx`) — SVG <text> has no CSS ellipsis, so long topic names must be
 * clipped in code (D1 amendment 6: the header label and footer meta no longer
 * share a baseline, but a very long name in a narrow card is still truncated).
 */
export function truncateLabel(text: string, widthPx: number, charPx: number): string {
  const max = Math.max(1, Math.floor(widthPx / charPx))
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(1, max - 1))}…`
}
/** label row reserved at the top of a topic sub-card (label + count + date);
 *  the panel's content top drops by this so a col-0 sub-card never rides its
 *  header bar */
export const SUBCARD_LABEL_H = 22
/** footer band reserved at the BOTTOM of a topic sub-card for the
 *  `N notes · date` meta (D1 amendment 6) — the notes pack above it so the
 *  deepest note card never sits under the footer text */
export const SUBCARD_FOOTER_H = 18
/** the `01 02 03…` order chip box on a note card's top-left corner */
export const ORDER_CHIP_W = 20
export const ORDER_CHIP_H = 14

/** Newest ISO date among dated members ('' when none carry a date). */
export function newestDate(dates: ReadonlyArray<string | undefined>): string {
  let max = ''
  for (const d of dates) if (d && d > max) max = d
  return max
}

/** Recency-DESCENDING comparator (newest first; label breaks ties) — the
 *  reading direction D1 amendment 3 gives every drilled panel. The inverse of
 *  the ascending byDateThenLabel the layout stacked notes with before. */
export function byRecencyDesc(
  a: { date?: string; label: string },
  b: { date?: string; label: string },
): number {
  const ad = a.date ?? ''
  const bd = b.date ?? ''
  return ad === bd ? a.label.localeCompare(b.label) : bd.localeCompare(ad)
}

/** The bordered topic sub-card (radius 10): the bounding box of its member
 *  rects grown by SUBCARD_PAD, with SUBCARD_LABEL_H reserved above for the
 *  label row. Shared so the containment + no-overlap invariants can hold the
 *  renderer to exactly this box. Null for an empty topic (nothing to border). */
export function subCardRect(members: Rect[]): Rect | null {
  const box = boundingRect(members)
  if (!box) return null
  return {
    x: box.x - SUBCARD_PAD,
    y: box.y - SUBCARD_PAD - SUBCARD_LABEL_H,
    w: box.w + SUBCARD_PAD * 2,
    // reserve SUBCARD_LABEL_H above and SUBCARD_FOOTER_H below the notes so the
    // header label and footer meta each own a band the notes never enter
    h: box.h + SUBCARD_PAD * 2 + SUBCARD_LABEL_H + SUBCARD_FOOTER_H,
  }
}

/** 1-based, zero-padded order chips assigned NEWEST-FIRST over a topic's
 *  members: chip `01` names the newest note, `02` the next, and so on. The
 *  invariant the renderer is held to — chip order IS recency order. */
export function orderChips<T extends { id: string; date?: string; label: string }>(
  members: readonly T[],
): Map<string, string> {
  const out = new Map<string, string>()
  ;[...members].sort(byRecencyDesc).forEach((m, i) => out.set(m.id, String(i + 1).padStart(2, '0')))
  return out
}

/** How many rows a focused panel wraps its lanes at (story 16.5). `runs` are
 *  the panel's flow runs: consecutive topic blocks pack as one run; handoffs
 *  and each deep context type are their own lane run. Scans every candidate
 *  row count and keeps the grid whose aspect lands closest to PANEL_ASPECT,
 *  skipping fragmented grids (fill ≤ 0.55 with > 6 members) — so the drilled
 *  panel FILLS instead of rendering one unbounded column per topic (the
 *  18-member user case becomes 4×5, not a 13-row strip). Deterministic:
 *  ties keep the smaller row count. */
export function panelWrapRows(runs: number[]): number {
  const total = runs.reduce((n, r) => n + r, 0)
  if (total <= 0 || runs.length === 0) return 1
  const longest = Math.max(...runs)
  // WP4 dominant-topic balance: cap the column depth so a dominant topic (14
  // handoffs) wraps into more, shorter columns — a wide grid, not a tall strip
  const maxRows = Math.min(total, PANEL_MAX_COL_DEPTH)
  let best = 1
  let bestScore = Number.POSITIVE_INFINITY
  for (let rows = 1; rows <= maxRows; rows++) {
    const cols = runs.reduce((n, r) => n + Math.ceil(r / rows), 0)
    const rowsUsed = Math.min(rows, longest)
    if (total > 6 && total / (cols * rowsUsed) <= 0.55) continue // fragmented
    const w = (cols - 1) * TOPIC_COL_PITCH + NODE_W
    const h = (rowsUsed - 1) * NOTE_ROW_PITCH + NODE_H
    const score = Math.abs(Math.log(w / h / PANEL_ASPECT))
    if (score < bestScore - 1e-9) {
      best = rows
      bestScore = score
    }
  }
  return best
}

export interface AtlasBox {
  w: number
  h: number
}

/**
 * The card box a node renders (and is laid out) with. Projects are cluster
 * cards at overview and compact pills / panel headers at drilled levels;
 * everything else is the mini routing-slip card. Core layout and renderer
 * geometry MUST agree on this — it is the no-overlap contract.
 */
export function atlasNodeBox(node: { type: string }, level: 'overview' | 'learn' | 'deep'): AtlasBox {
  if (node.type !== 'project') return { w: NODE_W, h: NODE_H }
  return level === 'overview' ? { w: CLUSTER_W, h: CLUSTER_H } : { w: PILL_W, h: PILL_H }
}

// ── shared card/edge geometry (core layout tests + renderer canvas) ──────────

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Axis-aligned intersection — THE no-overlap test the layout is held to. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** Tight bounding box of a set of rects (null when empty). */
export function boundingRect(members: Rect[]): Rect | null {
  if (members.length === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const m of members) {
    minX = Math.min(minX, m.x)
    minY = Math.min(minY, m.y)
    maxX = Math.max(maxX, m.x + m.w)
    maxY = Math.max(maxY, m.y + m.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** The focused-cluster panel: bounding box of its members plus padding —
 *  drawn as one large white card (radius 16) behind them. Shared so the
 *  drilled-level invariant tests can hold chips clear of the panel card too. */
export function panelRect(members: Rect[]): Rect | null {
  const box = boundingRect(members)
  if (!box) return null
  return {
    x: box.x - PANEL_PAD,
    y: box.y - PANEL_PAD,
    w: box.w + PANEL_PAD * 2,
    h: box.h + PANEL_PAD * 2,
  }
}

/** The box a node draws with (the shared contract, as a positioned rect). */
export function nodeRect(
  node: { type: string; x: number; y: number },
  level: 'overview' | 'learn' | 'deep',
): Rect {
  const box = atlasNodeBox(node, level)
  return { x: node.x, y: node.y, w: box.w, h: box.h }
}

export interface OrthoRoute {
  /** polyline points, source anchor → target anchor (arrowhead at the end) */
  points: Array<{ x: number; y: number }>
}

const dedupePoints = (
  pts: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> =>
  pts.filter(
    (p, i) =>
      i === 0 ||
      p.x !== (pts[i - 1] as { x: number }).x ||
      p.y !== (pts[i - 1] as { y: number }).y,
  )

/** WP5 arrowhead standoff: the routed edge stops this many px short of the
 *  target card border so the arrowhead tip sits just OFF the card with a clean,
 *  consistent gap at every level (was flush — the tip kissed the card border). */
export const ARROW_STANDOFF = 8

/** Pull the final route vertex back toward the previous one by ARROW_STANDOFF so
 *  the arrowhead clears the target card border. Every route's last segment is a
 *  horizontal run into the card's left/right edge, so this only shifts x; a
 *  segment shorter than the standoff is left untouched (never reverses the
 *  arrow). Pure + deterministic — the tip lands ARROW_STANDOFF off the border. */
function insetArrowEnd(
  pts: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  if (pts.length < 2) return pts
  const end = pts[pts.length - 1] as { x: number; y: number }
  const prev = pts[pts.length - 2] as { x: number; y: number }
  const dx = end.x - prev.x
  const dy = end.y - prev.y
  const len = Math.hypot(dx, dy)
  if (len <= ARROW_STANDOFF) return pts
  const t = (len - ARROW_STANDOFF) / len
  return [...pts.slice(0, -1), { x: prev.x + dx * t, y: prev.y + dy * t }]
}

/**
 * Route an edge between two card rects with orthogonal elbows (H→V→H). The
 * vertical run always lives in a card-free channel: the gutter between lanes
 * for adjacent lanes, the corridor band above the target row for long spans,
 * and the channel left of the lane for same-lane pairs. `off` staggers
 * parallel edges between the same pair (±12px per lane); `stub` is how far
 * the route reaches into the channel (GUTTER/2 between lanes, smaller inside
 * panels).
 */
export function orthoRoute(a: Rect, b: Rect, off = 0, stub = GUTTER / 2): OrthoRoute {
  const ay = a.y + a.h / 2 + off
  const by = b.y + b.h / 2 + off
  const aRight = a.x + a.w
  const bRight = b.x + b.w

  if (b.x >= aRight + 8) {
    // forward: leave a's right edge, enter b's left edge
    const gap = b.x - aRight
    if (gap <= GUTTER * 1.5) {
      const cx = aRight + gap / 2 + off
      return {
        points: insetArrowEnd(dedupePoints([
          { x: aRight, y: ay },
          { x: cx, y: ay },
          { x: cx, y: by },
          { x: b.x, y: by },
        ])),
      }
    }
    // long span: travel the card-free corridor band just above the target row
    const cx1 = aRight + Math.min(stub, gap / 2) + off
    const cx2 = b.x - Math.min(stub, gap / 2) - off
    const corridorY = b.y - V_GAP / 2 + off
    return {
      points: insetArrowEnd(dedupePoints([
        { x: aRight, y: ay },
        { x: cx1, y: ay },
        { x: cx1, y: corridorY },
        { x: cx2, y: corridorY },
        { x: cx2, y: by },
        { x: b.x, y: by },
      ])),
    }
  }

  if (a.x >= bRight + 8) {
    // backward: leave a's left edge, enter b's right edge
    const gap = a.x - bRight
    if (gap <= GUTTER * 1.5) {
      const cx = bRight + gap / 2 - off
      return {
        points: insetArrowEnd(dedupePoints([
          { x: a.x, y: ay },
          { x: cx, y: ay },
          { x: cx, y: by },
          { x: bRight, y: by },
        ])),
      }
    }
    const cx1 = a.x - Math.min(stub, gap / 2) - off
    const cx2 = bRight + Math.min(stub, gap / 2) + off
    const corridorY = b.y - V_GAP / 2 + off
    return {
      points: insetArrowEnd(dedupePoints([
        { x: a.x, y: ay },
        { x: cx1, y: ay },
        { x: cx1, y: corridorY },
        { x: cx2, y: corridorY },
        { x: cx2, y: by },
        { x: bRight, y: by },
      ])),
    }
  }

  // same lane (x-overlap): loop out the left side through the lane's channel
  const lx = Math.min(a.x, b.x) - stub + off
  return {
    points: insetArrowEnd(dedupePoints([
      { x: a.x, y: ay },
      { x: lx, y: ay },
      { x: lx, y: by },
      { x: b.x, y: by },
    ])),
  }
}

/** Fan step between parallel edges of the same unordered pair: keeps two
 *  stacked directional lanes visually separated (24px). */
export const LANE_STEP = 24

/** Parallel edges between the same (unordered) node pair fan out ±LANE_STEP. */
export function laneOffsets(
  edges: ReadonlyArray<{ id: string; source: string; target: string }>,
): Map<string, number> {
  const groups = new Map<string, string[]>()
  for (const e of edges) {
    const key = [e.source, e.target].sort().join('⇄')
    const list = groups.get(key) ?? []
    list.push(e.id)
    groups.set(key, list)
  }
  const offsets = new Map<string, number>()
  for (const list of groups.values()) {
    list.sort()
    list.forEach((id, i) => offsets.set(id, (i - (list.length - 1) / 2) * LANE_STEP))
  }
  return offsets
}
