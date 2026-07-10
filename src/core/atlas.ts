/**
 * Vault Atlas data model (story 10.1, ATLAS-1 — docs/plan/ATLAS-CONCEPT.md).
 * A derived, recomputed cache built in the core host from indexes we already
 * have: the lib's HandoffCards, the vault file walk, the story 2.2 wikilink
 * resolver, frontmatter provenance, and (when story 11.1 ships its provider)
 * the contract scan. Read-only view logic — legal app-side under the
 * anti-second-engine rule; nothing here writes the vault or app-db.
 *
 * Taxonomy is BINDING: 6 node types, 6 edge categories, no more. Every node
 * type emitted here has a resolution target (hyperlink-everything rule);
 * story 10.4 wires the targets.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { isBlockingCard } from '../shared/blocked'
import { githubWebBase } from '../shared/github'
import { toVaultRelative } from '../shared/handoff-lanes'
import type {
  AtlasCluster,
  AtlasContractChange,
  AtlasEdge,
  AtlasGraph,
  AtlasLevel,
  AtlasNode,
  AtlasPathResult,
  AtlasScope,
  AtlasTopicGroup,
  HandoffCard,
  TourDef,
} from '../shared/types'
import {
  contractChangesForAtlas,
  handoffNoteViews,
  loadProjectRoots,
  resolveRoots,
} from './contracts'
import { getAppDb, vaultId } from './db/index'
import * as engine from './engine'
import { originRemote } from './github'
import { resolveLink } from './links'
import { buildTours, filterTours } from './tours'
import { listMarkdownFiles } from './tree'

// layout constants live in shared/atlas-layout.ts (renderer draws with them)
import {
  byRecencyDesc,
  CLUSTER_H,
  CLUSTER_W,
  GRID,
  GUTTER,
  MARGIN,
  newestDate,
  NODE_H,
  NODE_W,
  NOTE_ROW_PITCH,
  PANEL_ASPECT,
  PANEL_PAD,
  panelWrapRows,
  PILL_GUTTER,
  PILL_H,
  PILL_W,
  SUBCARD_LABEL_H,
  SUBCARD_PAD,
  TOPIC_COL_PITCH,
  V_GAP,
} from '../shared/atlas-layout'

/** note freshness horizon — same rust-at-7-days rule as the home brief badge */
export const STALE_AFTER_DAYS = 7

// ── source seam (pure builder in, engine-backed source in production) ───────

export interface AtlasSource {
  vaultPath: string
  /** vault-relative markdown paths (tree walk) */
  files: string[]
  /** lib listHandoffs 'all' — never re-parsed here */
  cards: HandoffCard[]
  /** parsed note; null = unreadable (skipped, never fatal) */
  readDoc(rel: string): { meta: Record<string, unknown>; body: string } | null
  /** story 2.2 shortest-path resolver: note name → vault-relative path */
  resolveName(name: string, fromRel: string): string | null
  /** loredex config.projects: repo root path → { name } (m2 §5 — config wins;
   *  the app-db fallback map arrives with the settings channel, story 11.x) */
  projectRoots: Record<string, { name: string }>
  /** story 11.1 contract-scan provider; [] until it ships (AC5 degradation) */
  contracts: AtlasContractChange[]
  /** YYYY-MM-DD (stale + expired derivations) */
  today: string
  fileExists(abs: string): boolean
  /** origin remote of a project repo root (commit-chip base); null = none */
  readRepoRemote(rootAbs: string): string | null
  /** origin remote of the vault repo (fallback for note-body sha mentions) */
  vaultRemote: string | null
}

// ── small pure helpers ───────────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso)
  const to = Date.parse(toIso)
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.floor((to - from) / 86_400_000)
}

/** First authored prose sentence of a body — headings/lists/fences skipped.
 *  Summaries are already written by the note's author: no generation, ever. */
export function firstSentence(body: string): string {
  let inFence = false
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence || !line) continue
    if (/^(#|[-*+]\s|\d+\.\s|>|\||!\[|---)/.test(line)) continue
    const plain = line
      .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1')
      .replace(/[*_`]/g, '')
      .trim()
    if (!plain) continue
    const period = plain.indexOf('. ')
    const sentence = period === -1 ? plain : plain.slice(0, period + 1)
    return sentence.length > 140 ? `${sentence.slice(0, 139)}…` : sentence
  }
  return ''
}

/** A token that plausibly IS a commit sha (mirrors the story 2.5 rule):
 *  7–40 hex chars with at least one digit — letter-only hex reads as a word. */
const SHA_TOKEN = /\b[0-9a-f]{7,40}\b/g
const isLikelySha = (t: string): boolean => /\d/.test(t)

const WIKILINK = /\[\[([^\]]+)\]\]/g

// ── the base model (level-independent truth) ────────────────────────────────

export interface BaseModel {
  nodes: Map<string, AtlasNode>
  edges: AtlasEdge[]
  clusters: AtlasCluster[]
  /** project name → route-dependency depth (cycle-broken) */
  depth: Map<string, number>
  cyclic: boolean
  /** aggregated route edges for the overview level */
  aggregated: AtlasEdge[]
}

interface ParsedNote {
  rel: string
  project: string
  topic: string
  name: string
  meta: Record<string, unknown>
  body: string
}

/** `note:<project>/<topic>/<name>` — the vault-relative path minus prefix/ext. */
const noteIdOf = (rel: string): string => `note:${rel.replace(/^projects\//, '').replace(/\.md$/, '')}`
const handoffIdOf = (project: string, name: string): string => `handoff:${project}/${name}`
const projectIdOf = (name: string): string => `project:${name}`

/** blocking flag per the m2 lifecycle rules — THE shared rule (story 10.6
 *  moved it to shared/blocked.ts so the blocked-on list can never disagree). */
export const isBlocking = isBlockingCard

export function buildAtlasModel(source: AtlasSource): BaseModel {
  const nodes = new Map<string, AtlasNode>()
  const edges: AtlasEdge[] = []
  const edgeIds = new Set<string>()
  const pushEdge = (edge: AtlasEdge): void => {
    if (edgeIds.has(edge.id)) return
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) return // drop dangling
    edgeIds.add(edge.id)
    edges.push(edge)
  }

  // handoff cards keyed by vault-relative path (they are handoff nodes, not
  // notes). The map also DEDUPES: a direction-'all' listing must never count
  // one file twice — the file is the qualified identity, not the card name
  // (two projects can hold same-named cards; layout-v2 burndown).
  const cardByRel = new Map<string, HandoffCard>()
  for (const rawCard of source.cards) {
    cardByRel.set(toVaultRelative(rawCard.path, source.vaultPath), rawCard)
  }
  const cards = [...cardByRel.values()]

  // 1 — parse notes (everything under projects/ that is not a handoff card)
  const notes: ParsedNote[] = []
  const parsedBodies: Array<{ ownerId: string; ownerRel: string; project: string; body: string }> = []
  for (const rel of [...source.files].sort()) {
    const m = /^projects\/([^/]+)\/(.+)\.md$/.exec(rel)
    if (!m) continue
    const project = m[1] as string
    const rest = m[2] as string
    const slash = rest.indexOf('/')
    const topic = slash === -1 ? '' : rest.slice(0, slash)
    const name = slash === -1 ? rest : (rest.split('/').pop() as string)
    if (cardByRel.has(rel)) continue
    const doc = source.readDoc(rel)
    if (!doc) continue
    notes.push({ rel, project, topic, name, meta: doc.meta, body: doc.body })
  }

  // 2 — project cluster nodes (the vault folders ARE the layers — no inference)
  const projectNames = new Set<string>()
  for (const note of notes) projectNames.add(note.project)
  for (const card of cards) {
    if (card.from) projectNames.add(card.from)
    if (card.to) projectNames.add(card.to)
    const rel = toVaultRelative(card.path, source.vaultPath)
    const seg = /^projects\/([^/]+)\//.exec(rel)
    if (seg) projectNames.add(seg[1] as string)
  }
  for (const name of [...projectNames].sort()) {
    const open = cards.filter(
      (c) => c.to === name && (c.status === 'open' || c.expired),
    ).length
    nodes.set(projectIdOf(name), {
      id: projectIdOf(name),
      type: 'project',
      label: name,
      project: name,
      x: 0,
      y: 0,
      openCount: open,
      noteCount: 0,
    })
  }

  // 3 — note nodes
  for (const note of notes) {
    const id = noteIdOf(note.rel)
    const date = str(note.meta.date)
    nodes.set(id, {
      id,
      type: 'note',
      label: note.name,
      project: note.project,
      topic: note.topic || str(note.meta.topic),
      x: 0,
      y: 0,
      path: note.rel,
      ...(date ? { date } : {}),
      noteType: str(note.meta.type) || 'note',
      summary: firstSentence(note.body),
      stale: date ? daysBetween(date, source.today) >= STALE_AFTER_DAYS : false,
    })
    parsedBodies.push({ ownerId: id, ownerRel: note.rel, project: note.project, body: note.body })
  }

  // 4 — handoff nodes (straight off the lib cards, mirroring the board)
  for (const card of cards) {
    const rel = toVaultRelative(card.path, source.vaultPath)
    const owner = /^projects\/([^/]+)\//.exec(rel)?.[1] ?? card.to
    const id = handoffIdOf(owner, card.id)
    nodes.set(id, {
      id,
      type: 'handoff',
      label: card.id,
      project: owner,
      topic: 'handoffs',
      date: card.date,
      x: 0,
      y: 0,
      path: rel,
      summary: card.objective || card.name,
      status: card.status,
      kind: card.kind,
      from: card.from,
      to: card.to,
      expired: card.expired,
    })
    const doc = source.readDoc(rel)
    if (doc) parsedBodies.push({ ownerId: id, ownerRel: rel, project: owner, body: doc.body })
  }

  // node id lookup by vault-relative path (thread/wikilink edge targets)
  const nodeByRel = new Map<string, string>()
  for (const node of nodes.values()) {
    if (node.path) nodeByRel.set(node.path, node.id)
  }

  // 5 — route edges (handoff from_project → to_project, lifted verbatim)
  for (const card of cards) {
    if (!card.from || !card.to) continue
    const rel = toVaultRelative(card.path, source.vaultPath)
    const owner = /^projects\/([^/]+)\//.exec(rel)?.[1] ?? card.to
    pushEdge({
      id: `route:${card.from}->${card.to}:${card.id}`,
      source: projectIdOf(card.from),
      target: projectIdOf(card.to),
      category: 'route',
      handoffId: handoffIdOf(owner, card.id),
      status: card.status,
      kind: card.kind,
      blocking: isBlocking(card),
    })
  }

  // 6 — thread edges (replies_to / fulfills — schema v2, resolver-backed)
  const threadEdge = (
    ownerId: string,
    ownerRel: string,
    field: 'replies_to' | 'fulfills',
    name: string,
  ): void => {
    const target = source.resolveName(name, ownerRel)
    const targetId = target ? nodeByRel.get(target) : undefined
    if (!targetId) return // dangling refs are thread-rail diagnostics, not atlas edges
    pushEdge({
      id: `thread:${field}:${ownerId}->${targetId}`,
      source: ownerId,
      target: targetId,
      category: 'thread',
      field,
    })
  }
  for (const card of cards) {
    const rel = toVaultRelative(card.path, source.vaultPath)
    const owner = /^projects\/([^/]+)\//.exec(rel)?.[1] ?? card.to
    const id = handoffIdOf(owner, card.id)
    if (card.repliesTo) threadEdge(id, rel, 'replies_to', card.repliesTo)
    if (card.fulfills) threadEdge(id, rel, 'fulfills', card.fulfills)
  }
  for (const note of notes) {
    const repliesTo = str(note.meta.replies_to)
    if (repliesTo) threadEdge(noteIdOf(note.rel), note.rel, 'replies_to', repliesTo)
  }

  // 7 — wikilink edges (body links incl. reading orders, shortest-path resolved)
  for (const { ownerId, ownerRel, body } of parsedBodies) {
    WIKILINK.lastIndex = 0
    for (let m = WIKILINK.exec(body); m !== null; m = WIKILINK.exec(body)) {
      const target = source.resolveName(m[1] as string, ownerRel)
      const targetId = target ? nodeByRel.get(target) : undefined
      if (!targetId || targetId === ownerId) continue
      pushEdge({
        id: `wikilink:${ownerId}->${targetId}`,
        source: ownerId,
        target: targetId,
        category: 'wikilink',
      })
    }
  }

  // 8 — provenance: note → real repo file (source_path/source_project/source_rel)
  for (const note of notes) {
    const sourcePath = str(note.meta.source_path)
    const sourceProject = str(note.meta.source_project)
    const sourceRel = str(note.meta.source_rel)
    if (!sourcePath && !sourceRel) continue
    const id =
      sourceProject && sourceRel ? `source:${sourceProject}/${sourceRel}` : `source:${sourcePath}`
    if (!nodes.has(id)) {
      // this-machine re-resolution: project-roots map FIRST, recorded absolute
      // path fallback, else null → honest disabled state (never a dead click)
      let localPath: string | null = null
      const root = Object.entries(source.projectRoots).find(
        ([, p]) => p.name === sourceProject,
      )?.[0]
      if (root && sourceRel && source.fileExists(join(root, sourceRel))) {
        localPath = join(root, sourceRel)
      } else if (sourcePath && source.fileExists(sourcePath)) {
        localPath = sourcePath
      }
      nodes.set(id, {
        id,
        type: 'source',
        label: sourceRel || (sourcePath.split('/').pop() ?? sourcePath),
        ...(sourceProject ? { project: sourceProject } : {}),
        x: 0,
        y: 0,
        ...(sourcePath ? { sourcePath } : {}),
        ...(sourceProject ? { sourceProject } : {}),
        ...(sourceRel ? { sourceRel } : {}),
        localPath,
      })
    }
    pushEdge({
      id: `provenance:${noteIdOf(note.rel)}->${id}`,
      source: noteIdOf(note.rel),
      target: id,
      category: 'provenance',
    })
  }

  // 9 — commit nodes from body sha mentions (m2 §5 'mentioned' tier verbatim:
  // a word-bounded 7–40 hex sha in a note/handoff body IS the strong link)
  const remoteOfProject = new Map<string, string | null>()
  const commitBaseFor = (project: string): string | null => {
    if (!remoteOfProject.has(project)) {
      const root = Object.entries(source.projectRoots).find(([, p]) => p.name === project)?.[0]
      const remote = root ? source.readRepoRemote(root) : null
      remoteOfProject.set(project, remote ?? source.vaultRemote)
    }
    return githubWebBase(remoteOfProject.get(project) ?? null)
  }
  for (const { ownerId, project, body } of parsedBodies) {
    SHA_TOKEN.lastIndex = 0
    for (let m = SHA_TOKEN.exec(body); m !== null; m = SHA_TOKEN.exec(body)) {
      const sha = m[0]
      if (!isLikelySha(sha)) continue
      const id = `commit:${sha}`
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          type: 'commit',
          label: sha.slice(0, 7),
          project,
          x: 0,
          y: 0,
          sha,
          commitBase: commitBaseFor(project),
        })
      }
      pushEdge({
        id: `contract-link:${ownerId}->${id}`,
        source: ownerId,
        target: id,
        category: 'contract-link',
        confidence: 'mentioned',
      })
    }
  }

  // 10 — contract nodes + tiered links from the story 11.1 provider (verbatim).
  // Scan links carry UNQUALIFIED card ids; two projects can hold same-named
  // cards, so the lookup is id → ALL qualified handoff nodes. Linking every
  // candidate is honest — silently keeping the last map entry was the
  // mislinked-duplicate bug (layout-v2 burndown).
  const handoffNodesByCardId = new Map<string, string[]>()
  for (const card of cards) {
    const rel = toVaultRelative(card.path, source.vaultPath)
    const owner = /^projects\/([^/]+)\//.exec(rel)?.[1] ?? card.to
    const list = handoffNodesByCardId.get(card.id) ?? []
    list.push(handoffIdOf(owner, card.id))
    handoffNodesByCardId.set(card.id, list)
  }
  for (const change of source.contracts) {
    const contractId = `contract:${change.repoRoot}/${change.file}`
    const existing = nodes.get(contractId)
    if (existing) existing.changeCount = (existing.changeCount ?? 0) + 1
    else {
      nodes.set(contractId, {
        id: contractId,
        type: 'contract',
        label: change.file,
        project: change.project,
        x: 0,
        y: 0,
        file: change.file,
        repoRoot: change.repoRoot,
        changeCount: 1,
      })
    }
    const commitId = `commit:${change.sha}`
    if (!nodes.has(commitId)) {
      nodes.set(commitId, {
        id: commitId,
        type: 'commit',
        label: change.sha.slice(0, 7),
        x: 0,
        y: 0,
        date: change.date,
        sha: change.sha,
        commitBase: githubWebBase(source.readRepoRemote(change.repoRoot)),
      })
    }
    pushEdge({
      id: `contract-link:${contractId}->${commitId}`,
      source: contractId,
      target: commitId,
      category: 'contract-link',
    })
    for (const link of change.links) {
      for (const handoffNodeId of handoffNodesByCardId.get(link.handoffId) ?? []) {
        pushEdge({
          id: `contract-link:${contractId}->${handoffNodeId}:${change.sha}`,
          source: contractId,
          target: handoffNodeId,
          category: 'contract-link',
          confidence: link.confidence, // tier passes through UNTOUCHED
        })
      }
    }
  }

  // 11 — affinity: same topic across projects (the only computed category)
  const byTopic = new Map<string, ParsedNote[]>()
  for (const note of notes) {
    const topic = note.topic || str(note.meta.topic)
    if (!topic || topic === 'handoffs') continue
    const list = byTopic.get(topic) ?? []
    list.push(note)
    byTopic.set(topic, list)
  }
  for (const [topic, group] of [...byTopic.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i] as ParsedNote
        const b = group[j] as ParsedNote
        if (a.project === b.project) continue // in-project affinity IS the topic group
        pushEdge({
          id: `affinity:${noteIdOf(a.rel)}<->${noteIdOf(b.rel)}`,
          source: noteIdOf(a.rel),
          target: noteIdOf(b.rel),
          category: 'affinity',
          topic,
          weight: 1,
        })
      }
    }
  }

  // 12 — clusters: project → topic groups (explicit folders; single-child flagged)
  const clusters: AtlasCluster[] = []
  for (const name of [...projectNames].sort()) {
    const topicMap = new Map<string, string[]>()
    for (const node of nodes.values()) {
      if (node.project !== name || (node.type !== 'note' && node.type !== 'handoff')) continue
      const topic = node.topic || '(project root)'
      const list = topicMap.get(topic) ?? []
      list.push(node.id)
      topicMap.set(topic, list)
    }
    const topics: AtlasTopicGroup[] = [...topicMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([topicName, nodeIds]) => ({
        name: topicName,
        nodeIds: nodeIds.sort(),
        singleChild: nodeIds.length === 1,
      }))
    const projectNode = nodes.get(projectIdOf(name))
    if (projectNode) {
      projectNode.noteCount = topics.reduce((n, t) => n + t.nodeIds.length, 0)
    }
    clusters.push({ project: name, topics })
  }

  // 13 — aggregated overview route edges (`N open / M total`, blocking carried).
  // Open counting matches the board convention: expired snoozes are due again
  // and count with open; snoozed-and-current never count.
  const aggMap = new Map<string, AtlasEdge>()
  for (const card of cards) {
    if (!card.from || !card.to) continue
    const key = `project:${card.from}->project:${card.to}`
    const open = card.status === 'open' || card.expired
    const agg = aggMap.get(key)
    if (agg) {
      agg.totalCount = (agg.totalCount ?? 0) + 1
      if (open) agg.openCount = (agg.openCount ?? 0) + 1
      if (isBlocking(card)) agg.blocking = true
    } else {
      aggMap.set(key, {
        id: `route-agg:${key}`,
        source: projectIdOf(card.from),
        target: projectIdOf(card.to),
        category: 'route',
        openCount: open ? 1 : 0,
        totalCount: 1,
        blocking: isBlocking(card),
      })
    }
  }
  const aggregated = [...aggMap.values()].sort((a, b) => a.id.localeCompare(b.id))

  // 14 — route-dependency depth per project (deterministic, cycle-broken).
  // A → B means A hands off TO B: B sits right of A. Back edges on the DFS
  // stack are flagged and ignored — the layout terminates, always.
  const senders = new Map<string, string[]>() // project → projects that send to it
  for (const agg of aggregated) {
    const from = agg.source.slice('project:'.length)
    const to = agg.target.slice('project:'.length)
    const list = senders.get(to) ?? []
    list.push(from)
    senders.set(to, list)
  }
  const depth = new Map<string, number>()
  const onStack = new Set<string>()
  let cyclic = false
  const depthOf = (name: string): number => {
    const cached = depth.get(name)
    if (cached !== undefined) return cached
    if (onStack.has(name)) {
      cyclic = true // route cycle — break here, deterministically
      return 0
    }
    onStack.add(name)
    let d = 0
    for (const sender of (senders.get(name) ?? []).sort()) {
      if (sender === name) {
        cyclic = true // self-route
        continue
      }
      d = Math.max(d, depthOf(sender) + 1)
    }
    onStack.delete(name)
    depth.set(name, d)
    return d
  }
  for (const name of [...projectNames].sort()) depthOf(name)

  return { nodes, edges, clusters, depth, cyclic, aggregated }
}

// ── path tracing (story 10.6, ATLAS-6): plain BFS, no weights ────────────────

/**
 * Shortest path over a bidirectional adjacency of the base model's edges —
 * "how did this decision reach that repo?" A note → handoff → contract →
 * commit walk is a provenance story; the renderer draws it gold as a
 * routing-slip chain. Deterministic (neighbors visited in sorted edge order).
 */
export function shortestPath(
  model: Pick<BaseModel, 'nodes' | 'edges'>,
  from: string,
  to: string,
): AtlasPathResult | null {
  if (!model.nodes.has(from) || !model.nodes.has(to)) return null
  if (from === to) return { nodeIds: [from], edgeIds: [] }
  const adjacency = new Map<string, Array<{ next: string; edgeId: string }>>()
  const link = (a: string, b: string, edgeId: string): void => {
    const list = adjacency.get(a) ?? []
    list.push({ next: b, edgeId })
    adjacency.set(a, list)
  }
  for (const e of [...model.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    link(e.source, e.target, e.id)
    link(e.target, e.source, e.id)
  }
  const prev = new Map<string, { node: string; edgeId: string }>()
  const queue = [from]
  const seen = new Set([from])
  while (queue.length > 0) {
    const at = queue.shift() as string
    for (const { next, edgeId } of adjacency.get(at) ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      prev.set(next, { node: at, edgeId })
      if (next === to) {
        const nodeIds = [to]
        const edgeIds: string[] = []
        let walk = to
        while (walk !== from) {
          const step = prev.get(walk) as { node: string; edgeId: string }
          edgeIds.unshift(step.edgeId)
          nodeIds.unshift(step.node)
          walk = step.node
        }
        return { nodeIds, edgeIds }
      }
      queue.push(next)
    }
  }
  return null // disconnected — the UI says so in one honest sentence
}

// ── level projection + deterministic lane/panel layout (layout-v2) ──────────
//
// The binding spec (epic10 layout-v2 defect burndown):
// - overview: lane columns by route-dependency depth — cluster cards CLUSTER_W
//   wide, vertical gaps ≥ V_GAP, GUTTER-wide card-free channels between lanes
//   for orthogonal edges; cards NEVER overlap (unit-asserted);
// - learn/deep: the focused cluster expands into one large panel — topic
//   COLUMN groups on the GRID-aligned pitch, handoffs in their own trailing
//   lane; neighboring clusters collapse to compact side pills; boundary nodes
//   stack in context columns under their project's pill (never unpositioned —
//   the (0,0) pile-up WAS the overlap/duplicate-looking defect);
// - no randomness anywhere: every tie broken by date, then label, then id.

function positionProjects(model: BaseModel, included: AtlasNode[]): void {
  const byColumn = new Map<number, AtlasNode[]>()
  for (const node of included) {
    if (node.type !== 'project') continue
    const col = model.depth.get(node.label) ?? 0
    const list = byColumn.get(col) ?? []
    list.push(node)
    byColumn.set(col, list)
  }
  for (const [col, list] of byColumn) {
    list.sort((a, b) => a.label.localeCompare(b.label)) // alpha tie-break
    list.forEach((node, i) => {
      node.x = MARGIN + col * (CLUSTER_W + GUTTER) // GUTTER = edge channel
      node.y = MARGIN + i * (CLUSTER_H + V_GAP)
    })
  }
}

const byDateThenLabel = (a: AtlasNode, b: AtlasNode): number =>
  (a.date ?? '') === (b.date ?? '')
    ? a.label.localeCompare(b.label)
    : (a.date ?? '').localeCompare(b.date ?? '')

/** One flowable panel block: a topic's members or a deep context type. Each
 *  block becomes a shelf-packed CELL — a topic is a bordered sub-card (D1
 *  amendment 3), so no two blocks ever share a column and each sub-card contains
 *  only its own notes. */
interface PanelBlock {
  nodes: AtlasNode[]
}

/** Panel blocks left→right in RECENCY order (D1 amendment 3): topic sub-cards
 *  newest-activity first, `handoffs` forced last (its own cell, thread rails
 *  ride it), then source/commit/contract context cells at deep. Members inside
 *  a topic stack NEWEST-FIRST top→bottom (with 01/02/03 order chips). */
function panelBlocks(
  cluster: AtlasCluster,
  nodeById: Map<string, AtlasNode>,
  extras: AtlasNode[],
): PanelBlock[] {
  const withMembers = cluster.topics
    .map((topic) => ({
      topic,
      members: topic.nodeIds
        .map((id) => nodeById.get(id))
        .filter((n): n is AtlasNode => n !== undefined)
        .sort(byRecencyDesc),
    }))
    .filter((t) => t.members.length > 0)
    .map((t) => ({ ...t, newest: newestDate(t.members.map((m) => m.date)) }))
  // newest topic first; handoffs always trails the real topics; label breaks ties
  withMembers.sort((a, b) => {
    if (a.topic.name === 'handoffs') return 1
    if (b.topic.name === 'handoffs') return -1
    return a.newest === b.newest ? a.topic.name.localeCompare(b.topic.name) : b.newest.localeCompare(a.newest)
  })
  const blocks: PanelBlock[] = withMembers.map((t) => ({ nodes: t.members }))
  for (const type of ['source', 'commit', 'contract'] as const) {
    const column = extras.filter((n) => n.type === type).sort((a, b) => a.id.localeCompare(b.id))
    if (column.length > 0) blocks.push({ nodes: column })
  }
  return blocks
}

/** A shelf-packing cell: a block's notes column-packed `wrapRows` deep, so it
 *  spans `cols` GRID columns of a shared, uniform column grid. */
interface PanelCell {
  nodes: AtlasNode[]
  cols: number
}

/** Uniform shelf pitch: every shelf is `wrapRows` note-rows tall, so cells on
 *  different shelves land on one shared column grid (the fill invariant stays
 *  as dense as the pre-wrap single row). A shelf's sub-cards clear the shelf
 *  above by V_GAP — a sub-card reaches SUBCARD_PAD below its deepest note and
 *  SUBCARD_PAD + SUBCARD_LABEL_H above its top note. */
const shelfStep = (wrapRows: number): number =>
  (wrapRows - 1) * NOTE_ROW_PITCH +
  NODE_H +
  SUBCARD_PAD +
  V_GAP +
  SUBCARD_PAD +
  SUBCARD_LABEL_H

/** Fold `cells` (each `cols` wide) into shelves of width `targetCols`, never
 *  splitting a cell → (columns used, shelves used). Deterministic. */
function foldShelves(cells: PanelCell[], targetCols: number): { cols: number; shelves: number } {
  let gridCol = 0
  let maxCols = 0
  let shelves = 1
  for (const cell of cells) {
    if (gridCol > 0 && gridCol + cell.cols > targetCols) {
      shelves++
      gridCol = 0
    }
    gridCol += cell.cols
    maxCols = Math.max(maxCols, gridCol)
  }
  return { cols: maxCols, shelves }
}

/** Lay one focused-cluster panel: header bar top-left, then topic sub-cards
 *  packed `wrapRows` deep and SHELF-WRAPPED left→right, row-down onto a shared
 *  column grid. The shelf width is chosen so the packed bounding box lands
 *  nearest PANEL_ASPECT — a many-topic project reads as browsable rows, never
 *  the canvas-wide strip (the regression this fixes). Folding a uniform-depth
 *  single row into aligned shelves conserves grid area, so the epic16 fill
 *  ratio holds. Reading order preserved: recency-sorted cells fill row-major.
 *  Returns the panel's outer box (the renderer draws the white card around it). */
function positionPanel(
  header: AtlasNode | undefined,
  blocks: PanelBlock[],
  x0: number,
  y0: number,
): { w: number; h: number } {
  if (header) {
    header.x = x0 + PANEL_PAD
    header.y = y0 + PANEL_PAD
  }
  // extra SUBCARD_LABEL_H below the header so a row-0 topic sub-card's label
  // row (D1 amendment 3) never rides the header bar
  const contentTop = y0 + PANEL_PAD + PILL_H + GRID + SUBCARD_LABEL_H
  const contentX = x0 + PANEL_PAD
  if (blocks.length === 0) {
    return { w: PANEL_PAD * 2 + PILL_W, h: contentTop - y0 + PANEL_PAD }
  }

  // uniform column depth (the tested 16.5 wrap) → every column is wrapRows deep
  // save its partial tail, keeping the folded grid dense
  const wrapRows = Math.max(1, panelWrapRows(blocks.map((b) => b.nodes.length)))
  const cells: PanelCell[] = blocks.map((b) => ({
    nodes: b.nodes,
    cols: Math.max(1, Math.ceil(b.nodes.length / wrapRows)),
  }))

  // choose the shelf width (GRID columns) whose folded box is nearest
  // PANEL_ASPECT — deterministic: the first (narrowest) width that ties wins
  const totalCols = cells.reduce((n, c) => n + c.cols, 0)
  const maxCellCols = Math.max(...cells.map((c) => c.cols))
  const step = shelfStep(wrapRows)
  let targetCols = totalCols
  let bestScore = Number.POSITIVE_INFINITY
  for (let k = maxCellCols; k <= totalCols; k++) {
    const { cols, shelves } = foldShelves(cells, k)
    const w = (cols - 1) * TOPIC_COL_PITCH + NODE_W
    const h = (shelves - 1) * step + (wrapRows - 1) * NOTE_ROW_PITCH + NODE_H
    const score = Math.abs(Math.log(w / Math.max(h, 1) / PANEL_ASPECT))
    if (score < bestScore - 1e-9) {
      bestScore = score
      targetCols = k
    }
  }

  // place the cells shelf by shelf; each cell's notes fill column-major so the
  // newest (index 0) lands at the sub-card's top-left cell
  let gridCol = 0
  let shelfIndex = 0
  let maxRight = contentX + NODE_W
  let maxBottom = contentTop + NODE_H
  for (const cell of cells) {
    if (gridCol > 0 && gridCol + cell.cols > targetCols) {
      shelfIndex++
      gridCol = 0
    }
    const cx = contentX + gridCol * TOPIC_COL_PITCH
    const cyTop = contentTop + shelfIndex * step
    cell.nodes.forEach((node, i) => {
      node.x = cx + Math.floor(i / wrapRows) * TOPIC_COL_PITCH
      node.y = cyTop + (i % wrapRows) * NOTE_ROW_PITCH
      maxRight = Math.max(maxRight, node.x + NODE_W)
      maxBottom = Math.max(maxBottom, node.y + NODE_H)
    })
    gridCol += cell.cols
  }

  return {
    w: PANEL_PAD * 2 + Math.max(maxRight - contentX, PILL_W),
    h: maxBottom - y0 + PANEL_PAD,
  }
}

export function projectAtlas(
  model: BaseModel,
  level: AtlasLevel,
  scope: AtlasScope,
): AtlasGraph {
  // deep copies: positions are level-dependent; the base model stays pristine
  const clone = (n: AtlasNode): AtlasNode => ({ ...n })

  if (level === 'overview') {
    // collapsed cluster atoms + aggregated edges — never note-level nodes
    const nodes = [...model.nodes.values()].filter((n) => n.type === 'project').map(clone)
    positionProjects(model, nodes)
    return {
      level,
      scope: {},
      nodes,
      edges: model.aggregated,
      clusters: model.clusters,
      cyclic: model.cyclic,
    }
  }

  const inScope = (n: AtlasNode): boolean => {
    if (n.type === 'project') return false
    if (scope.project && n.project !== scope.project) return false
    if (scope.topic && n.topic !== scope.topic) return false
    return n.type === 'note' || n.type === 'handoff'
  }
  const core = new Set<string>()
  for (const n of model.nodes.values()) if (inScope(n)) core.add(n.id)

  const included = new Set<string>(core)
  if (level === 'deep') {
    // 1-hop boundary: provenance/commit/contract/cross-scope endpoints of core edges
    for (const e of model.edges) {
      if (core.has(e.source)) included.add(e.target)
      if (core.has(e.target)) included.add(e.source)
    }
  }
  // neighbor project clusters keep route context at both drilled levels
  const projectsInPlay = new Set<string>()
  for (const id of included) {
    const n = model.nodes.get(id)
    if (n?.project) projectsInPlay.add(n.project)
  }
  const aggEdges = model.aggregated.filter((e) => {
    const from = e.source.slice('project:'.length)
    const to = e.target.slice('project:'.length)
    return scope.project ? from === scope.project || to === scope.project : true
  })
  for (const e of aggEdges) {
    projectsInPlay.add(e.source.slice('project:'.length))
    projectsInPlay.add(e.target.slice('project:'.length))
  }
  for (const name of projectsInPlay) included.add(projectIdOf(name))

  const nodes = [...included]
    .map((id) => model.nodes.get(id))
    .filter((n): n is AtlasNode => n !== undefined)
    .map(clone)
    .sort((a, b) => a.id.localeCompare(b.id))
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  // edges: level filter (learn shows no provenance/contract-link tail), both ends present
  const edges = [
    ...model.edges.filter((e) => {
      if (level === 'learn' && (e.category === 'provenance' || e.category === 'contract-link'))
        return false
      if (e.category === 'route') return false // clusters carry aggregated routes instead
      return nodeById.has(e.source) && nodeById.has(e.target)
    }),
    ...aggEdges.filter((e) => nodeById.has(e.source) && nodeById.has(e.target)),
  ]

  // layout-v2: focused panels + side pills + context columns. EVERY included
  // node gets a position — unpositioned boundary nodes piling at (0,0) under
  // the header row was the overlap/floating-duplicate defect.
  const clusters = model.clusters.filter((c) => projectsInPlay.has(c.project))
  const scopedClusters = scope.project
    ? clusters.filter((c) => c.project === scope.project)
    : clusters
  const panelOwners = new Set(scopedClusters.map((c) => c.project))

  // what each panel will actually place: its (topic-scoped) column members
  // plus its source/commit/contract extras at deep
  const scopedTopicsOf = (cluster: AtlasCluster): AtlasCluster =>
    scope.topic
      ? { ...cluster, topics: cluster.topics.filter((t) => t.name === scope.topic) }
      : cluster
  const panelMemberIds = new Set<string>()
  for (const cluster of scopedClusters) {
    for (const topic of scopedTopicsOf(cluster).topics) {
      for (const id of topic.nodeIds) if (nodeById.has(id)) panelMemberIds.add(id)
    }
  }
  const isExtra = (n: AtlasNode): boolean =>
    level === 'deep' &&
    (n.type === 'source' || n.type === 'commit' || n.type === 'contract') &&
    n.project !== undefined &&
    panelOwners.has(n.project)
  const inPanel = (n: AtlasNode): boolean => panelMemberIds.has(n.id) || isExtra(n)

  // context: nodes outside every panel (cross-project boundary cards, out-of-
  // scope topic neighbors, projectless commits), grouped by project ('' = none)
  const contextGroups = new Map<string, AtlasNode[]>()
  for (const n of nodes) {
    if (n.type === 'project' || inPanel(n)) continue
    const key = n.project ?? ''
    const list = contextGroups.get(key) ?? []
    list.push(n)
    contextGroups.set(key, list)
  }

  // side pills: card-less neighbors sit left of the panels; neighbors with
  // boundary cards head a context column on the right
  const pillNodes = nodes.filter((n) => n.type === 'project' && !panelOwners.has(n.label))
  const leftPills = pillNodes
    .filter((p) => !contextGroups.has(p.label))
    .sort((a, b) => a.label.localeCompare(b.label))
  leftPills.forEach((pill, i) => {
    pill.x = MARGIN
    pill.y = MARGIN + i * (PILL_H + V_GAP)
  })

  // panels stacked vertically, all sharing one left edge (aligned columns
  // keep the inter-column bands card-free for orthogonal edge channels);
  // PILL_GUTTER (not GUTTER) keeps the pill→panel chip channel clear of both
  // the pills and the panel card (story 16.5 clipped-label fix)
  const panelX = MARGIN + (leftPills.length > 0 ? PILL_W + PILL_GUTTER : 0)
  let panelY = MARGIN
  let panelsRight = panelX
  for (const cluster of scopedClusters) {
    const extras = nodes.filter((n) => isExtra(n) && n.project === cluster.project)
    const header = nodeById.get(projectIdOf(cluster.project))
    const box = positionPanel(
      header,
      panelBlocks(scopedTopicsOf(cluster), nodeById, extras),
      panelX,
      panelY,
    )
    panelsRight = Math.max(panelsRight, panelX + box.w)
    panelY += box.h + 2 * V_GAP
  }

  // right context columns: pill on top (when the project exists as a node),
  // that project's boundary cards stacked beneath — connected by the edges
  // that pulled them in, never floating
  const rightX = panelsRight + GUTTER
  const rightGroups = [...contextGroups.entries()].sort(([a], [b]) => a.localeCompare(b))
  rightGroups.forEach(([project, members], g) => {
    const x = rightX + g * TOPIC_COL_PITCH
    // never reposition a panel header — a topic-scoped panel's own project
    // heads the panel, not its out-of-scope context column
    const pill =
      project && !panelOwners.has(project) ? nodeById.get(projectIdOf(project)) : undefined
    let yy = MARGIN
    if (pill) {
      pill.x = x
      pill.y = yy
      yy += PILL_H + V_GAP
    }
    for (const member of [...members].sort(byDateThenLabel)) {
      member.x = x
      member.y = yy
      yy += NOTE_ROW_PITCH
    }
  })

  return {
    level,
    scope,
    nodes,
    edges,
    clusters: scopedClusters.map((c) =>
      scope.topic ? { ...c, topics: c.topics.filter((t) => t.name === scope.topic) } : c,
    ),
    cyclic: model.cyclic,
  }
}

// ── production wiring: engine-backed source + memoized cache ────────────────

/** Story 11.3: contract nodes come from the cached scan + link tiers — sync
 *  reads only (cache + notes), no git; absent db degrades to no contract
 *  nodes (story 10.1 AC5). */
function productionContracts(cards: HandoffCard[]): AtlasContractChange[] {
  const db = getAppDb()
  if (!db) return []
  try {
    const config = engine.getConfig()
    const vid = vaultId(config.vaultPath, engine.identity().remote)
    const { roots } = resolveRoots({
      openVaultPath: config.vaultPath,
      fileConfig: engine.configFileProjects(),
      appRoots: loadProjectRoots(db, vid),
    })
    const notes = handoffNoteViews(cards, (abs) => {
      try {
        return engine.readNote(abs).body
      } catch {
        return null
      }
    })
    return contractChangesForAtlas(db, roots, notes)
  } catch {
    return []
  }
}

function productionSource(): AtlasSource {
  const config = engine.getConfig()
  const vaultPath = config.vaultPath
  const cards = engine.handoffs({ direction: 'all' })
  return {
    vaultPath,
    files: listMarkdownFiles(vaultPath),
    cards,
    readDoc: (rel) => {
      try {
        const doc = engine.readNote(rel)
        return { meta: doc.meta as Record<string, unknown>, body: doc.body }
      } catch {
        return null
      }
    },
    resolveName: (name, fromRel) => {
      const r = resolveLink(vaultPath, name, fromRel)
      return r.status === 'resolved' ? (r.target ?? null) : null
    },
    projectRoots: config.projects,
    contracts: productionContracts(cards), // story 11.3: cached scan + tiers
    today: new Date().toISOString().slice(0, 10),
    fileExists: (abs) => existsSync(abs),
    // story 12.1: one derivation — the cached real-origin lookup (github.ts)
    readRepoRemote: originRemote,
    vaultRemote: engine.identity().remote,
  }
}

let generation = 0
let baseCache: { gen: number; model: BaseModel; source: AtlasSource } | null = null
const graphCache = new Map<string, AtlasGraph>()
let toursCache: TourDef[] | null = null

/** Same invalidation discipline as the link index: vault.changed batches,
 *  post-pull reconcile (F4), and every in-app write announce. */
export function invalidateAtlas(): void {
  generation++
  baseCache = null
  graphCache.clear()
  toursCache = null
}

function ensureBase(): { model: BaseModel; source: AtlasSource } {
  if (!baseCache || baseCache.gen !== generation) {
    const source = productionSource()
    baseCache = { gen: generation, model: buildAtlasModel(source), source }
  }
  return baseCache
}

export function atlasGraph(level: AtlasLevel, scope: AtlasScope = {}): AtlasGraph {
  const key = `${level}|${scope.project ?? ''}|${scope.topic ?? ''}`
  const cached = graphCache.get(key)
  if (cached) return cached
  const graph = projectAtlas(ensureBase().model, level, scope)
  graphCache.set(key, graph)
  return graph
}

/** BFS over the cached base model — the graph already lives here (10.6 AC1). */
export function atlasPath(from: string, to: string): AtlasPathResult | null {
  return shortestPath(ensureBase().model, from, to)
}

/** Tours recompute with the same invalidation as the graph (story 10.5 AC5). */
export function atlasTours(scope: AtlasScope = {}): TourDef[] {
  if (!toursCache || !baseCache || baseCache.gen !== generation) {
    const { model, source } = ensureBase()
    toursCache = buildTours(source, model)
  }
  return filterTours(toursCache, scope)
}
