/**
 * Agent-panel width clamp (clone of listPaneWidth.test.ts): the pure [280, 480]
 * band with a 340px default fallback, shared by the drag handle, the store, and
 * core persistence.
 */
import { describe, expect, it } from 'vitest'
import {
  clampPanelWidth,
  DEFAULT_PANEL_WIDTH,
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
} from './panelWidth'

describe('clampPanelWidth — the 280–480 band', () => {
  it('leaves a width inside the band untouched (rounded)', () => {
    expect(clampPanelWidth(340)).toBe(340)
    expect(clampPanelWidth(300.4)).toBe(300)
    expect(clampPanelWidth(399.6)).toBe(400)
  })

  it('floors below the minimum to 280', () => {
    expect(clampPanelWidth(0)).toBe(MIN_PANEL_WIDTH)
    expect(clampPanelWidth(279)).toBe(280)
    expect(clampPanelWidth(-500)).toBe(280)
  })

  it('ceils above the maximum to 480', () => {
    expect(clampPanelWidth(481)).toBe(MAX_PANEL_WIDTH)
    expect(clampPanelWidth(2000)).toBe(480)
  })

  it('the exact edges are in-band', () => {
    expect(clampPanelWidth(MIN_PANEL_WIDTH)).toBe(280)
    expect(clampPanelWidth(MAX_PANEL_WIDTH)).toBe(480)
  })

  it('a non-finite input falls back to the 340px default', () => {
    expect(clampPanelWidth(Number.NaN)).toBe(DEFAULT_PANEL_WIDTH)
    expect(clampPanelWidth(Number.POSITIVE_INFINITY)).toBe(DEFAULT_PANEL_WIDTH)
    expect(clampPanelWidth(undefined as unknown as number)).toBe(DEFAULT_PANEL_WIDTH)
  })
})
