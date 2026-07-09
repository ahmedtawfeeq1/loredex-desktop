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
