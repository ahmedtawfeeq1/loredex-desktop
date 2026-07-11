/**
 * Handoff-velocity paired bar geometry (epic25, D1 amendment 9): given per-day
 * created/consumed counts, lay out two grouped, rounded-top bars per day inside
 * a coordinate viewBox with a y-grid and an x-tick per day. Pure — returns
 * plain numbers the SVG component maps straight to <rect>/<line>; no DOM.
 */
import { linearY, niceScale, px } from './scales'

export interface VelDatum {
  day: string
  created: number
  consumed: number
}

export type VelSeries = 'created' | 'consumed'

export interface VelBar {
  x: number
  y: number
  w: number
  h: number
  series: VelSeries
  day: string
  value: number
  /** group center — the hover-band + tick anchor */
  cx: number
}

export interface VelGrid {
  y: number
  value: number
}

export interface VelLayout {
  w: number
  h: number
  bars: VelBar[]
  grid: VelGrid[]
  max: number
  /** per-day group centers, for hover bands + x labels */
  groups: { day: string; cx: number; x0: number; x1: number }[]
  plot: { top: number; bottom: number; left: number; right: number }
}

export interface VelOpts {
  w?: number
  h?: number
  padLeft?: number
  padRight?: number
  padTop?: number
  padBottom?: number
  /** bar width as a fraction of half the group slot */
  barFrac?: number
}

/** Lay out the velocity bar chart. Deterministic given the same data + opts. */
export function velocityBars(data: readonly VelDatum[], opts: VelOpts = {}): VelLayout {
  const w = opts.w ?? 320
  const h = opts.h ?? 150
  const left = opts.padLeft ?? 24
  const right = opts.padRight ?? 8
  const top = opts.padTop ?? 8
  const bottom = h - (opts.padBottom ?? 18)
  const barFrac = opts.barFrac ?? 0.72

  const dataMax = Math.max(0, ...data.flatMap((d) => [d.created, d.consumed]))
  const { max, ticks } = niceScale(dataMax, 5)

  const grid: VelGrid[] = ticks.map((v) => ({ value: v, y: px(linearY(v, max, top, bottom)) }))

  const n = Math.max(1, data.length)
  const slot = (w - left - right) / n
  const barW = px((slot * barFrac) / 2)
  const bars: VelBar[] = []
  const groups: VelLayout['groups'] = []

  data.forEach((d, i) => {
    const x0 = left + i * slot
    const cx = px(x0 + slot / 2)
    groups.push({ day: d.day, cx, x0: px(x0), x1: px(x0 + slot) })
    // created sits just left of center, consumed just right — a 1u gutter between
    const gap = 1
    const pairs: Array<[VelSeries, number, number]> = [
      ['created', d.created, cx - gap - barW],
      ['consumed', d.consumed, cx + gap],
    ]
    for (const [series, value, x] of pairs) {
      const y = value <= 0 ? bottom : linearY(value, max, top, bottom)
      bars.push({
        series,
        day: d.day,
        value,
        x: px(x),
        y: px(y),
        w: barW,
        h: px(bottom - y),
        cx,
      })
    }
  })

  return { w, h, bars, grid, max, groups, plot: { top, bottom, left, right } }
}
