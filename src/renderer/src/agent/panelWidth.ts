/**
 * Resizable agent-panel width (acp blueprint; clone of the reader's
 * listPaneWidth.ts): the right-dock agent panel drags between 280 and 480px,
 * double-click resets to 340. Pure clamp so the store, the drag handle, and
 * the core persistence all round-trip through ONE definition — no drift.
 */

export const MIN_PANEL_WIDTH = 280
export const MAX_PANEL_WIDTH = 480
export const DEFAULT_PANEL_WIDTH = 340

/**
 * Clamp a proposed pixel width to the [280, 480] band, rounded to a whole px.
 * A non-finite value (undefined stored row, NaN mid-drag) falls back to the
 * 340px default so a bad input never produces a broken panel.
 */
export function clampPanelWidth(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_PANEL_WIDTH
  return Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(px)))
}
