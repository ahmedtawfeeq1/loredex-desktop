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
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toVaultRelative } from '../shared/handoff-lanes'
import type {
  AtlasCluster,
  AtlasContractChange,
  AtlasEdge,
  AtlasGraph,
  AtlasLevel,
  AtlasNode,
  AtlasScope,
  AtlasTopicGroup,
  HandoffCard,
  TourDef,
} from '../shared/types'
import * as engine from './engine'
import { resolveLink } from './links'
import { buildTours, filterTours } from './tours'
import { listMarkdownFiles } from './tree'

// layout constants live in shared/atlas-layout.ts (renderer draws with them)
import { COL_W, MARGIN, NODE_W, ROW_H } from '../shared/atlas-layout'

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

/** git remote url → https commit-page base; GitHub only (m2 §6: non-GitHub
 *  remotes render commit chips as plain mono text + copy-sha, no link). */
export function commitBaseOf(remote: string | null): string | null {
  if (!remote) return null
  let m = /^https?:\/\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(remote)
  if (!m) m = /^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?\/?$/.exec(remote)
  if (!m) return null
  return m[1] === 'github.com' ? `https://github.com/${m[2]}` : null
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

/** blocking flag per the m2 lifecycle rules: open/accepted requests block
 *  their target; an expired snooze derives as open (never auto-written). */
export function isBlocking(card: Pick<HandoffCard, 'kind' | 'status' | 'expired'>): boolean {
  if (card.kind !== 'request') return false
  return card.status === 'open' || card.status === 'accepted' || card.expired
}

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

  // handoff cards keyed by vault-relative path (they are handoff nodes, not notes)
  const cardByRel = new Map<string, HandoffCard>()
  for (const card of source.cards) {
    cardByRel.set(toVaultRelative(card.path, source.vaultPath), card)
  }

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
  for (const card of source.cards) {
    if (card.from) projectNames.add(card.from)
    if (card.to) projectNames.add(card.to)
    const rel = toVaultRelative(card.path, source.vaultPath)
    const seg = /^projects\/([^/]+)\//.exec(rel)
    if (seg) projectNames.add(seg[1] as string)
  }
  for (const name of [...projectNames].sort()) {
    const open = source.cards.filter(
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
  for (const card of source.cards) {
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
  for (const card of source.cards) {
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
  for (const card of source.cards) {
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
    return commitBaseOf(remoteOfProject.get(project) ?? null)
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

  // 10 — contract nodes + tiered links from the story 11.1 provider (verbatim)
  const handoffNodeByCardId = new Map<string, string>()
  for (const card of source.cards) {
    const rel = toVaultRelative(card.path, source.vaultPath)
    const owner = /^projects\/([^/]+)\//.exec(rel)?.[1] ?? card.to
    handoffNodeByCardId.set(card.id, handoffIdOf(owner, card.id))
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
        commitBase: commitBaseOf(source.readRepoRemote(change.repoRoot)),
      })
    }
    pushEdge({
      id: `contract-link:${contractId}->${commitId}`,
      source: contractId,
      target: commitId,
      category: 'contract-link',
    })
    for (const link of change.links) {
      const handoffNodeId = handoffNodeByCardId.get(link.handoffId)
      if (!handoffNodeId) continue
      pushEdge({
        id: `contract-link:${contractId}->${handoffNodeId}:${change.sha}`,
        source: contractId,
        target: handoffNodeId,
        category: 'contract-link',
        confidence: link.confidence, // tier passes through UNTOUCHED
      })
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
  for (const card of source.cards) {
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

// ── level projection + deterministic column layout ──────────────────────────

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
      node.x = MARGIN + col * COL_W
      node.y = MARGIN + i * ROW_H
    })
  }
}

/** Topics stacked (alpha), notes date-sorted left→right within a topic row;
 *  source/commit/contract neighbors get their own trailing rows. Returns the
 *  next free y (blocks stack for the unscoped deep level). */
function positionProjectBlock(
  cluster: AtlasCluster,
  nodeById: Map<string, AtlasNode>,
  extras: AtlasNode[],
  startY: number,
): number {
  let y = startY
  for (const topic of cluster.topics) {
    const members = topic.nodeIds
      .map((id) => nodeById.get(id))
      .filter((n): n is AtlasNode => n !== undefined)
      .sort((a, b) =>
        (a.date ?? '') === (b.date ?? '')
          ? a.label.localeCompare(b.label)
          : (a.date ?? '').localeCompare(b.date ?? ''),
      )
    members.forEach((node, i) => {
      node.x = MARGIN + i * (NODE_W + 40)
      node.y = y
    })
    y += ROW_H
  }
  const extraRows: Array<[string, AtlasNode[]]> = [
    ['source', extras.filter((n) => n.type === 'source')],
    ['commit', extras.filter((n) => n.type === 'commit')],
    ['contract', extras.filter((n) => n.type === 'contract')],
  ]
  for (const [, row] of extraRows) {
    if (row.length === 0) continue
    row.sort((a, b) => a.id.localeCompare(b.id))
    row.forEach((node, i) => {
      node.x = MARGIN + i * (NODE_W + 40)
      node.y = y
    })
    y += ROW_H
  }
  return y
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

  // layout: scoped project blocks stacked; project clusters in a leading column
  const clusters = model.clusters.filter((c) => projectsInPlay.has(c.project))
  const scopedClusters = scope.project
    ? clusters.filter((c) => c.project === scope.project)
    : clusters
  let y = MARGIN + ROW_H // row 0 belongs to the project header column
  for (const cluster of scopedClusters) {
    const scopedTopics = scope.topic
      ? { ...cluster, topics: cluster.topics.filter((t) => t.name === scope.topic) }
      : cluster
    const extras = nodes.filter(
      (n) =>
        (n.type === 'source' || n.type === 'commit' || n.type === 'contract') &&
        (n.project === cluster.project || !n.project),
    )
    y = positionProjectBlock(scopedTopics, nodeById, level === 'deep' ? extras : [], y) + 40
  }
  // project header nodes: alpha row along the top (scoped project first)
  const projectNodes = nodes
    .filter((n) => n.type === 'project')
    .sort((a, b) =>
      a.label === scope.project ? -1 : b.label === scope.project ? 1 : a.label.localeCompare(b.label),
    )
  projectNodes.forEach((node, i) => {
    node.x = MARGIN + i * (NODE_W + 60)
    node.y = MARGIN
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

/** Read-only peek at a repo's .git/config for the origin url (no shell-out). */
function readOriginRemote(rootAbs: string): string | null {
  try {
    const raw = readFileSync(join(rootAbs, '.git', 'config'), 'utf8')
    return /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(raw)?.[1] ?? null
  } catch {
    return null
  }
}

function productionSource(): AtlasSource {
  const config = engine.getConfig()
  const vaultPath = config.vaultPath
  return {
    vaultPath,
    files: listMarkdownFiles(vaultPath),
    cards: engine.handoffs({ direction: 'all' }),
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
    contracts: [], // story 11.1's scan provider plugs in here
    today: new Date().toISOString().slice(0, 10),
    fileExists: (abs) => existsSync(abs),
    readRepoRemote: readOriginRemote,
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

/** Tours recompute with the same invalidation as the graph (story 10.5 AC5). */
export function atlasTours(scope: AtlasScope = {}): TourDef[] {
  if (!toursCache || !baseCache || baseCache.gen !== generation) {
    const { model, source } = ensureBase()
    toursCache = buildTours(source, model)
  }
  return filterTours(toursCache, scope)
}
