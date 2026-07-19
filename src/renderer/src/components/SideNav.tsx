/**
 * v3 sidebar (parity slice B — reference/dom/01-today.html): 212 px column —
 * dex head (R1 mark · name · ▾ dex-switcher · mono engine version) →
 * full-width `＋ New [C]` cobalt button → the eight ⌘1-8 view rows (text
 * glyph · label · mono number / count pill / live dot) → product shelves
 * (caps product row + tinted project rows from the dex tree) → pinned
 * Settings row + mono keys footer. Collapse (⌘\) keeps the v2 icon rail —
 * a capability the prototype doesn't show, restyled not removed (§5.1).
 * Old QuickActionsMenu actions all live in ⌘K; ＋ New composes directly.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { TreeNode } from '../../../shared/types'
import { openCount } from '../../../shared/handoff-lanes'
import { visibleViews } from '../actions/registry'
import { useApp, type AppView } from '../stores/app'
import { useAtlas } from '../stores/atlas'
import { inboxPending, useDex } from '../stores/dex'
import { useHandoffs } from '../stores/handoffs'
import { useRails } from '../stores/rails'
import { useReader } from '../stores/reader'
import { useDashboardData } from '../views/home/dashboard-data'
import { rosterFrom } from '../views/agents/AgentsView'
import { sectionTint } from '../views/reader/sectionTint'
import { BrandMark } from './BrandMark'
import { NavIcon } from './NavIcon'

/** Prototype nav glyphs — text, 15 px slot (reference DOM). */
const GLYPH: Partial<Record<AppView, string>> = {
  home: '◎',
  handoffs: '▣',
  plan: '▤',
  reader: '▥',
  atlas: '◈',
  agents: '◉',
  feed: '≋',
  settings: '⚙',
  clients: '◫',
  search: '⌕',
  contracts: '§',
}

/** projects group → shelves: product rows + their project children. */
export function shelvesFrom(
  tree: TreeNode[] | null,
): Array<{ product: string | null; projects: TreeNode[] }> {
  const projects = (tree ?? []).find((n) => n.path === 'projects')
  if (!projects?.children) return []
  const groups = projects.children.filter((c) => c.path.includes('#product='))
  if (groups.length > 0) {
    return groups.map((g) => ({
      product: g.name === 'Ungrouped' ? null : g.name,
      projects: (g.children ?? []).filter((c) => c.kind === 'dir'),
    }))
  }
  const flat = projects.children.filter((c) => c.kind === 'dir')
  return flat.length > 0 ? [{ product: null, projects: flat }] : []
}

const SHELF_LIMIT = 3

/**
 * Agent-ops shelves: one row per manager (product), no client children — 59
 * clients across 6 managers drowned the nav. Click = the product page: the
 * Clients view scoped to that manager. Badge: the manager's pending inbox.
 */
function ManagerShelves(): React.JSX.Element {
  const fleet = useDex((s) => s.fleet) ?? []
  const byManager = new Map<string, { clients: number; pending: number }>()
  for (const c of fleet) {
    const key = c.manager ?? 'Unassigned'
    const row = byManager.get(key) ?? { clients: 0, pending: 0 }
    row.clients += 1
    row.pending += c.inboxCount
    byManager.set(key, row)
  }
  const managers = [...byManager.keys()].sort((a, b) =>
    a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b),
  )
  return (
    <>
      {managers.map((m) => {
        const row = byManager.get(m)
        return (
          <div
            key={m}
            className="side-shelf-group"
            style={{ '--shelf-tint': sectionTint(m) } as React.CSSProperties}
          >
            <button
              type="button"
              className="shelf"
              title={`${m} — open this manager's clients`}
              onClick={() => {
                useDex.getState().selectManager(m === 'Unassigned' ? null : m)
                useApp.getState().setView('clients')
              }}
            >
              <span className="shelf-head-dot" aria-hidden="true" />
              <span className="shelf-name">{m.toUpperCase()}</span>
              {row && row.pending > 0 ? (
                <span className="nav-count-pill is-warn" title="inbox items pending">
                  {row.pending}
                </span>
              ) : (
                <span className="shelf-count">{row?.clients ?? 0}</span>
              )}
            </button>
          </div>
        )
      })}
    </>
  )
}

function Shelf({
  product,
  projects,
}: {
  product: string | null
  projects: TreeNode[]
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const cards = useHandoffs((s) => s.cards)
  const dash = useDashboardData((s) => s.dash)
  const shown = showAll ? projects : projects.slice(0, SHELF_LIMIT)
  const total = projects.reduce((a, p) => a + openCount(cards ?? [], p.name), 0)
  return (
    <div
      className="side-shelf-group"
      style={{ '--shelf-tint': sectionTint(product ?? 'projects') } as React.CSSProperties}
    >
      <button type="button" className="shelf" onClick={() => setOpen(!open)}>
        <span className="shelf-caret">{open ? '▾' : '▸'}</span>
        <span className="shelf-head-dot" aria-hidden="true" />
        <span className="shelf-name">{(product ?? 'projects').toUpperCase()}</span>
        <span className="shelf-count">{total || projects.length}</span>
      </button>
      {open &&
        shown.map((p) => {
          const open_ = openCount(cards ?? [], p.name)
          const stale = dash?.states.some(
            (st) => st.project === p.name && st.notesNewerThanBrief > 0 && st.briefPath !== null,
          )
          return (
            <button
              key={p.path}
              type="button"
              className="shelf-row"
              title={`${p.name} — open in Atlas`}
              onClick={() => {
                useApp.getState().setView('atlas')
                void useAtlas.getState().drillProject(p.name)
              }}
            >
              <span
                className="shelf-dot"
                style={{ background: sectionTint(p.name) }}
                aria-hidden="true"
              />
              <span className="shelf-label">{p.name}</span>
              {stale ? (
                <span className="shelf-attn" title="brief is stale" />
              ) : open_ > 0 ? (
                <span className="shelf-n">{open_}</span>
              ) : null}
            </button>
          )
        })}
      {open && projects.length > SHELF_LIMIT && !showAll && (
        <button type="button" className="shelf-row shelf-more" onClick={() => setShowAll(true)}>
          ＋ {projects.length - SHELF_LIMIT} more…
        </button>
      )}
    </div>
  )
}

export function SideNav({ collapsed }: { collapsed: boolean }): React.JSX.Element {
  const status = useApp((s) => s.status)
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const vaultPath = useApp((s) => s.identity?.vaultPath ?? '')
  const engine = useApp((s) => s.identity?.engineVersion ?? '')
  const cards = useHandoffs((s) => s.cards)
  const tree = useReader((s) => s.tree)
  const activity = useDashboardData((s) => s.activity)
  const dexType = useDex((s) => s.type) // gates Clients row + manager shelves
  const nav = visibleViews()
  const settingsNum = nav.findIndex((e) => e.view === 'settings') + 1
  const openInbound = openCount(cards ?? [], 'all')
  // agent-ops: fleet-wide pending-inbox count on the Clients row (judge P1)
  const clientsPending = inboxPending(useDex((s) => s.fleet))
  const agentsLive = useMemo(
    () => rosterFrom(activity ?? [], Date.now()).some((r) => r.live),
    [activity],
  )
  const shelves = useMemo(() => shelvesFrom(tree), [tree])
  const dexName = vaultPath.split('/').filter(Boolean).pop() ?? 'dex'

  useEffect(() => {
    if (status === 'ready' && tree === null) void useReader.getState().loadTree()
  }, [status, tree])

  // ── collapsed: the v2 56px icon rail survives (§5.1) ──
  if (collapsed) {
    return (
      <>
      <span className="side-rail-brand" aria-hidden="true">
        <BrandMark size={22} />
      </span>
      <button
        type="button"
        className="side-collapse side-reopen"
        title="Expand the sidebar (⌘\\)"
        aria-label="Expand the sidebar"
        onClick={() => useRails.getState().toggleSidebar()}
      >
        ›
      </button>
      <nav aria-label="Views">
        {nav.map(({ view: v, label }, i) => (
          <button
            key={v}
            type="button"
            className="nav-item"
            aria-current={view === v ? 'page' : undefined}
            title={i < 9 ? `${label} (⌘${i + 1})` : label}
            aria-label={label}
            onClick={() => setView(v)}
          >
            <NavIcon view={v} />
            {v === 'handoffs' && openInbound > 0 && (
              <span className="nav-dot" title={`${openInbound} open`} />
            )}
          </button>
        ))}
      </nav>
      </>
    )
  }

  return (
    <>
      <div className="side-head">
        <BrandMark size={32} />
        <div className="side-brand">
          <span className="side-brand-name">Loredex</span>
          <span className="side-brand-dex" title={`${dexName}${engine ? ` · dex ${engine}` : ''}`}>
            {dexName}
            {engine ? ` · ${engine}` : ''}
          </span>
        </div>
        <button
          type="button"
          className="side-collapse"
          title="Collapse the sidebar (⌘\\)"
          aria-label="Collapse the sidebar"
          onClick={() => useRails.getState().toggleSidebar()}
        >
          ‹
        </button>
      </div>
      <button
        type="button"
        className="new-btn"
        title="New handoff (C · ⌘N)"
        onClick={() => {
          setView('handoffs')
          useHandoffs.getState().openCompose()
        }}
      >
        ＋ New<span className="new-btn-cap">C</span>
      </button>
      <nav aria-label="Views" className="side-nav">
        {nav.map((e, i) => ({ ...e, num: i + 1 }))
          .filter((e) => e.view !== 'settings')
          .map(({ view: v, label, num }) => (
          <Fragment key={v}>
            <button
              type="button"
              className="nav__item"
              aria-current={view === v ? 'page' : undefined}
              title={num <= 9 ? `${label} (⌘${num})` : label}
              {...(num <= 9 ? { 'aria-keyshortcuts': `Meta+${num}` } : {})}
              onClick={() => setView(v)}
            >
              <span className="nav-glyph" aria-hidden="true">
                <NavIcon view={v} />
              </span>
              {label}
              {v === 'handoffs' && openInbound > 0 ? (
                <span className="nav-count-pill">{openInbound}</span>
              ) : v === 'clients' && clientsPending > 0 ? (
                <span className="nav-count-pill is-warn" title="inbox items pending consumption">
                  {clientsPending}
                </span>
              ) : v === 'agents' && agentsLive ? (
                <span className="live-dot nav-live" title="agents live" />
              ) : num <= 9 ? (
                <span className="nav-num">{num}</span>
              ) : null}
            </button>
          </Fragment>
        ))}
      </nav>
      <div className="side-shelves">
        {dexType === 'agent-ops' ? (
          <ManagerShelves />
        ) : (
          shelves.map((s) => (
            <Shelf key={s.product ?? '_flat'} product={s.product} projects={s.projects} />
          ))
        )}
      </div>
      <div className="side-spring" />
      <button
        type="button"
        className="nav__item"
        aria-current={view === 'settings' ? 'page' : undefined}
        title={`Settings (⌘${settingsNum})`}
        aria-keyshortcuts={`Meta+${settingsNum}`}
        onClick={() => setView('settings')}
      >
        <span className="nav-glyph" aria-hidden="true">
          <NavIcon view="settings" />
        </span>
        Settings
        <span className="nav-num">{settingsNum}</span>
      </button>
      <div className="keys-footer">keys 1–9 · ⌘K · C new · E consume</div>
    </>
  )
}
