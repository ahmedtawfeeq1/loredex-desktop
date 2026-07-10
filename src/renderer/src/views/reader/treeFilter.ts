/**
 * Per-file search over the vault tree (user request, 2026-07-10, shipped with
 * story 16.7): case-insensitive substring match on file names. Directories
 * survive when they (or any descendant) match; a matching directory name
 * keeps its whole subtree. Pure — unit-testable under node.
 */
import type { TreeNode } from '../../../../shared/types'

export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  const walk = (list: TreeNode[]): TreeNode[] =>
    list.flatMap((node) => {
      if (node.kind === 'dir') {
        if (node.name.toLowerCase().includes(q)) return [node] // whole subtree stays
        const children = walk(node.children ?? [])
        return children.length > 0 ? [{ ...node, children }] : []
      }
      return node.name.toLowerCase().includes(q) ? [node] : []
    })
  return walk(nodes)
}
