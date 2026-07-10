/**
 * Resizable list pane (story epic17.4, DESIGN.md "D1 amendment 3 — Resizable
 * list pane"): the file-list/reader divider drags between 200 and 480px,
 * double-click resets to 300. Pure clamp so the store, the drag handle, and
 * the core persistence all round-trip through ONE definition — no drift.
 */

export const MIN_LIST_WIDTH = 200
export const MAX_LIST_WIDTH = 480
export const DEFAULT_LIST_WIDTH = 300

/**
 * Clamp a proposed pixel width to the [200, 480] band, rounded to a whole px.
 * A non-finite value (undefined stored row, NaN mid-drag) falls back to the
 * 300px default so a bad input never produces a broken pane.
 */
export function clampListWidth(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_LIST_WIDTH
  return Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, Math.round(px)))
}
