/**
 * BL-25: the composer grows UPWARD from a top-edge grip. The bounds are the
 * whole of the logic worth pinning — a drag must never shrink the box to
 * nothing, nor let it swallow the thread it sits under.
 */
import { describe, expect, it } from 'vitest'
import { clampComposer } from './AgentPanel'

describe('clampComposer', () => {
  it('keeps at least one line visible', () => {
    expect(clampComposer(-200, 1000)).toBe(32)
    expect(clampComposer(0, 1000)).toBe(32)
  })

  it('never exceeds 45% of the viewport — the thread keeps the rest', () => {
    expect(clampComposer(10_000, 1000)).toBe(450)
  })

  it('passes a sane height straight through', () => {
    expect(clampComposer(180, 1000)).toBe(180)
  })

  /** dragging UP means a smaller clientY, and must produce a TALLER box —
   *  the sign error that would make the grip feel inverted */
  it('drag-up arithmetic grows the box', () => {
    const startH = 100
    const startY = 500
    const movedUpTo = 440 // 60px up
    expect(clampComposer(startH + (startY - movedUpTo), 1000)).toBe(160)
  })
})
