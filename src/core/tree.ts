/**
 * Read-only markdown tree walk rooted at the vault path (story 2.1).
 * App-side view logic is permitted — the anti-second-engine rule fences vault
 * WRITES only. Excludes `.git/**`, dotfiles/dotfolders and non-markdown files;
 * folders with no markdown anywhere below are dropped.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { TreeNode } from '../shared/types'

export function walkVault(root: string, rel = ''): TreeNode[] {
  const abs = rel ? join(root, rel) : root
  const nodes: TreeNode[] = []
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue // .git, .obsidian, .loredex, dotfiles
    const path = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      const children = walkVault(root, path)
      if (children.length > 0) nodes.push({ name: entry.name, path, kind: 'dir', children })
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      nodes.push({ name: entry.name.replace(/\.md$/, ''), path, kind: 'file' })
    }
  }
  // dirs first, then case-insensitive alpha — stable catalog order
  nodes.sort(
    (a, b) =>
      Number(b.kind === 'dir') - Number(a.kind === 'dir') ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
  return nodes
}

/**
 * Insert a Product level inside the `projects` node: wrap each project dir in a
 * virtual product node so the tree drills Product → Project → Topic → Note. The
 * `grouper` (loredex's groupProjects, bound to the vault's manifest — injected so
 * this stays view-only, no loredex import here) returns the ordered groups. When
 * the only group is Ungrouped (no products defined), the projects stay flat —
 * pre-product vaults are untouched. Virtual product nodes carry a synthetic path
 * (`projects#product=…`) so nothing resolves them as a file.
 */
export function groupProjectsInTree(
  tree: TreeNode[],
  grouper: (projects: string[]) => Array<{ product: string | null; projects: string[] }>,
): TreeNode[] {
  return tree.map((node) => {
    if (node.name !== 'projects' || node.kind !== 'dir' || !node.children) return node
    const projectDirs = node.children.filter((c) => c.kind === 'dir')
    const byName = new Map(projectDirs.map((c) => [c.name, c]))
    const groups = grouper(projectDirs.map((c) => c.name))
    if (groups.length <= 1 && groups[0]?.product == null) return node // flat, no products
    const children: TreeNode[] = groups.map((group) => ({
      name: group.product ?? 'Ungrouped',
      path: `${node.path}#product=${group.product ?? '_ungrouped'}`,
      kind: 'dir' as const,
      children: group.projects
        .map((p) => byName.get(p))
        .filter((c): c is TreeNode => c !== undefined),
    }))
    return { ...node, children }
  })
}

/** Flatten to vault-relative file paths — the wikilink index input (story 2.2). */
export function listMarkdownFiles(root: string): string[] {
  const out: string[] = []
  const visit = (nodes: TreeNode[]): void => {
    for (const n of nodes) {
      if (n.kind === 'file') out.push(n.path)
      else if (n.children) visit(n.children)
    }
  }
  visit(walkVault(root))
  return out
}
