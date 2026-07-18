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
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { SearchHit } from '../../../../shared/ipc-contract'
import type { TreeNode } from '../../../../shared/types'
import { invoke, openInNewWindow } from '../../api'
import { RailChevron } from '../../components/NavIcon'
import { humanizeTitle, noteDate } from '../../humanize'
import { useDex } from '../../stores/dex'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
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

/** Right-click menu on note rows: every lifecycle action without hunting the
 *  meta rail — Open, Open in New Window, Archive/Unarchive, Delete. */
const useNoteMenu = create<{
  menu: { path: string; x: number; y: number } | null
  close(): void
}>((set) => ({ menu: null, close: () => set({ menu: null }) }))

function openNoteMenu(path: string, x: number, y: number): void {
  useNoteMenu.setState({ menu: { path, x, y } })
}

function NoteContextMenu(): React.JSX.Element | null {
  const menu = useNoteMenu((s) => s.menu)
  const close = useNoteMenu((s) => s.close)
  const identity = useIdentity((s) => effectiveIdentity(s))
  const [confirmDelete, setConfirmDelete] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the delete arm per target
  useEffect(() => setConfirmDelete(false), [menu])
  if (menu === null) return null

  const archived = menu.path.startsWith('_archive/') || menu.path.includes('/_archive/')
  async function lifecycle(mode: 'delete' | 'archive' | 'unarchive'): Promise<void> {
    if (identity === null || menu === null) return
    try {
      await invoke('vault.removeNote', { path: menu.path, mode, identity })
      const reader = useReader.getState()
      if (reader.selected === menu.path && mode !== 'unarchive') reader.reset()
      void reader.loadTree()
    } catch {
      // vault.changed refresh will reconcile; the action simply didn't apply
    }
    close()
  }
  const needsIdentity = identity === null ? 'Set your name and email in Settings first' : undefined

  return (
    // biome-ignore lint: backdrop click-away; Esc closes via keydown below
    <div
      className="ctx-menu-backdrop"
      onMouseDown={close}
      onKeyDown={(e) => e.key === 'Escape' && close()}
    >
      <div
        className="ctx-menu"
        role="menu"
        style={{ left: menu.x, top: menu.y }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            void useReader.getState().open(menu.path)
            close()
          }}
        >
          Open
        </button>
        <button
          type="button"
          role="menuitem"
          title="Open this dex in a second window"
          onClick={() => {
            void openInNewWindow()
            close()
          }}
        >
          Open in New Window
        </button>
        {archived ? (
          <button
            type="button"
            role="menuitem"
            disabled={identity === null}
            title={needsIdentity}
            onClick={() => void lifecycle('unarchive')}
          >
            Unarchive
          </button>
        ) : (
          <button
            type="button"
            role="menuitem"
            disabled={identity === null}
            title={needsIdentity}
            onClick={() => void lifecycle('archive')}
          >
            Archive
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          className="ctx-menu-danger"
          disabled={identity === null}
          title={needsIdentity}
          onClick={() => {
            if (confirmDelete) void lifecycle('delete')
            else setConfirmDelete(true)
          }}
        >
          {confirmDelete ? 'Confirm delete' : 'Delete'}
        </button>
      </div>
    </div>
  )
}

function FileRow({ node, inProject }: { node: TreeNode; inProject: boolean }): React.JSX.Element {
  const selected = useReader((s) => s.selected)
  const open = useReader((s) => s.open)
  // story 17.1 (D1 amendment 3): humanized title + small right-aligned date;
  // the real filename stays in the tooltip (title={node.path})
  const date = noteDate(node.name)
  // agent-ops data files keep their raw name + show a type glyph instead of a date
  const isData = node.fileType !== undefined && node.fileType !== 'md'
  return (
    <div
      className="tree-file-row"
      onContextMenu={(e) => {
        // md notes only — data files have no archive/delete lifecycle here
        if (isData) return
        e.preventDefault()
        openNoteMenu(node.path, e.clientX, e.clientY)
      }}
    >
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
      {!isData && (
        <button
          type="button"
          className="tree-file-menu"
          aria-label={`Actions for ${humanizeTitle(node.name)}`}
          title="Actions"
          onClick={(e) => {
            e.stopPropagation()
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            openNoteMenu(node.path, r.right, r.bottom)
          }}
        >
          ⋯
        </button>
      )}
    </div>
  )
}

/** Rounded tinted section row (D1): dot solid, label 11px caps, chevron
 *  collapses — the tint inherits to descendants as `--section-color`. */
function SectionNode({
  node,
  isProject,
  sub = false,
  forceOpen = false,
}: {
  node: TreeNode
  isProject: boolean
  /** hierarchy (user feedback 2026-07-17): an indented project box under a
   *  product — same tinted box, one step in, friendly humanized label */
  sub?: boolean
  /** an active per-file search overrides collapse — matches must show */
  forceOpen?: boolean
}): React.JSX.Element {
  const collapsed = useTreeSections((s) => s.collapsed.includes(node.path)) && !forceOpen
  // agent-ops relabel: the projects group reads "clients" (folder name unchanged)
  const agentOps = useDex((s) => s.type === 'agent-ops')
  const label = sub
    ? humanizeTitle(node.name)
    : agentOps && node.name === 'projects'
      ? 'clients'
      : node.name
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
        className={sub ? 'tree-section tree-section-sub' : 'tree-section'}
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
      {!collapsed &&
        (node.children && node.children.length > 0 ? (
          <Branch
            nodes={node.children}
            sections={
              sub
                ? 'none'
                : isProject
                  ? 'subprojects'
                  : node.name === 'projects'
                    ? 'projects'
                    : 'none'
            }
            inProject={isProject || sub}
            forceOpen={forceOpen}
          />
        ) : (
          <div className="tree-empty tree-empty-nested">Empty</div>
        ))}
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
  sections?: 'groups' | 'projects' | 'subprojects' | 'none'
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
            sub={sections === 'subprojects'}
            forceOpen={forceOpen}
          />
        ) : (
          <li key={node.path}>
            {node.kind === 'dir' ? (
              <details open>
                <summary className="tree-dir" title={node.name}>
                  <span className="tree-dir-icon" aria-hidden>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M1.5 4a1.5 1.5 0 0 1 1.5-1.5h3.2l1.6 1.8H13A1.5 1.5 0 0 1 14.5 5.8v6.2a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 12V4Z"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  {humanizeTitle(node.name)}
                </summary>
                {node.children && node.children.length > 0 ? (
                  <Branch nodes={node.children} inProject={inProject} forceOpen={forceOpen} />
                ) : (
                  <div className="tree-empty">Empty</div>
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
      <NoteContextMenu />
    </div>
  )
}
