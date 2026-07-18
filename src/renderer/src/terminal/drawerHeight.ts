/**
 * Terminal drawer height clamp (terminal-splits blueprint 2026-07-18) —
 * listPaneWidth.ts pattern: ONE pure definition the store, the drag handle,
 * and the core persistence band all agree on (core/settings.ts keeps its own
 * copy of the same numbers, defensive-clamp doctrine).
 */

export const MIN_TERM_HEIGHT = 120
export const MAX_TERM_HEIGHT = 600
export const DEFAULT_TERM_HEIGHT = 280

/**
 * Clamp a proposed pixel height to the [120, 600] band, rounded to a whole px.
 * A non-finite value (missing stored row, NaN mid-drag) falls back to the
 * 280px default so a bad input never produces a broken drawer.
 */
export function clampTermHeight(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_TERM_HEIGHT
  return Math.min(MAX_TERM_HEIGHT, Math.max(MIN_TERM_HEIGHT, Math.round(px)))
}
