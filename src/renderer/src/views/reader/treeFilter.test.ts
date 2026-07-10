/** Per-file search over the vault tree (shipped with story 16.7). */
import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../../../../shared/types'
import { filterTree } from './treeFilter'

const file = (name: string, path = name): TreeNode => ({ kind: 'file', name, path })
const dir = (name: string, children: TreeNode[], path = name): TreeNode => ({
  kind: 'dir',
  name,
  path,
  children,
})

const tree: TreeNode[] = [
  dir('_index', [file('Home.md', '_index/Home.md'), file('nimbus-backend.md', '_index/nimbus-backend.md')]),
  dir('projects', [
    dir('nimbus-api', [file('2026-07-09-streaming-api.md')], 'projects/nimbus-api'),
    dir('nimbus-frontend', [file('status-panel.md')], 'projects/nimbus-frontend'),
  ]),
]

describe('filterTree (per-file search)', () => {
  it('an empty or whitespace query returns the tree untouched', () => {
    expect(filterTree(tree, '')).toBe(tree)
    expect(filterTree(tree, '   ')).toBe(tree)
  })

  it('matches file names case-insensitively and prunes empty branches', () => {
    const out = filterTree(tree, 'STREAMING')
    expect(out).toHaveLength(1)
    expect(out[0]?.name).toBe('projects')
    expect(out[0]?.children?.[0]?.name).toBe('nimbus-api')
    expect(out[0]?.children).toHaveLength(1)
  })

  it('a matching directory name keeps its whole subtree', () => {
    const out = filterTree(tree, 'nimbus-frontend')
    const project = out[0]?.children?.[0]
    expect(project?.name).toBe('nimbus-frontend')
    expect(project?.children?.[0]?.name).toBe('status-panel.md')
  })

  it('no match filters everything out', () => {
    expect(filterTree(tree, 'zzz-not-here')).toEqual([])
  })
})
