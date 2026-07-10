/**
 * Atlas layout constants shared by the core-side layout (story 10.1) and the
 * renderer's SVG geometry (story 10.2). Positions are computed core-side; the
 * renderer only needs the card box and grid metrics to draw and fit.
 */

/** mini routing-slip card box (DESIGN.md data-visualizations spec) */
export const NODE_W = 200
export const NODE_H = 84
/** overview cluster columns: left→right by route-dependency depth */
export const COL_W = 300
export const ROW_H = 130
export const MARGIN = 40
