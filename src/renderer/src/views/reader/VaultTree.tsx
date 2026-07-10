/**
 * Collapsible vault folder tree (story 2.1; sections re-skinned by story 16.3,
 * DESIGN.md Addendum D1 "Vault tree sections"). Top-level groups (_index,
 * projects) and each project render as rounded tinted section rows — tint is
 * a deterministic hash of the name (sectionTint.ts), collapse state persists
 * per vault (treeSections store). Notes under a project carry a 2px left rail
 * in the project color; selection keeps the gold rail. Deeper folders stay
 * native <details> (free keyboard support).
 */
import { useEffect, useState } from 'react'
import type { TreeNode } from '../../../../shared/types'
import { RailChevron } from '../../components/NavIcon'
import { useRails } from '../../stores/rails'
import { useReader } from '../../stores/reader'
import { useTreeSections } from '../../stores/treeSections'
import { sectionTint } from './sectionTint'
import { filterTree } from './treeFilter'

/** Per-file search (user request, shipped with story 16.7): scoped styles —
 *  styles.css is owned by a concurrently-committing workflow. */
const TREE_FILTER_CSS = `
.tree-filter {
  display: block;
  width: calc(100% - 16px);
  margin: 0 8px 8px;
  padding: 5px 8px;
  font: inherit;
  font-size: 12px;
  color: var(--text-1);
  background: var(--bg-inset);
  border: 1px solid var(--hairline);
  border-radius: 6px;
}
.tree-filter::placeholder { color: var(--text-2); }
.rail-collapsed .tree-filter { display: none; }
`

function FileRow({ node, inProject }: { node: TreeNode; inProject: boolean }): React.JSX.Element {
  const selected = useReader((s) => s.selected)
  const open = useReader((s) => s.open)
  return (
    <button
      type="button"
      className={inProject ? 'tree-file tree-file-project' : 'tree-file'}
      aria-current={selected === node.path}
      title={node.path}
      onClick={() => void open(node.path)}
    >
      {node.name}
    </button>
  )
}

/** Rounded tinted section row (D1): dot solid, label 11px caps, chevron
 *  collapses — the tint inherits to descendants as `--section-color`. */
function SectionNode({
  node,
  isProject,
  forceOpen = false,
}: {
  node: TreeNode
  isProject: boolean
  /** an active per-file search overrides collapse — matches must show */
  forceOpen?: boolean
}): React.JSX.Element {
  const collapsed = useTreeSections((s) => s.collapsed.includes(node.path)) && !forceOpen
  return (
    <li
      className="tree-section-item"
      style={{ '--section-color': sectionTint(node.name) } as React.CSSProperties}
    >
      <button
        type="button"
        className="tree-section"
        aria-expanded={!collapsed}
        title={collapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
        onClick={() => useTreeSections.getState().toggle(node.path)}
      >
        <span className="tree-section-dot" aria-hidden />
        <span className="tree-section-label">{node.name}</span>
        <span className="tree-section-chevron" aria-hidden>
          <RailChevron dir={collapsed ? 'right' : 'down'} />
        </span>
      </button>
      {!collapsed && node.children && (
        <Branch
          nodes={node.children}
          sections={!isProject && node.name === 'projects' ? 'projects' : 'none'}
          inProject={isProject}
          forceOpen={forceOpen}
        />
      )}
    </li>
  )
}

function Branch({
  nodes,
  sections = 'none',
  inProject = false,
  forceOpen = false,
}: {
  nodes: TreeNode[]
  /** which dirs at THIS level are D1 section rows: top-level groups, then
   *  each project under the projects group; everything deeper is a plain dir */
  sections?: 'groups' | 'projects' | 'none'
  inProject?: boolean
  forceOpen?: boolean
}): React.JSX.Element {
  return (
    <ul className="tree-branch">
      {nodes.map((node) =>
        node.kind === 'dir' && sections !== 'none' ? (
          <SectionNode
            key={node.path}
            node={node}
            isProject={sections === 'projects'}
            forceOpen={forceOpen}
          />
        ) : (
          <li key={node.path}>
            {node.kind === 'dir' ? (
              <details open>
                <summary className="tree-dir">{node.name}</summary>
                {node.children && (
                  <Branch nodes={node.children} inProject={inProject} forceOpen={forceOpen} />
                )}
              </details>
            ) : (
              <FileRow node={node} inProject={inProject} />
            )}
          </li>
        ),
      )}
    </ul>
  )
}

export function VaultTree(): React.JSX.Element {
  const tree = useReader((s) => s.tree)
  const treeError = useReader((s) => s.treeError)
  const loadTree = useReader((s) => s.loadTree)
  const refresh = useReader((s) => s.refresh)
  // Addendum D1 collapsible rails (story 16.2): ⌘⇧\ or the header chevron
  // slides the pane to 0 — the reader goes full-bleed to the sidebar
  const collapsed = useRails((s) => s.list)
  // per-file search (user request): session-only filter over the tree
  const [query, setQuery] = useState('')
  const filtering = query.trim().length > 0
  const visible = tree ? filterTree(tree, query) : tree

  useEffect(() => {
    if (tree === null) void loadTree()
  }, [tree, loadTree])

  return (
    <div className={collapsed ? 'pane-list rail-collapsed' : 'pane-list'}>
      <div className="pane-list-header">
        <span className="pane-list-title">Vault</span>
        <span className="pane-list-actions">
          <button
            type="button"
            className="button-quiet"
            title="Re-read the vault from disk"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rail-toggle"
            title="Collapse the file list (⇧⌘\)"
            aria-label="Collapse the file list"
            aria-expanded={!collapsed}
            aria-keyshortcuts="Meta+Shift+\"
            onClick={() => useRails.getState().toggleList()}
          >
            <RailChevron dir="left" />
          </button>
        </span>
      </div>
      <style>{TREE_FILTER_CSS}</style>
      <input
        className="tree-filter"
        type="search"
        placeholder="Search files…"
        aria-label="Search files by name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {treeError && <div className="note-error">{treeError}</div>}
      {tree && tree.length === 0 && !treeError ? (
        <div className="tree-empty">No markdown in this vault yet.</div>
      ) : filtering && visible && visible.length === 0 ? (
        <div className="tree-empty">No files match “{query.trim()}”.</div>
      ) : (
        visible && <Branch nodes={visible} sections="groups" forceOpen={filtering} />
      )}
    </div>
  )
}
