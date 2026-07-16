/**
 * Collapsible vault folder tree (story 2.1; sections re-skinned by story 16.3,
 * DESIGN.md Addendum D1 "Vault tree sections"). Top-level groups (_index,
 * projects) and each project render as rounded tinted section rows — tint is
 * a deterministic hash of the name (sectionTint.ts), collapse state persists
 * per vault (treeSections store). Notes under a project carry a 2px left rail
 * in the project color; selection keeps the gold rail. Deeper folders stay
 * native <details> (free keyboard support).
 *
 * D1 amendment 3 (story epic17.4/17.5): the pane is drag-resizable (width from
 * the rails store, applied here) and the "Search files…" box has a Name |
 * Content segmented toggle — Content runs vault.search full-text and replaces
 * the tree with a flat result list (fileSearch store).
 */
import { Button } from '../../components/Button'
import { useEffect } from 'react'
import type { SearchHit } from '../../../../shared/ipc-contract'
import type { TreeNode } from '../../../../shared/types'
import { RailChevron } from '../../components/NavIcon'
import { humanizeTitle, noteDate } from '../../humanize'
import { useDex } from '../../stores/dex'
import { useFileSearch } from '../../stores/fileSearch'
import { useRails } from '../../stores/rails'
import { useReader } from '../../stores/reader'
import { useTreeSections } from '../../stores/treeSections'
import { openSearchResult } from '../../stores/search'
import { Highlight } from '../search/SearchView'
import { sectionTint } from './sectionTint'
import { filterTree } from './treeFilter'

/** Per-file search (user request, shipped with story 16.7; extended by
 *  epic17.5 with the mode toggle + content result rows): scoped styles —
 *  styles.css is owned by a concurrently-committing workflow. */
const TREE_FILTER_CSS = `
.pane-list { position: relative; }
.pane-list.list-resizing { transition: none; } /* track the cursor 1:1 mid-drag */
.tree-search { margin: 0 8px 8px; }
.tree-mode {
  display: flex;
  gap: 2px;
  margin-bottom: 6px;
  padding: 2px;
  background: var(--bg-inset);
  border: 1px solid var(--hairline);
  border-radius: 7px;
}
.tree-mode button {
  flex: 1;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-2);
  border-radius: 5px;
}
.tree-mode button[aria-pressed='true'] {
  background: var(--bg-card);
  color: var(--text-1);
  box-shadow: var(--shadow-card);
}
.tree-filter {
  display: block;
  width: 100%;
  padding: 5px 8px;
  font: inherit;
  font-size: 12px;
  color: var(--text-1);
  background: var(--bg-inset);
  border: 1px solid var(--hairline);
  border-radius: 6px;
}
.tree-filter::placeholder { color: var(--text-2); }
.rail-collapsed .tree-search { display: none; }
.file-search-results { list-style: none; margin: 0; padding: 0 8px 8px 0; }
.file-search-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--section-color, var(--text-2));
}
.file-search-head { display: flex; align-items: center; gap: 6px; }
.file-search-head .search-row-title { flex: 1; min-width: 0; }
.tree-file-type {
  flex: none;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-2);
  border: 1px solid var(--hairline);
  border-radius: 4px;
  padding: 0 4px;
}
`

function FileRow({ node, inProject }: { node: TreeNode; inProject: boolean }): React.JSX.Element {
  const selected = useReader((s) => s.selected)
  const open = useReader((s) => s.open)
  // story 17.1 (D1 amendment 3): humanized title + small right-aligned date;
  // the real filename stays in the tooltip (title={node.path})
  const date = noteDate(node.name)
  // agent-ops data files keep their raw name + show a type glyph instead of a date
  const isData = node.fileType !== undefined && node.fileType !== 'md'
  return (
    <button
      type="button"
      className={inProject ? 'tree-file tree-file-project' : 'tree-file'}
      aria-current={selected === node.path}
      title={node.path}
      onClick={() => void open(node.path)}
    >
      <span className="tree-file-name">{isData ? node.name : humanizeTitle(node.name)}</span>
      {isData ? (
        <span className="tree-file-type">{node.fileType}</span>
      ) : (
        date && <span className="tree-file-date">{date}</span>
      )}
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
  // agent-ops relabel: the projects group reads "clients" (folder name unchanged)
  const agentOps = useDex((s) => s.type === 'agent-ops')
  const label = agentOps && node.name === 'projects' ? 'clients' : node.name
  // v3 P7 (story 26.8): client rows carry their fleet facts — tag chips +
  // the inbox pending badge (amber = attention, §1) — read-only, from the
  // already-loaded fleet model
  const client = useDex((s) =>
    agentOps && isProject ? (s.fleet ?? []).find((c) => c.slug === node.name) : undefined,
  )
  return (
    <li
      className="tree-section-item"
      style={{ '--section-color': sectionTint(node.name) } as React.CSSProperties}
    >
      <button
        type="button"
        className="tree-section"
        aria-expanded={!collapsed}
        title={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        onClick={() => useTreeSections.getState().toggle(node.path)}
      >
        <span className="tree-section-dot" aria-hidden />
        <span className="tree-section-label">{label}</span>
        {client && client.tags.length > 0 && (
          <span className="tree-client-tags">
            {client.tags.slice(0, 3).map((t) => (
              <span key={t} className="tree-client-tag">
                {t}
              </span>
            ))}
          </span>
        )}
        {client && client.inboxCount > 0 && (
          <span
            className="tree-client-inbox"
            title={`${client.inboxCount} inbox item(s) pending consumption`}
          >
            {client.inboxCount}
          </span>
        )}
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

/** Content-mode result row (story epic17.5): humanized title, project tint dot,
 *  term-highlighted snippet, date. Click (or Enter → top hit) opens in the
 *  reader through the shared openSearchResult. */
function ContentRow({ hit, query }: { hit: SearchHit; query: string }): React.JSX.Element {
  return (
    <li>
      <button
        type="button"
        className="search-row"
        title={hit.path}
        onClick={() => openSearchResult(hit.path)}
      >
        <span className="file-search-head">
          <span
            className="file-search-dot"
            aria-hidden
            style={{ '--section-color': sectionTint(hit.project) } as React.CSSProperties}
          />
          <span className="search-row-title">
            <Highlight text={humanizeTitle(hit.name)} query={query} />
          </span>
          {hit.date && <span className="tree-file-date">{hit.date}</span>}
        </span>
        <span className="search-row-snippet">
          <Highlight text={hit.excerpt} query={query} />
        </span>
      </button>
    </li>
  )
}

/** The Content full-text results that replace the tree while Content mode is
 *  active (story epic17.5). */
function ContentResults(): React.JSX.Element {
  const query = useFileSearch((s) => s.query)
  const results = useFileSearch((s) => s.results)
  const searching = useFileSearch((s) => s.searching)
  const error = useFileSearch((s) => s.error)

  if (error) return <div className="note-error">{error}</div>
  if (results === null) {
    return <div className="tree-empty">Type to search note contents.</div>
  }
  if (results.length === 0) {
    return <div className="tree-empty">{searching ? 'Searching…' : 'No notes match.'}</div>
  }
  return (
    <ul className="file-search-results" aria-label="Content search results">
      {results.map((hit) => (
        <ContentRow key={hit.path} hit={hit} query={query} />
      ))}
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
  // story epic17.4: drag-resizable width (no inline width while collapsed, so
  // the .rail-collapsed width:0 wins); the transition is killed mid-drag
  const listWidth = useRails((s) => s.listWidth)
  const resizing = useRails((s) => s.resizing)
  // story epic17.5: Name | Content search modes over the "Search files…" box
  const mode = useFileSearch((s) => s.mode)
  const query = useFileSearch((s) => s.query)
  const setMode = useFileSearch((s) => s.setMode)
  const setQuery = useFileSearch((s) => s.setQuery)
  const nameFiltering = mode === 'name' && query.trim().length > 0
  const visible = tree && nameFiltering ? filterTree(tree, query) : tree

  useEffect(() => {
    if (tree === null) void loadTree()
  }, [tree, loadTree])

  function onSearchKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      useFileSearch.getState().escape()
    } else if (e.key === 'Enter' && mode === 'content') {
      e.preventDefault()
      useFileSearch.getState().openTop(openSearchResult)
    }
  }

  const className = [
    'pane-list',
    collapsed ? 'rail-collapsed' : '',
    resizing ? 'list-resizing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className} style={collapsed ? undefined : { width: listWidth }}>
      <style>{TREE_FILTER_CSS}</style>
      <div className="pane-list-header">
        <span className="pane-list-title">Dex</span>
        <span className="pane-list-actions">
          <Button
            variant="quiet"
            title="Re-read the vault from disk"
            onClick={() => void refresh()}>
            Refresh
          </Button>
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
      <div className="tree-search">
        <div className="tree-mode" role="group" aria-label="Search mode">
          <button
            type="button"
            aria-pressed={mode === 'name'}
            onClick={() => setMode('name')}
          >
            Name
          </button>
          <button
            type="button"
            aria-pressed={mode === 'content'}
            onClick={() => setMode('content')}
          >
            Content
          </button>
        </div>
        <input
          className="tree-filter"
          type="search"
          placeholder={mode === 'content' ? 'Search note contents…' : 'Search files…'}
          aria-label={mode === 'content' ? 'Search note contents' : 'Search files by name'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
        />
      </div>
      {mode === 'content' ? (
        <ContentResults />
      ) : (
        <>
          {treeError && <div className="note-error">{treeError}</div>}
          {tree && tree.length === 0 && !treeError ? (
            <div className="tree-empty">No markdown in this vault yet.</div>
          ) : nameFiltering && visible && visible.length === 0 ? (
            <div className="tree-empty">No files match “{query.trim()}”.</div>
          ) : (
            visible && <Branch nodes={visible} sections="groups" forceOpen={nameFiltering} />
          )}
        </>
      )}
    </div>
  )
}
