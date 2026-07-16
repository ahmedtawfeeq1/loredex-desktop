/**
 * Collapsed-atom visibility (story 10.3): at Learn, topic folders render as
 * collapsed group atoms that expand lazily — one topic's notes at a time;
 * single-child groups are dissolved (their one note renders directly).
 * Deep Dive renders everything. Pure — the canvas just draws the result.
 */
import {
  NODE_H,
  NODE_W,
  nodeRect,
  panelRect,
  type Rect,
} from '../../../../shared/atlas-layout'
import type { AtlasCluster, AtlasGraph, AtlasNode } from '../../../../shared/types'

export interface TopicAtom {
  /** stable key `<project>/<topic>` (the store's expandedTopic key) */
  key: string
  project: string
  topic: string
  count: number
  /** the flow-first hidden member's cell (an occupied slot in the panel grid —
   *  never a free min-corner that could sit under another topic's card) */
  x: number
  y: number
}

export interface AtlasVisibility {
  nodes: AtlasNode[]
  atoms: TopicAtom[]
}

export function visibleAtlas(graph: AtlasGraph, expandedTopic: string | null): AtlasVisibility {
  if (graph.level !== 'learn') return { nodes: graph.nodes, atoms: [] } // deep/overview: everything
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const hidden = new Set<string>()
  const atoms: TopicAtom[] = []
  for (const cluster of graph.clusters) {
    for (const topic of cluster.topics) {
      const key = `${cluster.project}/${topic.name}`
      if (topic.singleChild || key === expandedTopic) continue // dissolved / expanded
      const members = topic.nodeIds
        .map((id) => byId.get(id))
        .filter((n): n is AtlasNode => n !== undefined)
      if (members.length === 0) continue
      for (const m of members) hidden.add(m.id)
      const first = [...members].sort((a, b) => a.x - b.x || a.y - b.y)[0] as AtlasNode
      atoms.push({
        key,
        project: cluster.project,
        topic: topic.name,
        count: members.length,
        x: first.x,
        y: first.y,
      })
    }
  }
  return { nodes: graph.nodes.filter((n) => !hidden.has(n.id)), atoms }
}

/** Focused-cluster panel rects derived from what is VISIBLE — expanded cards,
 *  collapsed atoms, the header bar, deep extras. Hidden members must never
 *  inflate the panel: sizing it from ALL members left the visible content in
 *  a tiny top strip of a mostly-empty card (the story 16.5 defect). */
export function visiblePanels(
  clusters: AtlasCluster[],
  visibleNodes: AtlasNode[],
  atoms: TopicAtom[],
  level: 'learn' | 'deep',
): Array<{ project: string; rect: Rect }> {
  const out: Array<{ project: string; rect: Rect }> = []
  for (const cluster of clusters) {
    const memberIds = new Set(cluster.topics.flatMap((t) => t.nodeIds))
    const members: Rect[] = visibleNodes
      .filter(
        (n) =>
          memberIds.has(n.id) ||
          (n.type === 'project' && n.label === cluster.project) ||
          (level === 'deep' &&
            (n.type === 'source' || n.type === 'commit' || n.type === 'contract') &&
            n.project === cluster.project),
      )
      .map((n) => nodeRect(n, level))
    for (const atom of atoms) {
      if (atom.project === cluster.project)
        members.push({ x: atom.x, y: atom.y, w: NODE_W, h: NODE_H })
    }
    const rect = panelRect(members)
    if (rect) out.push({ project: cluster.project, rect })
  }
  return out
}

/** Breadcrumb trail: vault › project › topic (story 10.3 AC3). */
export interface Crumb {
  label: string
  /** navigation target; null = the current position (not a link) */
  target: { level: 'overview' | 'learn'; project?: string } | null
}

export function breadcrumbsFor(graph: Pick<AtlasGraph, 'level' | 'scope'>): Crumb[] {
  const crumbs: Crumb[] = [
    { label: 'dex', target: graph.level === 'overview' ? null : { level: 'overview' } },
  ]
  if (graph.scope.project) {
    crumbs.push({
      label: graph.scope.project,
      target: graph.scope.topic ? { level: 'learn', project: graph.scope.project } : null,
    })
  }
  if (graph.scope.topic) crumbs.push({ label: graph.scope.topic, target: null })
  return crumbs
}
