/**
 * Collapsed-atom visibility (story 10.3): at Learn, topic folders render as
 * collapsed group atoms that expand lazily — one topic's notes at a time;
 * single-child groups are dissolved (their one note renders directly).
 * Deep Dive renders everything. Pure — the canvas just draws the result.
 */
import type { AtlasGraph, AtlasNode } from '../../../../shared/types'

export interface TopicAtom {
  /** stable key `<project>/<topic>` (the store's expandedTopic key) */
  key: string
  project: string
  topic: string
  count: number
  /** the row position of its (hidden) members */
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
      atoms.push({
        key,
        project: cluster.project,
        topic: topic.name,
        count: members.length,
        x: Math.min(...members.map((m) => m.x)),
        y: Math.min(...members.map((m) => m.y)),
      })
    }
  }
  return { nodes: graph.nodes.filter((n) => !hidden.has(n.id)), atoms }
}

/** Breadcrumb trail: vault › project › topic (story 10.3 AC3). */
export interface Crumb {
  label: string
  /** navigation target; null = the current position (not a link) */
  target: { level: 'overview' | 'learn'; project?: string } | null
}

export function breadcrumbsFor(graph: Pick<AtlasGraph, 'level' | 'scope'>): Crumb[] {
  const crumbs: Crumb[] = [
    { label: 'vault', target: graph.level === 'overview' ? null : { level: 'overview' } },
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
