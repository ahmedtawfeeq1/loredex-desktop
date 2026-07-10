/**
 * Changed-since overlay (story 10.7, ATLAS-7): UA's diff-overlay concept fed
 * by activity.feed + live poller/watcher events — notes touched since a point
 * GLOW, their 1-hop neighbors get an AFFECTED ring, project clusters show
 * counts at Overview. Pure set derivation; the store holds the since-point.
 */
import type { ActivityEvent, AtlasEdge, AtlasNode } from '../../../../shared/types'

/** Nodes touched at-or-after the since-point (boundary included, once). */
export function changedNodeIds(
  events: Array<Pick<ActivityEvent, 'at' | 'subject'>>,
  since: string,
  nodes: Array<Pick<AtlasNode, 'id' | 'type' | 'label' | 'path'>>,
): Set<string> {
  const byRel = new Map<string, string>()
  const handoffByLabel = new Map<string, string>()
  for (const n of nodes) {
    if (n.path) byRel.set(n.path, n.id)
    if (n.type === 'handoff') handoffByLabel.set(n.label, n.id)
  }
  const changed = new Set<string>()
  for (const event of events) {
    if (event.at < since) continue
    const byPath = event.subject.path ? byRel.get(event.subject.path) : undefined
    if (byPath) changed.add(byPath)
    const byHandoff = event.subject.handoffId
      ? handoffByLabel.get(event.subject.handoffId)
      : undefined
    if (byHandoff) changed.add(byHandoff)
  }
  return changed
}

/** Live watcher/poller batch: vault-relative paths → node ids, unioned in. */
export function withLiveChanges(
  changed: ReadonlySet<string>,
  paths: string[],
  nodes: Array<Pick<AtlasNode, 'id' | 'path'>>,
): Set<string> {
  const next = new Set(changed)
  const byRel = new Map<string, string>()
  for (const n of nodes) {
    if (n.path) byRel.set(n.path, n.id)
  }
  for (const path of paths) {
    const id = byRel.get(path)
    if (id) next.add(id)
  }
  return next
}

/** 1-hop neighbors of the changed set that are not themselves changed. */
export function affectedNodeIds(
  changed: ReadonlySet<string>,
  edges: Array<Pick<AtlasEdge, 'source' | 'target'>>,
): Set<string> {
  const affected = new Set<string>()
  for (const e of edges) {
    if (changed.has(e.source) && !changed.has(e.target)) affected.add(e.target)
    if (changed.has(e.target) && !changed.has(e.source)) affected.add(e.source)
  }
  return affected
}

/** Overview cluster counts: changed nodes per owning project. Works from the
 *  typed-prefixed ids themselves (`note:<project>/…`, `handoff:<project>/…`)
 *  so Overview — which renders no note-level nodes — still shows counts. */
export function clusterChangedCounts(changed: ReadonlySet<string>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const id of changed) {
    const m = /^(?:note|handoff):([^/]+)\//.exec(id)
    if (!m) continue
    const project = m[1] as string
    counts.set(project, (counts.get(project) ?? 0) + 1)
  }
  return counts
}
