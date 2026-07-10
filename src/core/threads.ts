/**
 * Thread graph (story 8.2): DERIVED from lib HandoffCards + `type: 'comment'`
 * notes via the replies_to/fulfills edges — recomputed per request, nothing
 * persisted (state-placement rule). Note names resolve vault-wide through the
 * story 2.2 shortest-path resolver (injected — same rule as reading-order
 * wikilinks, never forked). Broken references become diagnostics, never
 * auto-created notes, never a crash.
 */
import { toVaultRelative } from '../shared/handoff-lanes'
import type {
  BrokenThreadRef,
  HandoffCard,
  HandoffThread,
  ThreadCard,
  ThreadReply,
} from '../shared/types'

/** A scanned `type: 'comment'` note (rail member, never a board card). */
export interface CommentSource {
  /** vault-relative path */
  path: string
  meta: Record<string, unknown>
  /** first `# ` heading of the body — the comment's title */
  title: string
}

export interface ThreadSource {
  vaultPath: string
  /** lib collector output (absolute paths) */
  cards: HandoffCard[]
  comments: CommentSource[]
  /** note name → vault-relative path (story 2.2 resolver); null = unresolved */
  resolveName: (name: string) => string | null
}

function cardNode(card: HandoffCard, vaultPath: string): ThreadCard {
  return {
    id: card.id,
    path: toVaultRelative(card.path, vaultPath),
    from: card.from,
    to: card.to,
    objective: card.objective || card.name,
    date: card.date,
    status: card.status,
    kind: card.kind,
    ...(card.repliesTo ? { repliesTo: card.repliesTo } : {}),
    ...(card.fulfills ? { fulfills: card.fulfills } : {}),
    expired: card.expired,
  }
}

function commentNode(comment: CommentSource): ThreadCard {
  const id = (comment.path.split('/').pop() as string).replace(/\.md$/, '')
  const repliesTo = comment.meta.replies_to
  return {
    id,
    path: comment.path,
    from: '',
    to: '',
    objective: comment.title || id,
    date: String(comment.meta.date ?? ''),
    status: '',
    kind: 'comment',
    ...(repliesTo ? { repliesTo: String(repliesTo) } : {}),
    expired: false,
  }
}

/**
 * Scan the vault's handoffs/ dirs for `type: 'comment'` notes — anything that
 * is not already a board card. Unreadable/foreign files are skipped, never
 * fatal (the rail must not crash on vault noise).
 */
export function collectComments(
  relPaths: string[],
  cardPaths: Set<string>,
  readDoc: (rel: string) => { meta: Record<string, unknown>; body: string },
): CommentSource[] {
  const comments: CommentSource[] = []
  for (const rel of relPaths) {
    if (!/^projects\/[^/]+\/handoffs\//.test(rel) || cardPaths.has(rel)) continue
    try {
      const doc = readDoc(rel)
      if (doc.meta.type !== 'comment') continue
      const title = /^#\s+(.+)$/m.exec(doc.body)?.[1]?.trim() ?? ''
      comments.push({ path: rel, meta: doc.meta, title })
    } catch {
      // unreadable note — diagnostics belong to the reader view, not the rail
    }
  }
  return comments
}

/**
 * The whole edge model, built once per call: nodes keyed by vault-relative
 * path, parent edges via resolved replies_to, children sorted (date, id) for
 * a stable rail.
 */
interface EdgeModel {
  byPath: Map<string, ThreadCard>
  parentOf: Map<string, string | null>
  childrenOf: Map<string, string[]>
  broken: BrokenThreadRef[]
}

function buildEdges(source: ThreadSource): EdgeModel {
  const byPath = new Map<string, ThreadCard>()
  for (const card of source.cards) {
    const node = cardNode(card, source.vaultPath)
    byPath.set(node.path, node)
  }
  for (const comment of source.comments) {
    if (!byPath.has(comment.path)) byPath.set(comment.path, commentNode(comment))
  }

  const parentOf = new Map<string, string | null>()
  const childrenOf = new Map<string, string[]>()
  const broken: BrokenThreadRef[] = []
  for (const [path, node] of byPath) {
    let parent: string | null = null
    if (node.repliesTo) {
      const target = source.resolveName(node.repliesTo)
      if (target && byPath.has(target)) parent = target
      else broken.push({ ownerId: node.id, field: 'replies_to', name: node.repliesTo })
    }
    parentOf.set(path, parent)
    if (parent) {
      const siblings = childrenOf.get(parent) ?? []
      siblings.push(path)
      childrenOf.set(parent, siblings)
    }
  }
  for (const children of childrenOf.values()) {
    children.sort((a, b) => {
      const na = byPath.get(a) as ThreadCard
      const nb = byPath.get(b) as ThreadCard
      return na.date === nb.date ? na.id.localeCompare(nb.id) : na.date.localeCompare(nb.date)
    })
  }
  return { byPath, parentOf, childrenOf, broken }
}

/** Focused-card lookup: bare note name or qualified `<project>/<name>`. */
function findFocused(byPath: Map<string, ThreadCard>, id: string): ThreadCard | null {
  const slash = id.indexOf('/')
  const [project, name] = slash === -1 ? [null, id] : [id.slice(0, slash), id.slice(slash + 1)]
  for (const node of byPath.values()) {
    if (node.id !== name) continue
    if (project === null || node.path.startsWith(`projects/${project}/`)) return node
  }
  return null
}

/**
 * The thread around one handoff: ancestors (root … parent), the depth-first
 * reply rail (comments included), the fulfills link both ways, and every
 * dangling reference among the thread's members. Cycles are guarded — a
 * corrupted replies_to loop truncates the walk instead of hanging.
 */
export function buildThread(source: ThreadSource, focusedId: string): HandoffThread | null {
  const { byPath, parentOf, childrenOf, broken } = buildEdges(source)
  const focused = findFocused(byPath, focusedId)
  if (!focused) return null

  const visited = new Set<string>([focused.path])
  const ancestors: ThreadCard[] = []
  for (let p = parentOf.get(focused.path); p && !visited.has(p); p = parentOf.get(p)) {
    visited.add(p)
    ancestors.unshift(byPath.get(p) as ThreadCard)
  }

  const replies: ThreadReply[] = []
  const walk = (path: string, depth: number): void => {
    for (const child of childrenOf.get(path) ?? []) {
      if (visited.has(child)) continue // cycle guard
      visited.add(child)
      replies.push({ ...(byPath.get(child) as ThreadCard), depth })
      walk(child, depth + 1)
    }
  }
  walk(focused.path, 1)

  let fulfills: ThreadCard | undefined
  if (focused.fulfills) {
    const target = source.resolveName(focused.fulfills)
    const node = target ? byPath.get(target) : undefined
    if (node) fulfills = node
    else broken.push({ ownerId: focused.id, field: 'fulfills', name: focused.fulfills })
  }

  // reverse fulfills edges (story 8.3 badge): deliveries naming this request
  const fulfilledBy: ThreadCard[] = []
  for (const node of byPath.values()) {
    if (!node.fulfills || node.path === focused.path) continue
    if (source.resolveName(node.fulfills) === focused.path) fulfilledBy.push(node)
  }
  fulfilledBy.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)))

  // diagnostics only for members of THIS thread (focused + rail + ancestors)
  const memberIds = new Set([focused.id, ...ancestors.map((n) => n.id), ...replies.map((n) => n.id)])
  return {
    ancestors,
    replies,
    ...(fulfills ? { fulfills } : {}),
    fulfilledBy,
    broken: broken.filter((b) => memberIds.has(b.ownerId)),
  }
}
