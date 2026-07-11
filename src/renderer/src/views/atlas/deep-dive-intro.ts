/**
 * Deep Dive self-explanation (Atlas reframe WP3, spec §Deep Dive). The graph is
 * the lineage view — it must say so on sight. Two pure pieces the DeepDiveIntro
 * component renders, kept here so the copy + the inline key are unit-testable
 * without a DOM (mirrors atlas-toolbar.ts / atlas-legend.ts):
 *  - a persistent one-line PURPOSE header, and
 *  - a tiny always-visible inline KEY (not only the `?` modal).
 */

/** The one-line purpose header above the Deep-Dive canvas (WP3 verbatim). */
export const DEEP_PURPOSE =
  'Trace how work and knowledge connect across your projects — click a node to open it; use Path to trace how one thing reaches another.'

export interface DeepKeyItem {
  /** the visual mark this row explains (glyph stand-in for the SVG encoding) */
  mark: string
  /** what that mark means on the canvas */
  meaning: string
}

/** The compact legend row: arrow = handoff · thickness = volume · dot = open ·
 *  dashed = affinity. Always visible at Deep Dive, so the encoding never hides
 *  behind the `?` popover. */
export const DEEP_KEY_ITEMS: ReadonlyArray<DeepKeyItem> = [
  { mark: '→', meaning: 'handoff' },
  { mark: '≡', meaning: 'volume' },
  { mark: '•', meaning: 'open' },
  { mark: '– –', meaning: 'affinity' },
]
