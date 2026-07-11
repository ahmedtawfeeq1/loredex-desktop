/**
 * Atlas filters, focus and search tiering (story 10.6, ATLAS-6) — pure set
 * logic, unit-tested; the store holds the state, the canvas draws the result.
 * Facets compose (AND); edges are filtered at the CATEGORY level, mirroring
 * UA; the blocked preset isolates blocking chains per the shared rule.
 */
import { isBlockingCard } from '../../../../shared/blocked'
import type { AtlasEdge, AtlasNode } from '../../../../shared/types'

export interface AtlasFilters {
  /** empty array = facet inactive (all pass) */
  nodeTypes: string[]
  /** handoff effective status (expired snooze reads as open) */
  statuses: string[]
  topics: string[]
  edgeCategories: string[]
  /** declutter denylist: edge categories always hidden (affinity off by
   *  default — WP2). Composes with the edgeCategories allowlist. */
  excludedEdgeCategories: string[]
  /** '' = both tiers */
  confidence: '' | 'mentioned' | 'heuristic'
  /** the blocked-on preset (story 10.6 AC4) */
  blocked: boolean
}

export const EMPTY_FILTERS: AtlasFilters = {
  nodeTypes: [],
  statuses: [],
  topics: [],
  edgeCategories: [],
  excludedEdgeCategories: [],
  confidence: '',
  blocked: false,
}

/**
 * The Atlas opens decluttered (WP2): affinity — the dashed cross-project topic
 * web — is hidden until the user enables it in the Filters "affinity" toggle.
 * Everything else keeps EMPTY_FILTERS all-pass semantics.
 */
export const DEFAULT_FILTERS: AtlasFilters = {
  ...EMPTY_FILTERS,
  excludedEdgeCategories: ['affinity'],
}

/** Active facet count for the one-click-clear chip (AC2). */
export function activeFilterCount(f: AtlasFilters): number {
  let n = 0
  if (f.nodeTypes.length > 0) n++
  if (f.statuses.length > 0) n++
  if (f.topics.length > 0) n++
  if (f.edgeCategories.length > 0) n++
  if (f.confidence !== '') n++
  if (f.blocked) n++
  return n
}

/** Snooze past its date reads as open — same derivation as the board. */
export function effectiveStatus(node: Pick<AtlasNode, 'status' | 'expired'>): string {
  return node.expired ? 'open' : node.status || 'open'
}

const nodeBlocks = (n: AtlasNode): boolean =>
  n.type === 'handoff' &&
  isBlockingCard({ kind: n.kind ?? '', status: n.status ?? 'open', expired: n.expired ?? false })

/**
 * AND-composed narrowing. Facets only judge nodes they speak about: statuses
 * judge handoffs, topics judge topic-carrying nodes — a facet never blanks an
 * unrelated node type. Edges drop when filtered out or when an endpoint hid.
 */
export function applyAtlasFilters(
  nodes: AtlasNode[],
  edges: AtlasEdge[],
  f: AtlasFilters,
): { nodes: AtlasNode[]; edges: AtlasEdge[] } {
  let keptNodes = nodes
  let keptEdges = edges

  if (f.blocked) {
    // isolate blocking chains: blocking handoffs, blocking route edges, and
    // the project clusters those routes connect — nothing else
    const blockingEdges = keptEdges.filter((e) => e.category === 'route' && e.blocking)
    const routeEndpoints = new Set(blockingEdges.flatMap((e) => [e.source, e.target]))
    keptNodes = keptNodes.filter(
      (n) => nodeBlocks(n) || (n.type === 'project' && routeEndpoints.has(n.id)),
    )
    keptEdges = blockingEdges
  }

  if (f.nodeTypes.length > 0) keptNodes = keptNodes.filter((n) => f.nodeTypes.includes(n.type))
  if (f.statuses.length > 0) {
    keptNodes = keptNodes.filter(
      (n) => n.type !== 'handoff' || f.statuses.includes(effectiveStatus(n)),
    )
  }
  if (f.topics.length > 0) {
    keptNodes = keptNodes.filter((n) => !n.topic || f.topics.includes(n.topic))
  }
  if (f.edgeCategories.length > 0) {
    keptEdges = keptEdges.filter((e) => f.edgeCategories.includes(e.category))
  }
  if (f.excludedEdgeCategories.length > 0) {
    keptEdges = keptEdges.filter((e) => !f.excludedEdgeCategories.includes(e.category))
  }
  if (f.confidence !== '') {
    keptEdges = keptEdges.filter(
      (e) => e.category !== 'contract-link' || (e.confidence ?? 'mentioned') === f.confidence,
    )
  }

  const visible = new Set(keptNodes.map((n) => n.id))
  keptEdges = keptEdges.filter((e) => visible.has(e.source) && visible.has(e.target))
  return { nodes: keptNodes, edges: keptEdges }
}

/** Focus mode (AC4): the node plus its 1-hop neighborhood — UA's focusNodeId. */
export function focusNeighborhood(id: string, edges: AtlasEdge[]): Set<string> {
  const keep = new Set([id])
  for (const e of edges) {
    if (e.source === id) keep.add(e.target)
    if (e.target === id) keep.add(e.source)
  }
  return keep
}

/**
 * Search-hit ring tiers (AC3): hits tier the highlight ring by score relative
 * to the best hit — 1 strongest. Paths must already be vault-relative.
 */
export function searchRingTiers(
  hits: Array<{ path: string; score: number }>,
  nodes: Array<Pick<AtlasNode, 'id' | 'path'>>,
): Map<string, 1 | 2 | 3> {
  const tiers = new Map<string, 1 | 2 | 3>()
  if (hits.length === 0) return tiers
  const best = Math.max(...hits.map((h) => h.score))
  if (best <= 0) return tiers
  const byPath = new Map<string, string>()
  for (const n of nodes) {
    if (n.path) byPath.set(n.path, n.id)
  }
  for (const hit of hits) {
    const id = byPath.get(hit.path)
    if (!id) continue
    const ratio = hit.score / best
    const tier: 1 | 2 | 3 = ratio >= 2 / 3 ? 1 : ratio >= 1 / 3 ? 2 : 3
    const prior = tiers.get(id)
    if (prior === undefined || tier < prior) tiers.set(id, tier)
  }
  return tiers
}
