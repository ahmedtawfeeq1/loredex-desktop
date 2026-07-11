/**
 * Atlas reframe WP1 — the readable project PAGE model (spec §Learn). A PURE
 * projection of the atlas.graph LEARN payload for one scoped project into the
 * data a scrollable HTML page renders: header counts + brief freshness, the
 * attention line (open / blocked), the flows-with strip (reuse
 * relationshipStrip), one section per topic (notes newest-first) and the
 * handoff cards. No SVG, no layout — the graph already carries every field;
 * this reads it as a document instead of a diagram. Unit-tested against the
 * nimbus fixtures without a DOM (project-page.test.ts).
 */
import { newestDate } from '../../../../shared/atlas-layout'
import { relationshipStrip, type RelationshipStrip } from '../../../../shared/atlas-relationships'
import { isBlockingCard } from '../../../../shared/blocked'
import type { AtlasGraph, AtlasNode, HandoffCard } from '../../../../shared/types'
import { humanizeTitle, noteDate } from '../../humanize'

/** One note rendered as a card in a topic section (→ Reader on click). */
export interface ProjectPageNote {
  /** atlas node id (stable React key) */
  id: string
  /** vault-relative path — the Reader open target */
  path: string
  /** humanized serif title (the machine name stays in the tooltip) */
  title: string
  /** raw filename (tooltip / a11y) */
  name: string
  /** frontmatter `type` chip */
  noteType: string
  topic: string
  /** authored first-sentence excerpt (never generated) */
  excerpt: string
  /** node.date, or the date parsed off the filename, else '' */
  date: string
  /** rust freshness treatment past the 7-day horizon */
  stale: boolean
}

/** One topic section: a heading (topic · count · newest date) + note cards. */
export interface ProjectPageTopic {
  topic: string
  count: number
  /** newest member date ('' when none dated) — drives the recency ordering */
  newestDate: string
  /** notes newest-first */
  notes: ProjectPageNote[]
}

export interface ProjectPageHeader {
  project: string
  /** number of note-type members (handoffs counted separately) */
  noteCount: number
  /** open INBOUND handoffs (open or expired-snooze) — the board convention */
  openCount: number
  /** a project-scoped brief note's freshness, or `none` when the project has
   *  no brief of its own (the vault-root Start Here brief is not per-project) */
  briefFreshness: 'fresh' | 'stale' | 'none'
  /** the brief note's Reader path when one exists */
  briefPath: string | null
  /** newest activity date across notes + handoffs (ISO), null when undated */
  lastActivity: string | null
}

export interface ProjectPageModel {
  header: ProjectPageHeader
  /** the attention line — rendered only when open > 0 or blocked > 0 */
  attention: { open: number; blocked: number }
  /** flows-with chips (reuse relationshipStrip) — clickable → that project's Learn */
  flows: RelationshipStrip
  /** one section per real topic, newest-activity topic first (`handoffs` excluded) */
  topics: ProjectPageTopic[]
  /** the project's handoff cards (→ board) — reconstructed for HandoffCardView */
  handoffs: HandoffCard[]
}

const BRIEF_NAME = /(?:^|[-\s])(?:start[-\s]?here|product[-\s]?brief|brief)(?:$|[-\s])/i

function isBriefNote(node: AtlasNode): boolean {
  return node.noteType === 'brief' || BRIEF_NAME.test(node.label)
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso)
  const to = Date.parse(toIso)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.floor((to - from) / 86_400_000)
}

/** newest date first, `handoffs`-name never a topic here (already filtered). */
function byNewestTopic(a: ProjectPageTopic, b: ProjectPageTopic): number {
  return a.newestDate === b.newestDate
    ? a.topic.localeCompare(b.topic)
    : b.newestDate.localeCompare(a.newestDate)
}

function toPageNote(node: AtlasNode): ProjectPageNote {
  return {
    id: node.id,
    path: node.path ?? '',
    title: humanizeTitle(node.label),
    name: node.label,
    noteType: node.noteType || 'note',
    topic: node.topic ?? '',
    excerpt: node.summary ?? '',
    date: node.date ?? noteDate(node.label) ?? '',
    stale: node.stale === true,
  }
}

/**
 * Reconstruct a board HandoffCard from an atlas handoff node so the page can
 * reuse HandoffCardView verbatim. The atlas payload carries every field the
 * card's stamp / route / objective show; `readingOrder` is not in the payload
 * (→ empty) and `ageDays` derives from the node date against `today`.
 */
function toHandoffCard(node: AtlasNode, today: string): HandoffCard {
  const date = node.date ?? ''
  return {
    id: node.label,
    name: node.label,
    from: node.from ?? '',
    to: node.to ?? '',
    objective: node.summary ?? node.label,
    date,
    ageDays: date ? Math.max(0, daysBetween(date, today)) : 0,
    status: node.status ?? 'open',
    // the Reader/board open target — the atlas node path is already
    // vault-relative (what useReader.open expects)
    path: node.path ?? '',
    readingOrder: [],
    kind: node.kind ?? 'delivery',
    expired: node.expired === true,
  }
}

/**
 * Build the project-page model from a LEARN atlas graph. Deterministic and
 * DOM-free. `today` (default: now) only feeds handoff age; the topic/note
 * ordering and counts are pure functions of the graph.
 */
export function buildProjectPage(
  graph: Pick<AtlasGraph, 'scope' | 'nodes' | 'edges' | 'clusters'>,
  today: string = new Date().toISOString().slice(0, 10),
): ProjectPageModel {
  const cluster =
    graph.clusters.find((c) => c.project === graph.scope.project) ?? graph.clusters[0]
  const project = graph.scope.project ?? cluster?.project ?? ''
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))

  // the cluster's own note + handoff members (topic membership is authoritative)
  const memberIds = new Set(cluster?.topics.flatMap((t) => t.nodeIds) ?? [])
  const members = [...memberIds]
    .map((id) => nodeById.get(id))
    .filter((n): n is AtlasNode => n !== undefined)

  const noteNodes = members.filter((n) => n.type === 'note')
  const handoffNodes = members
    .filter((n) => n.type === 'handoff')
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.label.localeCompare(b.label))

  // topics: real knowledge topics only. The `handoffs` folder is not a topic —
  // its handoff cards render in their own section and any stray notes there
  // (thread comments / findings) belong to the thread rail, not the page body.
  const notesByTopic = new Map<string, AtlasNode[]>()
  for (const node of noteNodes) {
    const topic = node.topic || '(project root)'
    if (topic === 'handoffs') continue
    const list = notesByTopic.get(topic) ?? []
    list.push(node)
    notesByTopic.set(topic, list)
  }
  const topics: ProjectPageTopic[] = [...notesByTopic.entries()]
    .map(([topic, group]) => {
      const notes = group
        .map(toPageNote)
        .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))
      return { topic, count: notes.length, newestDate: newestDate(notes.map((n) => n.date)), notes }
    })
    .sort(byNewestTopic)

  // header counts — the project cluster node carries the authoritative open
  // inbound count; fall back to the board rule over the handoff members
  const projectNode = nodeById.get(`project:${project}`)
  const openCount =
    projectNode?.openCount ??
    handoffNodes.filter((n) => n.to === project && (n.status === 'open' || n.expired === true))
      .length

  const brief = noteNodes.find(isBriefNote)
  const briefFreshness: ProjectPageHeader['briefFreshness'] = brief
    ? brief.stale
      ? 'stale'
      : 'fresh'
    : 'none'

  const lastActivity = newestDate(members.map((n) => n.date)) || null
  // "N notes" counts the notes the page actually shows (topic sections), not
  // the stray handoff-folder comments the sections omit
  const noteCount = topics.reduce((sum, t) => sum + t.count, 0)

  const blocked = handoffNodes.filter((n) =>
    isBlockingCard({ kind: n.kind ?? 'delivery', status: n.status ?? 'open', expired: n.expired === true }),
  ).length

  return {
    header: {
      project,
      noteCount,
      openCount,
      briefFreshness,
      briefPath: brief?.path ?? null,
      lastActivity,
    },
    attention: { open: openCount, blocked },
    flows: relationshipStrip(project, graph.edges),
    topics,
    handoffs: handoffNodes.map((n) => toHandoffCard(n, today)),
  }
}
