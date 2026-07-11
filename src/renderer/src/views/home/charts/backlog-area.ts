/**
 * Backlog / throughput area-chart geometry (epic25, D1 amendment 9): given a
 * per-day series, build a smooth (Catmull-Rom → cubic-bezier) line path, the
 * closed area path under it, evenly spaced sample points (for the hover
 * crosshair) and the current-value dot. Pure string/number building — no DOM,
 * unit-tested on the shape of the path, not a rendered pixel.
 */
import { linearY, niceScale, px } from './scales'

export interface AreaDatum {
  day: string
  value: number
}

export interface AreaPoint {
  x: number
  y: number
  day: string
  value: number
}

export interface AreaGrid {
  y: number
  value: number
}

export interface AreaLayout {
  w: number
  h: number
  /** the smooth line path (starts with M, curves with C) */
  linePath: string
  /** the closed area under the line (line + down to baseline + back) */
  areaPath: string
  points: AreaPoint[]
  /** newest point — the labelled dot */
  dot: AreaPoint
  grid: AreaGrid[]
  max: number
  plot: { top: number; bottom: number; left: number; right: number }
}

export interface AreaOpts {
  w?: number
  h?: number
  padLeft?: number
  padRight?: number
  padTop?: number
  padBottom?: number
  /** Catmull-Rom tension smoothing, 0 = straight, 1 = round; default 0.5 */
  tension?: number
}

/** Sample points across the plot band, one per datum, left→right. */
function samplePoints(
  data: readonly AreaDatum[],
  max: number,
  left: number,
  right: number,
  top: number,
  bottom: number,
): AreaPoint[] {
  const n = Math.max(1, data.length - 1)
  const span = right - left
  return data.map((d, i) => ({
    x: px(data.length === 1 ? (left + right) / 2 : left + (span * i) / n),
    y: px(linearY(d.value, max, top, bottom)),
    day: d.day,
    value: d.value,
  }))
}

/** Catmull-Rom spline through the points, emitted as cubic-bezier segments. */
function smoothPath(pts: readonly AreaPoint[], tension: number): string {
  if (pts.length === 0) return ''
  const first = pts[0] as AreaPoint
  if (pts.length === 1) return `M ${first.x} ${first.y}`
  let d = `M ${first.x} ${first.y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[i + 2] ?? p2
    const c1x = px(p1.x + ((p2.x - p0.x) / 6) * tension)
    const c1y = px(p1.y + ((p2.y - p0.y) / 6) * tension)
    const c2x = px(p2.x - ((p3.x - p1.x) / 6) * tension)
    const c2y = px(p2.y - ((p3.y - p1.y) / 6) * tension)
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

/** Lay out the backlog area chart. Deterministic given the same data + opts. */
export function backlogArea(data: readonly AreaDatum[], opts: AreaOpts = {}): AreaLayout {
  const w = opts.w ?? 320
  const h = opts.h ?? 130
  const left = opts.padLeft ?? 24
  const right = w - (opts.padRight ?? 8)
  const top = opts.padTop ?? 8
  const bottom = h - (opts.padBottom ?? 18)
  const tension = opts.tension ?? 0.5

  const dataMax = Math.max(0, ...data.map((d) => d.value))
  const { max, ticks } = niceScale(dataMax, 4)
  const grid: AreaGrid[] = ticks.map((v) => ({ value: v, y: px(linearY(v, max, top, bottom)) }))

  const points = samplePoints(data, max, left, right, top, bottom)
  const linePath = smoothPath(points, tension)
  const last = points[points.length - 1] ?? { x: px((left + right) / 2), y: bottom, day: '', value: 0 }
  const firstX = points[0]?.x ?? left
  const areaPath =
    points.length === 0 ? '' : `${linePath} L ${last.x} ${px(bottom)} L ${firstX} ${px(bottom)} Z`

  return { w, h, linePath, areaPath, points, dot: last, grid, max, plot: { top, bottom, left, right } }
}
