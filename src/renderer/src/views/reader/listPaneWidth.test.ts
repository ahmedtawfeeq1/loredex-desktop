/**
 * Story epic17.4 — list-pane width clamp: the pure [200, 480] band with a
 * 300px default fallback, shared by the drag handle, the store, and core
 * persistence.
 */
import { describe, expect, it } from 'vitest'
import {
  clampListWidth,
  DEFAULT_LIST_WIDTH,
  MAX_LIST_WIDTH,
  MIN_LIST_WIDTH,
} from './listPaneWidth'

describe('clampListWidth — the 200–480 band', () => {
  it('leaves a width inside the band untouched (rounded)', () => {
    expect(clampListWidth(300)).toBe(300)
    expect(clampListWidth(250.4)).toBe(250)
    expect(clampListWidth(399.6)).toBe(400)
  })

  it('floors below the minimum to 200', () => {
    expect(clampListWidth(0)).toBe(MIN_LIST_WIDTH)
    expect(clampListWidth(199)).toBe(200)
    expect(clampListWidth(-500)).toBe(200)
  })

  it('ceils above the maximum to 480', () => {
    expect(clampListWidth(481)).toBe(MAX_LIST_WIDTH)
    expect(clampListWidth(2000)).toBe(480)
  })

  it('the exact edges are in-band', () => {
    expect(clampListWidth(MIN_LIST_WIDTH)).toBe(200)
    expect(clampListWidth(MAX_LIST_WIDTH)).toBe(480)
  })

  it('a non-finite input falls back to the 300px default', () => {
    expect(clampListWidth(Number.NaN)).toBe(DEFAULT_LIST_WIDTH)
    expect(clampListWidth(Number.POSITIVE_INFINITY)).toBe(DEFAULT_LIST_WIDTH)
    expect(clampListWidth(undefined as unknown as number)).toBe(DEFAULT_LIST_WIDTH)
  })
})
