/**
 * Story 10.5: playback drives the story 10.3 navigation primitives — pure
 * decisions (auto-open cluster, expand topic atom, highlight + fit) plus the
 * fit-around geometry the canvas applies per step.
 */
import { describe, expect, it } from 'vitest'
import { NODE_H, NODE_W } from '../../../../shared/atlas-layout'
import type { TourStep } from '../../../../shared/types'
import { fitViewBoxAround } from './atlas-geometry'
import { clampStep, playbackActionFor } from './tour-playback'

const step = (over: Partial<TourStep> = {}): TourStep => ({
  title: 'a note',
  description: '',
  nodeIds: ['note:alpha/streaming/a'],
  project: 'alpha',
  topic: 'streaming',
  ...over,
})

describe('playbackActionFor', () => {
  it('auto-opens the owning project cluster from Overview', () => {
    const action = playbackActionFor(step(), 'overview', {})
    expect(action.navigateTo).toEqual({ level: 'learn', project: 'alpha' })
    expect(action.expandTopic).toBe('alpha/streaming')
    expect(action.highlight).toEqual(['note:alpha/streaming/a'])
  })

  it('navigates when the step lives in a different project than the scope', () => {
    const action = playbackActionFor(step(), 'learn', { project: 'beta' })
    expect(action.navigateTo).toEqual({ level: 'learn', project: 'alpha' })
  })

  it('stays put when the owning cluster is already open', () => {
    const action = playbackActionFor(step(), 'learn', { project: 'alpha' })
    expect(action.navigateTo).toBeNull()
    expect(action.expandTopic).toBe('alpha/streaming') // still expands the atom
  })

  it('handles steps without project/topic (never a crash)', () => {
    const action = playbackActionFor(step({ project: undefined, topic: undefined }), 'overview', {})
    expect(action.navigateTo).toBeNull()
    expect(action.expandTopic).toBeNull()
  })
})

describe('clampStep', () => {
  it('never walks off either end', () => {
    expect(clampStep(-1, 3)).toBe(0)
    expect(clampStep(0, 3)).toBe(0)
    expect(clampStep(2, 3)).toBe(2)
    expect(clampStep(3, 3)).toBe(2)
    expect(clampStep(5, 0)).toBe(0)
  })
})

describe('fitViewBoxAround', () => {
  const FIT_W = 1400 // the full-content fit width the zoom band centers on

  it('produces a viewBox containing every highlighted card, centered', () => {
    const targets = [
      { x: 100, y: 100, w: NODE_W, h: NODE_H },
      { x: 900, y: 500, w: NODE_W, h: NODE_H },
    ]
    const vb = fitViewBoxAround(targets, 1200, 800, FIT_W)
    expect(vb).not.toBeNull()
    if (!vb) return
    for (const t of targets) {
      expect(t.x).toBeGreaterThanOrEqual(vb.x)
      expect(t.y).toBeGreaterThanOrEqual(vb.y)
      expect(t.x + NODE_W).toBeLessThanOrEqual(vb.x + vb.w)
      expect(t.y + NODE_H).toBeLessThanOrEqual(vb.y + vb.h)
    }
    // centered on the set's bounding box
    const cx = (100 + 900 + NODE_W) / 2
    expect(vb.x + vb.w / 2).toBeCloseTo(cx, 5)
  })

  it('clamps single-node fits to the 2× zoom band (no vertigo zoom-in)', () => {
    const vb = fitViewBoxAround([{ x: 0, y: 0, w: NODE_W, h: NODE_H }], 1200, 800, FIT_W)
    expect(vb?.w).toBeGreaterThanOrEqual(FIT_W / 2)
  })

  it('returns null for an empty set (canvas keeps its viewport)', () => {
    expect(fitViewBoxAround([], 1200, 800, FIT_W)).toBeNull()
  })
})
