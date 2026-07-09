/**
 * Collapsible vault folder tree (story 2.1). Native <details> folders (free
 * keyboard support), current-note highlight = 4px Archive Ink left rail +
 * raised fill per DESIGN.md. Header carries the manual refresh action
 * (v0.1 scope cut: no file watcher).
 */
import { useEffect } from 'react'
import type { TreeNode } from '../../../../shared/types'
import { useReader } from '../../stores/reader'

function FileRow({ node }: { node: TreeNode }): React.JSX.Element {
  const selected = useReader((s) => s.selected)
  const open = useReader((s) => s.open)
  return (
    <button
      type="button"
      className="tree-file"
      aria-current={selected === node.path}
      title={node.path}
      onClick={() => void open(node.path)}
    >
      {node.name}
    </button>
  )
}

function Branch({ nodes }: { nodes: TreeNode[] }): React.JSX.Element {
  return (
    <ul className="tree-branch">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.kind === 'dir' ? (
            <details open>
              <summary className="tree-dir">{node.name}</summary>
              {node.children && <Branch nodes={node.children} />}
            </details>
          ) : (
            <FileRow node={node} />
          )}
        </li>
      ))}
    </ul>
  )
}

export function VaultTree(): React.JSX.Element {
  const tree = useReader((s) => s.tree)
  const treeError = useReader((s) => s.treeError)
  const loadTree = useReader((s) => s.loadTree)
  const refresh = useReader((s) => s.refresh)

  useEffect(() => {
    if (tree === null) void loadTree()
  }, [tree, loadTree])

  return (
    <div className="pane-list">
      <div className="pane-list-header">
        <span className="pane-list-title">Vault</span>
        <button
          type="button"
          className="button-quiet"
          title="Re-read the vault from disk"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </div>
      {treeError && <div className="note-error">{treeError}</div>}
      {tree && tree.length === 0 && !treeError ? (
        <div className="tree-empty">No markdown in this vault yet.</div>
      ) : (
        tree && <Branch nodes={tree} />
      )}
    </div>
  )
}
