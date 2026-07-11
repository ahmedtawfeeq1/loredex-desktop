/**
 * Pure chart scale helpers (epic25, D1 amendment 9): the geometry every
 * hand-built SVG chart on Home shares — nice-rounded axis maxima, evenly
 * spaced y-ticks, and a linear value→pixel map. No DOM, no chart lib; every
 * function is deterministic and unit-tested against fixed inputs so the charts
 * can be reasoned about without rendering.
 */

/** A "nice" number ≥ `x` (round=false) or nearest nice (round=true) — the
 *  classic Graphics-Gems axis-labelling primitive. */
export function niceNum(x: number, round: boolean): number {
  if (x <= 0) return 0
  const exp = Math.floor(Math.log10(x))
  const f = x / 10 ** exp
  let nf: number
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nf * 10 ** exp
}

export interface NiceScale {
  /** the axis top — a nice multiple ≥ the data max */
  max: number
  /** the tick step */
  step: number
  /** tick values 0…max inclusive, ascending */
  ticks: number[]
}

/** A nice 0-based scale covering `dataMax` in roughly `tickCount` steps. An
 *  all-zero series still yields a usable unit axis (0…1) — never a flat line. */
export function niceScale(dataMax: number, tickCount = 5): NiceScale {
  if (!(dataMax > 0)) return { max: 1, step: 1, ticks: [0, 1] }
  const range = niceNum(dataMax, false)
  const step = niceNum(range / Math.max(1, tickCount - 1), true) || 1
  const max = Math.ceil(dataMax / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return { max, step, ticks }
}

/** Map a value in [0, max] to a y pixel in a plot band [top, bottom] (inverted:
 *  0 → bottom, max → top). Values are clamped to the band. */
export function linearY(value: number, max: number, top: number, bottom: number): number {
  if (max <= 0) return bottom
  const t = Math.min(1, Math.max(0, value / max))
  return bottom - t * (bottom - top)
}

/** Round to 2dp for compact, stable SVG coordinate strings. */
export function px(n: number): number {
  return Math.round(n * 100) / 100
}
