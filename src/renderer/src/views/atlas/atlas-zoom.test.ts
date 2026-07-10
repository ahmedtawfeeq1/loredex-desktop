/**
 * D1 amendment 5 (epic19.1) — trackpad-native atlas navigation. Pure viewBox
 * math for pinch/pan + the +/− / fit / 1:1 pills, and the command bus that lets
 * the ⌘=/⌘−/⌘0 registry actions drive the mounted canvas. No DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZOOM_MAX_SCALE, ZOOM_MIN_SCALE } from '../../../../shared/atlas-layout'
import { useApp } from '../../stores/app'
import { appActions } from '../../actions/registry'
import { type ViewBox, zoomViewBox } from './atlas-geometry'
import {
  dispatchZoom,
  resetOneToOne,
  setZoomHandler,
  wheelPan,
  wheelZoomFactor,
  ZOOM_STEP,
  zoomAtCenter,
} from './atlas-zoom'

const FIT_W = 1000
const base: ViewBox = { x: 0, y: 0, w: 1000, h: 750 }

describe('zoomAtCenter (+/− pills)', () => {
  it('zooms IN about the viewport centre and keeps the centre fixed', () => {
    const cx = base.x + base.w / 2
    const cy = base.y + base.h / 2
    const zoomed = zoomAtCenter(base, 'in', FIT_W)
    expect(zoomed.w).toBeCloseTo(base.w / ZOOM_STEP, 5) // smaller viewBox = closer
    expect(zoomed.x + zoomed.w / 2).toBeCloseTo(cx, 5)
    expect(zoomed.y + zoomed.h / 2).toBeCloseTo(cy, 5)
  })

  it('zooms OUT to a wider viewBox', () => {
    const out = zoomAtCenter(base, 'out', FIT_W)
    expect(out.w).toBeCloseTo(base.w * ZOOM_STEP, 5)
  })

  it('clamps at the shared 0.4×–2.5× band no matter how many clicks', () => {
    let vb = base
    for (let i = 0; i < 40; i++) vb = zoomAtCenter(vb, 'in', FIT_W)
    expect(vb.w).toBeCloseTo(FIT_W / ZOOM_MAX_SCALE, 5) // most zoomed in
    vb = base
    for (let i = 0; i < 40; i++) vb = zoomAtCenter(vb, 'out', FIT_W)
    expect(vb.w).toBeCloseTo(FIT_W / ZOOM_MIN_SCALE, 5) // most zoomed out
  })
})

describe('cursor-anchored zoom (pinch)', () => {
  it('holds the point under the cursor fixed while zooming', () => {
    const atX = 620
    const atY = 300
    const zoomed = zoomViewBox(base, wheelZoomFactor(-1), atX, atY, FIT_W) // pinch-in
    expect(zoomed.w).toBeLessThan(base.w)
    // the SVG point beneath the cursor maps to the same fraction of the viewBox
    const beforeFracX = (atX - base.x) / base.w
    const afterFracX = (atX - zoomed.x) / zoomed.w
    expect(afterFracX).toBeCloseTo(beforeFracX, 5)
    const beforeFracY = (atY - base.y) / base.h
    const afterFracY = (atY - zoomed.y) / zoomed.h
    expect(afterFracY).toBeCloseTo(beforeFracY, 5)
  })

  it('wheelZoomFactor: scroll-up zooms in (<1), scroll-down zooms out (>1)', () => {
    expect(wheelZoomFactor(-1)).toBeLessThan(1)
    expect(wheelZoomFactor(1)).toBeGreaterThan(1)
  })
})

describe('wheelPan (two-finger scroll)', () => {
  const pxToSvg = 2 // viewBox is 2× the pane in px

  it('applies scaled deltas to the viewBox origin, size untouched', () => {
    const panned = wheelPan(base, 10, -20, false, pxToSvg)
    expect(panned).toEqual({ x: 20, y: -40, w: base.w, h: base.h })
  })

  it('shift maps a vertical wheel onto the horizontal axis', () => {
    const panned = wheelPan(base, 0, 15, true, pxToSvg)
    expect(panned.x).toBe(30) // deltaY drove x…
    expect(panned.y).toBe(0) // …and y stayed put
  })

  it('a wheel that already carries deltaX is left on its own axes under shift', () => {
    const panned = wheelPan(base, 5, 15, true, pxToSvg)
    expect(panned).toEqual({ x: 10, y: 30, w: base.w, h: base.h })
  })
})

describe('resetOneToOne (1:1 pill)', () => {
  it('sets the viewBox width to the pane width (100%), centred', () => {
    const paneW = 700 // inside the band for FIT_W=1000 → [400, 2500]
    const reset = resetOneToOne(base, paneW, FIT_W)
    expect(reset.w).toBeCloseTo(paneW, 5)
    expect(reset.x + reset.w / 2).toBeCloseTo(base.x + base.w / 2, 5)
  })

  it('still respects the zoom band when 1:1 would exceed it', () => {
    const tiny = 100 // 1:1 would be past 2.5× → clamps to FIT_W / ZOOM_MAX_SCALE
    expect(resetOneToOne(base, tiny, FIT_W).w).toBeCloseTo(FIT_W / ZOOM_MAX_SCALE, 5)
  })
})

describe('zoom command bus', () => {
  afterEach(() => setZoomHandler(() => {})())

  it('dispatchZoom reaches the registered handler; unbind stops it', () => {
    const seen: string[] = []
    const unbind = setZoomHandler((c) => seen.push(c))
    dispatchZoom('in')
    dispatchZoom('fit')
    expect(seen).toEqual(['in', 'fit'])
    unbind()
    dispatchZoom('out') // no handler → no-op, no throw
    expect(seen).toEqual(['in', 'fit'])
  })

  it('a stale unbind never clears a newer handler', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unbindA = setZoomHandler(a)
    setZoomHandler(b) // b replaces a
    unbindA() // must NOT clear b
    dispatchZoom('reset')
    expect(b).toHaveBeenCalledWith('reset')
    expect(a).not.toHaveBeenCalled()
  })
})

describe('control → action wiring (registry ⌘=/⌘−/⌘0)', () => {
  beforeEach(() => useApp.setState({ view: 'atlas' }))
  afterEach(() => {
    setZoomHandler(() => {})()
    useApp.setState({ view: 'home' })
  })

  const run = (id: string): void => {
    appActions()
      .find((a) => a.id === id)
      ?.run()
  }

  it('each pill action dispatches its zoom command while the Atlas is open', () => {
    const seen: string[] = []
    setZoomHandler((c) => seen.push(c))
    run('action:zoom-in')
    run('action:zoom-out')
    run('action:zoom-fit')
    expect(seen).toEqual(['in', 'out', 'fit'])
  })

  it('the actions carry their shortcut hints + unique meta combos', () => {
    const byId = new Map(appActions().map((a) => [a.id, a]))
    expect(byId.get('action:zoom-in')?.shortcut).toBe('⌘=')
    expect(byId.get('action:zoom-in')?.combo).toEqual({ key: '=', meta: true })
    expect(byId.get('action:zoom-out')?.combo).toEqual({ key: '-', meta: true })
    expect(byId.get('action:zoom-fit')?.combo).toEqual({ key: '0', meta: true })
  })

  it('no dispatch when the Atlas is not the active view', () => {
    useApp.setState({ view: 'home' })
    const handler = vi.fn()
    setZoomHandler(handler)
    run('action:zoom-fit')
    expect(handler).not.toHaveBeenCalled()
  })
})
