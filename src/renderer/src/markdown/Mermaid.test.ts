/**
 * The two bits of the diagram viewer that are arithmetic, not layout:
 *
 * 1. FIT — reported twice: first the diagram rendered as a postage stamp in a
 *    huge box, then it "fit" but still had a scrollbar with the last row cut
 *    off (a CSS max-height disagreeing with the fit budget). The invariant is
 *    the one worth pinning: after a fit, nothing overflows.
 * 2. INK — a note's mermaid carries author colors picked on mermaid.live's
 *    light canvas; under the dark theme those pastel nodes got white labels.
 */
import { describe, expect, it } from 'vitest'
import { fitScale, fittedBoxHeight, heightBudget, labelInk } from './Mermaid'

const PAD_Y = 46

describe('fit', () => {
  it('shows the whole diagram — width AND height, never overflowing', () => {
    const box = { w: 2400, h: 1500 } // a wide pipeline flowchart
    const s = fitScale(box, 900, 600)
    expect(box.w * s).toBeLessThanOrEqual(900)
    expect(box.h * s).toBeLessThanOrEqual(600)
  })

  it('grows a small diagram to fill the box instead of leaving a postage stamp', () => {
    // mermaid lays a simple graph out at a few hundred px; the reader is wide
    expect(fitScale({ w: 320, h: 180 }, 1200, 600)).toBeGreaterThan(2)
  })

  it('binds on the tall axis for a sequence diagram', () => {
    const s = fitScale({ w: 800, h: 4000 }, 1200, 600)
    expect(4000 * s).toBeLessThanOrEqual(600)
  })

  it('the box wraps the fitted diagram exactly — no scrollbar at fit', () => {
    const box = { w: 2400, h: 1500 }
    const budget = heightBudget(1000, false)
    const s = fitScale(box, 900, budget - PAD_Y)
    const h = fittedBoxHeight(box.h, s, budget)
    // content + padding fits inside the box the component sets
    expect(Math.ceil(box.h * s) + PAD_Y).toBeLessThanOrEqual(h)
    expect(h).toBeLessThanOrEqual(budget)
  })

  it('stops growing at the budget once zoomed past fit', () => {
    const budget = heightBudget(1000, false)
    expect(fittedBoxHeight(1500, 4, budget)).toBe(budget)
  })

  it('fullscreen spends the whole window', () => {
    expect(heightBudget(1000, true)).toBe(1000)
    expect(heightBudget(1000, false)).toBeLessThan(1000)
  })

  it('a short window still gets a usable box', () => {
    expect(heightBudget(400, false)).toBe(360)
  })
})

describe('label ink follows the fill, not the theme', () => {
  it('darkens labels on the pastel fills notes actually use', () => {
    expect(labelInk('#f8d7da')).toBe('#101828') // pink  — style S7 fill:#f8d7da
    expect(labelInk('#d4edda')).toBe('#101828') // green — WON
    expect(labelInk('#fff3cd')).toBe('#101828') // amber
    expect(labelInk('#e2e3e5')).toBe('#101828') // grey  — LOST
  })

  it('keeps light labels on dark fills, and reads short hex and rgb()', () => {
    expect(labelInk('#123')).toBe('#f2f4f8')
    expect(labelInk('rgb(20, 24, 38)')).toBe('#f2f4f8')
    expect(labelInk('#ffffff')).toBe('#101828')
  })

  it('leaves mermaid-themed nodes alone', () => {
    expect(labelInk(null)).toBeNull()
    expect(labelInk('')).toBeNull()
    expect(labelInk('none')).toBeNull()
    expect(labelInk('url(#grad)')).toBeNull()
  })
})
