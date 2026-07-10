/**
 * Vault Atlas tours (story 10.5, ATLAS-5 — docs/plan/ATLAS-CONCEPT.md §2).
 * Tours ARE the interactive form of curate reading orders: every handoff's
 * `## Reading order` wikilink list is already a tour (step k = note k); thread
 * chains and topic date-order are derivable the same way. No LLM, no tour
 * builder agent, no persistent state — extraction over the atlas base model,
 * recomputed with the same invalidation as the graph.
 *
 * Heuristic fallback (AC2): a handoff without a reading order gets a
 * deterministic BFS ordering over thread/wikilink edges, date-tiebroken —
 * the UA `generateHeuristicTour` idea minus topo-sort ceremony — and is
 * labeled `heuristic: true` in the payload.
 */
import { toVaultRelative } from '../shared/handoff-lanes'
import type { AtlasNode, AtlasScope, TourDef, TourStep } from '../shared/types'
import type { AtlasSource, BaseModel } from './atlas'

/**
 * Parse the `## Reading order` section: wikilink name → the same-line trailing
 * prose ("1. [[note]] — why it's next"). The list is the author's narration;
 * we lift it verbatim, never generate.
 */
export function readingOrderProse(body: string): Map<string, string> {
  const prose = new Map<string, string>()
  let inSection = false
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (/^#{1,6}\s/.test(line)) {
      inSection = /^#{1,6}\s+reading order\s*$/i.test(line)
      continue
    }
    if (!inSection || !line) continue
    const m = /^(?:\d+\.|[-*+])\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*(?:[—–:-]\s*)?(.*)$/.exec(line)
    if (m) prose.set((m[1] as string).trim(), (m[2] as string).trim())
  }
  return prose
}

const KIND_RANK: Record<TourDef['kind'], number> = { 'reading-order': 0, thread: 1, topic: 2 }

const byDateThenId = (a: AtlasNode, b: AtlasNode): number =>
  (a.date ?? '') === (b.date ?? '')
    ? a.id.localeCompare(b.id)
    : (a.date ?? '').localeCompare(b.date ?? '')

function stepOf(node: AtlasNode, description?: string): TourStep {
  return {
    title: node.label,
    description: description ?? node.summary ?? '',
    nodeIds: [node.id],
    ...(node.project ? { project: node.project } : {}),
    ...(node.topic ? { topic: node.topic } : {}),
  }
}

export function buildTours(source: AtlasSource, model: BaseModel): TourDef[] {
  const tours: TourDef[] = []
  const nodeByRel = new Map<string, AtlasNode>()
  for (const node of model.nodes.values()) {
    if (node.path) nodeByRel.set(node.path, node)
  }

  // BFS adjacency over thread + wikilink edges (bidirectional, the heuristic's graph)
  const adjacency = new Map<string, string[]>()
  for (const edge of model.edges) {
    if (edge.category !== 'thread' && edge.category !== 'wikilink') continue
    const a = adjacency.get(edge.source) ?? []
    a.push(edge.target)
    adjacency.set(edge.source, a)
    const b = adjacency.get(edge.target) ?? []
    b.push(edge.source)
    adjacency.set(edge.target, b)
  }

  // resolved reading-order rels per card (reading-order tours + topic closers)
  const resolvedOrder = new Map<string, string[]>() // handoff node id → note rels
  for (const card of source.cards) {
    const rel = toVaultRelative(card.path, source.vaultPath)
    const handoff = nodeByRel.get(rel)
    if (!handoff) continue
    const rels: string[] = []
    for (const name of card.readingOrder) {
      const target = source.resolveName(name, rel)
      if (target) rels.push(target)
    }
    resolvedOrder.set(handoff.id, rels)
  }

  // ── (a) reading-order tours + (AC2) heuristic fallback per handoff ────────
  for (const card of source.cards) {
    const rel = toVaultRelative(card.path, source.vaultPath)
    const handoff = nodeByRel.get(rel)
    if (!handoff) continue

    if (card.readingOrder.length > 0) {
      const doc = source.readDoc(rel)
      const prose = doc ? readingOrderProse(doc.body) : new Map<string, string>()
      const steps: TourStep[] = []
      for (const name of card.readingOrder) {
        const target = source.resolveName(name, rel)
        const node = target ? nodeByRel.get(target) : undefined
        if (!node) continue // dangling step dropped — the tour shrinks, never errors
        steps.push(stepOf(node, prose.get(name) || node.summary || ''))
      }
      if (steps.length === 0) continue
      tours.push({
        id: `reading-order:${handoff.id}`,
        kind: 'reading-order',
        title: card.objective || card.id,
        description: `Reading order of ${card.from} ⟶ ${card.to}`,
        heuristic: false,
        ...(handoff.project ? { project: handoff.project } : {}),
        steps,
      })
      continue
    }

    // heuristic fallback: BFS from the handoff over thread/wikilink edges,
    // (depth, date, id)-ordered — deterministic, labeled, never generated
    const depth = new Map<string, number>([[handoff.id, 0]])
    const queue = [handoff.id]
    while (queue.length > 0) {
      const at = queue.shift() as string
      for (const next of [...(adjacency.get(at) ?? [])].sort()) {
        if (depth.has(next)) continue
        depth.set(next, (depth.get(at) as number) + 1)
        queue.push(next)
      }
    }
    const reached = [...depth.keys()]
      .filter((id) => id !== handoff.id)
      .map((id) => model.nodes.get(id))
      .filter((n): n is AtlasNode => n !== undefined && (n.type === 'note' || n.type === 'handoff'))
      .sort(
        (a, b) =>
          (depth.get(a.id) as number) - (depth.get(b.id) as number) || byDateThenId(a, b),
      )
    if (reached.length === 0) continue // nothing to walk — no tour, never an error
    tours.push({
      id: `reading-order:${handoff.id}`,
      kind: 'reading-order',
      title: card.objective || card.id,
      description: 'No reading order authored — ordered by link distance from the handoff',
      heuristic: true,
      ...(handoff.project ? { project: handoff.project } : {}),
      steps: [stepOf(handoff, card.objective), ...reached.map((n) => stepOf(n))],
    })
  }

  // ── (b) thread tours: replies_to/fulfills chains walked in date order ─────
  const threadAdjacency = new Map<string, string[]>()
  for (const edge of model.edges) {
    if (edge.category !== 'thread') continue
    const a = threadAdjacency.get(edge.source) ?? []
    a.push(edge.target)
    threadAdjacency.set(edge.source, a)
    const b = threadAdjacency.get(edge.target) ?? []
    b.push(edge.source)
    threadAdjacency.set(edge.target, b)
  }
  const seen = new Set<string>()
  for (const start of [...threadAdjacency.keys()].sort()) {
    if (seen.has(start)) continue
    const component: string[] = []
    const queue = [start]
    seen.add(start)
    while (queue.length > 0) {
      const at = queue.shift() as string
      component.push(at)
      for (const next of [...(threadAdjacency.get(at) ?? [])].sort()) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    const members = component
      .map((id) => model.nodes.get(id))
      .filter((n): n is AtlasNode => n !== undefined)
      .sort(byDateThenId)
    if (members.length < 2) continue
    const root = members[0] as AtlasNode
    tours.push({
      id: `thread:${root.id}`,
      kind: 'thread',
      title: `Thread: ${root.summary || root.label}`,
      description: 'The replies_to / fulfills chain, oldest first',
      heuristic: false,
      ...(root.project ? { project: root.project } : {}),
      steps: members.map((n) => stepOf(n)),
    })
  }

  // ── (c) topic tours: a topic's notes date-ordered + closing handoffs ──────
  for (const cluster of model.clusters) {
    for (const topic of cluster.topics) {
      if (topic.name === 'handoffs' || topic.name === '(project root)') continue
      const notes = topic.nodeIds
        .map((id) => model.nodes.get(id))
        .filter((n): n is AtlasNode => n !== undefined && n.type === 'note')
        .sort(byDateThenId)
      if (notes.length === 0) continue
      const noteRels = new Set(notes.map((n) => n.path))
      const closers = [...resolvedOrder.entries()]
        .filter(([id, rels]) => {
          const handoff = model.nodes.get(id)
          return handoff?.project === cluster.project && rels.some((r) => noteRels.has(r))
        })
        .map(([id]) => model.nodes.get(id))
        .filter((n): n is AtlasNode => n !== undefined)
        .sort(byDateThenId)
      const steps = [...notes.map((n) => stepOf(n)), ...closers.map((n) => stepOf(n))]
      if (steps.length < 2) continue
      tours.push({
        id: `topic:${cluster.project}/${topic.name}`,
        kind: 'topic',
        title: `${cluster.project}: ${topic.name}`,
        description: `The ${topic.name} notes in date order, then the handoffs that shipped them`,
        heuristic: false,
        project: cluster.project,
        topic: topic.name,
        steps,
      })
    }
  }

  return tours.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.id.localeCompare(b.id))
}

/** Scope narrowing for the atlas.tours channel (story 10.5 AC1). */
export function filterTours(tours: TourDef[], scope: AtlasScope): TourDef[] {
  let out = tours
  if (scope.project) out = out.filter((t) => t.project === scope.project)
  if (scope.topic) {
    out = out.filter(
      (t) => t.topic === scope.topic || t.steps.some((s) => s.topic === scope.topic),
    )
  }
  return out
}
