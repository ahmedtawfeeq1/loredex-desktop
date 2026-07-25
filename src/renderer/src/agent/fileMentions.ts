/**
 * `@`-triggered file picker for the composer.
 *
 * Same shape as the slash-command picker, different question: slash asks "which
 * command", this asks "which file in the vault". It browses the reader's tree
 * one level at a time — pick a folder to descend, pick a file to reference it —
 * so a note six folders deep is reachable without knowing its path by heart.
 *
 * What lands in the draft is the file's ABSOLUTE path, not a vault-relative one:
 * the agent's cwd is the vault root for a research session but the client dir
 * for a client-scoped one, so a relative path silently means two different files.
 */
import type { TreeNode } from '../../../shared/types'

/**
 * The path query for the mention menu, or null when the menu should be closed.
 *
 * Open only while the draft ENDS in a bare `@token` sitting at a word boundary,
 * so an email address mid-sentence never opens it and a finished mention
 * (followed by a space) closes it. Returns '' for a lone `@` — list the root.
 */
export function mentionQuery(draft: string): string | null {
  const m = /(?:^|\s)@([^\s@]*)$/.exec(draft)
  return m ? (m[1] ?? '') : null
}

/** Where the trailing `@token` starts, for replacing it on pick. */
export function mentionStart(draft: string): number {
  const m = /(?:^|\s)@([^\s@]*)$/.exec(draft)
  if (!m) return -1
  return m.index + m[0].indexOf('@')
}

/** The children of `dir` (posix, vault-relative, '' = root), or null if absent. */
function childrenAt(tree: TreeNode[], dir: string): TreeNode[] | null {
  if (dir === '') return tree
  let level: TreeNode[] = tree
  for (const seg of dir.split('/')) {
    const next = level.find((n) => n.kind === 'dir' && n.name === seg)
    if (!next?.children) return null
    level = next.children
  }
  return level
}

/**
 * One level of the tree, filtered by the last path segment typed.
 *
 * `@proj` filters the ROOT by "proj"; `@projects/arab` filters the children of
 * `projects` by "arab". Folders come first — you are usually on your way
 * somewhere, and putting them under a long file list makes the drill-down feel
 * like a dead end. `limit` caps a wide folder; the caller says so in the UI.
 */
export function mentionMatches(
  tree: TreeNode[] | null,
  query: string,
  limit = 50,
): TreeNode[] {
  if (!tree) return []
  const cut = query.lastIndexOf('/')
  const dir = cut === -1 ? '' : query.slice(0, cut)
  const leaf = (cut === -1 ? query : query.slice(cut + 1)).toLowerCase()
  const level = childrenAt(tree, dir)
  if (!level) return []
  const hit = (n: TreeNode): boolean => leaf === '' || n.name.toLowerCase().includes(leaf)
  const dirs = level.filter((n) => n.kind === 'dir' && hit(n))
  const files = level.filter((n) => n.kind === 'file' && hit(n))
  return [...dirs, ...files].slice(0, limit)
}

/**
 * The draft with the trailing `@token` replaced by the picked entry.
 *
 * A folder keeps the mention open one level deeper (`@projects/`); a file ends
 * it, inserting `absolute` followed by a space so typing continues naturally.
 *
 * A folder appends its NAME to the path walked so far — it must not use
 * `node.path`. Reported 2026-07-23: picking a project-manager folder produced
 * `@projects#product=ahmed-essam/` and then listed nothing. The tree groups
 * projects under a synthetic "product" node whose `path` is an id, not a
 * walkable location, while its children keep their real `projects/<slug>`
 * paths. Navigating by the names actually traversed is independent of whatever
 * a node's `path` happens to be, so a synthetic grouping layer just works.
 */
export function applyMention(draft: string, node: TreeNode, absolute: string): string {
  const at = mentionStart(draft)
  const head = at === -1 ? draft : draft.slice(0, at)
  if (node.kind !== 'dir') return `${head}${absolute} `
  const query = mentionQuery(draft) ?? ''
  const cut = query.lastIndexOf('/')
  const walked = cut === -1 ? '' : query.slice(0, cut + 1)
  return `${head}@${walked}${node.name}/`
}
