/**
 * Pure chart geometry (epic25, D1 amendment 9): scales, velocity paired bars,
 * and the backlog area path — verified as numbers/strings, no DOM. The
 * fixture-integration cases feed the real nimbus velocity buckets through the
 * layout so the charts are pinned to the same ground truth as insights.ts.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ActivityEvent } from '../../../../../shared/types'
import { velocitySeries } from '../insights'
import { backlogArea } from './backlog-area'
import { linearY, niceNum, niceScale } from './scales'
import { velocityBars } from './velocity-bars'

const activity = JSON.parse(
  readFileSync(join(import.meta.dirname, '../fixtures/nimbus-activity.json'), 'utf8'),
) as ActivityEvent[]
const TODAY = '2026-07-10'

describe('scales', () => {
  it('niceNum rounds up (round=false) and to-nearest (round=true)', () => {
    expect(niceNum(0, false)).toBe(0)
    expect(niceNum(3, false)).toBe(5)
    expect(niceNum(8, false)).toBe(10)
    expect(niceNum(21, false)).toBe(50)
    expect(niceNum(12.5, true)).toBe(10)
  })

  it('niceScale covers the data max with round ticks from zero', () => {
    expect(niceScale(21, 5)).toEqual({ max: 30, step: 10, ticks: [0, 10, 20, 30] })
    expect(niceScale(8, 5).ticks).toEqual([0, 2, 4, 6, 8])
    // every scale starts at 0 and ends ≥ the data max
    const s = niceScale(37)
    expect(s.ticks[0]).toBe(0)
    expect(s.max).toBeGreaterThanOrEqual(37)
  })

  it('an all-zero series yields a usable unit axis, never a flat divide-by-zero', () => {
    expect(niceScale(0)).toEqual({ max: 1, step: 1, ticks: [0, 1] })
    expect(linearY(0, 0, 8, 100)).toBe(100) // degenerate max → baseline
  })

  it('linearY inverts value→pixel and clamps to the band', () => {
    expect(linearY(0, 10, 8, 108)).toBe(108) // 0 → bottom
    expect(linearY(10, 10, 8, 108)).toBe(8) // max → top
    expect(linearY(5, 10, 8, 108)).toBe(58) // midpoint
    expect(linearY(20, 10, 8, 108)).toBe(8) // clamped
  })
})

describe('velocity paired bars', () => {
  const data = [
    { day: '2026-07-08', created: 2, consumed: 1 },
    { day: '2026-07-09', created: 0, consumed: 3 },
    { day: '2026-07-10', created: 4, consumed: 0 },
  ]

  it('lays out two bars per day, created left of consumed around the group center', () => {
    const lay = velocityBars(data, { w: 320, h: 150 })
    expect(lay.bars).toHaveLength(6)
    expect(lay.groups).toHaveLength(3)
    for (const g of lay.groups) {
      const pair = lay.bars.filter((b) => b.day === g.day)
      const created = pair.find((b) => b.series === 'created')!
      const consumed = pair.find((b) => b.series === 'consumed')!
      expect(created.x).toBeLessThan(g.cx)
      expect(consumed.x).toBeGreaterThanOrEqual(g.cx)
    }
  })

  it('bar heights are proportional; a zero value has zero height sitting on the baseline', () => {
    const lay = velocityBars(data)
    const zero = lay.bars.find((b) => b.value === 0)!
    expect(zero.h).toBe(0)
    expect(zero.y).toBe(lay.plot.bottom)
    // the data max is 4; the nice axis lands exactly on it, so value-4 bars top out
    expect(lay.max).toBe(4)
    const tall = lay.bars.find((b) => b.value === 4)!
    const short = lay.bars.find((b) => b.value === 2)!
    expect(tall.y).toBe(lay.plot.top) // value === max reaches the top
    expect(tall.h / short.h).toBeCloseTo(2) // 4 vs 2 within the same scale
  })

  it('the grid ticks come from the nice scale', () => {
    const lay = velocityBars(data)
    expect(lay.grid.map((g) => g.value)).toEqual(niceScale(4).ticks)
  })

  it('an empty series still produces a valid unit-axis layout (no crash)', () => {
    const lay = velocityBars([])
    expect(lay.bars).toHaveLength(0)
    expect(lay.max).toBe(1)
    expect(lay.grid.length).toBeGreaterThan(0)
  })

  it('integration: the real nimbus 7-day velocity buckets lay out 14 bars', () => {
    const lay = velocityBars(velocitySeries(activity, TODAY, 7))
    expect(lay.bars).toHaveLength(14) // 7 days × 2 series
    expect(lay.max).toBeGreaterThanOrEqual(13) // max daily created (13) fits under the axis
  })
})

describe('backlog area path', () => {
  const data = [
    { day: 'a', value: 1 },
    { day: 'b', value: 4 },
    { day: 'c', value: 2 },
    { day: 'd', value: 10 },
  ]

  it('samples one point per datum, x strictly increasing left→right', () => {
    const lay = backlogArea(data, { w: 320, h: 130 })
    expect(lay.points).toHaveLength(4)
    for (let i = 1; i < lay.points.length; i++) {
      expect(lay.points[i]!.x).toBeGreaterThan(lay.points[i - 1]!.x)
    }
    expect(lay.points[0]!.x).toBe(lay.plot.left)
    expect(lay.points.at(-1)!.x).toBe(lay.plot.right)
  })

  it('higher value maps to a smaller y (inverted axis); the dot is the last point', () => {
    const lay = backlogArea(data)
    const byDay = Object.fromEntries(lay.points.map((p) => [p.day, p]))
    expect(byDay.d!.y).toBeLessThan(byDay.a!.y) // value 10 higher up than value 1
    expect(lay.dot).toEqual(lay.points.at(-1))
    expect(lay.dot.value).toBe(10)
  })

  it('builds a smooth line path (M…C…) and a closed area path (…Z)', () => {
    const lay = backlogArea(data)
    expect(lay.linePath.startsWith('M ')).toBe(true)
    expect(lay.linePath).toContain(' C ')
    expect(lay.areaPath.endsWith(' Z')).toBe(true)
    // area starts by tracing the line
    expect(lay.areaPath.startsWith(lay.linePath)).toBe(true)
  })

  it('a single point centers and emits a moveto with no curve', () => {
    const lay = backlogArea([{ day: 'x', value: 5 }])
    expect(lay.points).toHaveLength(1)
    expect(lay.linePath).toMatch(/^M [\d.]+ [\d.]+$/)
    expect(lay.dot.day).toBe('x')
  })

  it('an empty series produces empty paths without throwing', () => {
    const lay = backlogArea([])
    expect(lay.linePath).toBe('')
    expect(lay.areaPath).toBe('')
    expect(lay.points).toHaveLength(0)
  })
})
