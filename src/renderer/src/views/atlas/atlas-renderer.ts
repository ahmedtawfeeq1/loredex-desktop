/**
 * Atlas reframe WP4 (spec §Navigation glue) — the pure level→renderer mapping.
 * The segmented control switches the LEVEL; this one function decides which
 * surface a given level renders, so the routing is a single testable cell table
 * instead of booleans scattered through AtlasView. Overview shows the readable
 * launcher by default and the SVG topology only under the Flow-view toggle;
 * Learn is always the readable project page; Deep Dive is always the graph.
 */
import type { AtlasLevel } from '../../../../shared/types'

/** launcher = Overview card grid · page = Learn project page · graph = SVG canvas. */
export type AtlasRenderer = 'launcher' | 'page' | 'graph'

/**
 * Which renderer a level maps to. `flowView` only matters at Overview (the
 * Flow-view toggle); Learn and Deep Dive ignore it — Learn is always the page,
 * Deep Dive is always the graph.
 */
export function atlasRenderer(level: AtlasLevel, flowView: boolean): AtlasRenderer {
  if (level === 'learn') return 'page'
  if (level === 'overview') return flowView ? 'graph' : 'launcher'
  return 'graph' // deep
}
