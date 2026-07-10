/**
 * Per-file search over the vault tree (user request, 2026-07-10, shipped with
 * story 16.7): case-insensitive substring match on file names. Directories
 * survive when they (or any descendant) match; a matching directory name
 * keeps its whole subtree. Pure — unit-testable under node.
 */
import type { TreeNode } from '../../../../shared/types'
import { humanizeTitle } from '../../humanize'

export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  // story 17.1: rows display humanized titles, so the filter matches what the
  // user SEES ("error handling") as well as the machine name (error-handling)
  const matches = (name: string): boolean =>
    name.toLowerCase().includes(q) || humanizeTitle(name).toLowerCase().includes(q)
  const walk = (list: TreeNode[]): TreeNode[] =>
    list.flatMap((node) => {
      if (node.kind === 'dir') {
        if (matches(node.name)) return [node] // whole subtree stays
        const children = walk(node.children ?? [])
        return children.length > 0 ? [{ ...node, children }] : []
      }
      return matches(node.name) ? [node] : []
    })
  return walk(nodes)
}
