/**
 * WP-D — Learn relationship strip (atlas-graph-research §Learn; Linear/GitHub
 * relations-as-list). A compact summary of the focused project's neighbor
 * handoff flow, derived from the aggregated route edges touching it: inbound
 * `← N from <project>` and outbound `→ N to <project>`. This replaces the
 * crossing neighbor-edge labels — the strip is the readable list, the canvas
 * connectors go thin/hover-only. Pure over the edge list, so it unit-tests
 * against the nimbus fixture without a DOM.
 */
import type { AtlasEdge } from './types'

/** aggregated-route edge fields the strip reads (openCount/totalCount/blocking
 *  are carried by the overview aggregated edges — core/atlas.ts step 13). */
type RouteEdge = Pick<
  AtlasEdge,
  'source' | 'target' | 'category' | 'openCount' | 'totalCount' | 'blocking'
>

/** One neighbor lane summarized as a chip. `project` is the neighbor on the
 *  other end (the drill/select target); `total`/`open` are the lane's handoff
 *  counts; `blocking` when any handoff on the lane blocks. */
export interface RelationshipChip {
  /** the neighbor project (chip label + drill target — drillProject(project)) */
  project: string
  /** the neighbor's project node id, for select() */
  nodeId: string
  /** total handoffs on this lane */
  total: number
  /** still-open handoffs on this lane (gold emphasis when > 0) */
  open: number
  /** any handoff on this lane is blocking (m2 lifecycle) */
  blocking: boolean
}

export interface RelationshipStrip {
  /** `← N from <project>` — lanes ending at the focus */
  inbound: RelationshipChip[]
  /** `→ N to <project>` — lanes leaving the focus */
  outbound: RelationshipChip[]
}

const PROJECT_PREFIX = 'project:'
const projectIdOf = (name: string): string => `${PROJECT_PREFIX}${name}`
const projectNameOf = (id: string): string => id.slice(PROJECT_PREFIX.length)

/** Biggest flow first, then alphabetical — a stable, meaningful reading order. */
function byFlowDesc(a: RelationshipChip, b: RelationshipChip): number {
  return b.total - a.total || a.project.localeCompare(b.project)
}

/**
 * Summarize the focus project's neighbor handoff flow from the aggregated route
 * edges. Only `category === 'route'` aggregated edges count; self-routes (a
 * project handing to itself) are ignored. Pure and deterministic.
 */
export function relationshipStrip(
  focusProject: string,
  edges: ReadonlyArray<RouteEdge>,
): RelationshipStrip {
  const focusId = projectIdOf(focusProject)
  const inbound: RelationshipChip[] = []
  const outbound: RelationshipChip[] = []
  for (const e of edges) {
    if (e.category !== 'route') continue
    if (e.source === e.target) continue // self-route — not a neighbor lane
    const chip = (neighborId: string): RelationshipChip => ({
      project: projectNameOf(neighborId),
      nodeId: neighborId,
      total: e.totalCount ?? 0,
      open: e.openCount ?? 0,
      blocking: e.blocking === true,
    })
    if (e.target === focusId) inbound.push(chip(e.source))
    else if (e.source === focusId) outbound.push(chip(e.target))
  }
  inbound.sort(byFlowDesc)
  outbound.sort(byFlowDesc)
  return { inbound, outbound }
}
