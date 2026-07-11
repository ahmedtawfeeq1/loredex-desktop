/**
 * Vault Atlas view (stories 10.2/10.3): discrete zoom — Overview (project
 * clusters + aggregated flow), Learn (one project: topic atoms, lazy expand),
 * Deep Dive (everything in scope) — with breadcrumbs and a bounded history.
 * Exploring feels like browsing, never panning a physics diagram.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { AtlasLevel, AtlasNode } from '../../../../shared/types'
import './atlas.css'
import { useAtlas } from '../../stores/atlas'
import { useHandoffs } from '../../stores/handoffs'
import { AtlasBreadcrumbs } from './AtlasBreadcrumbs'
import { AtlasCanvas } from './AtlasCanvas'
import { activeFilterCount, applyAtlasFilters, focusNeighborhood } from './atlas-filters'
import { AtlasFilterPanel } from './AtlasFilterPanel'
import { AtlasLegend } from './AtlasLegend'
import { type ToolbarAction, TOOLBAR_GROUPS, toolbarLabel } from './atlas-toolbar'
import { visibleAtlas } from './atlas-visibility'
import { BlockedList } from './BlockedList'
import { affectedNodeIds, clusterChangedCounts } from './changed-since'
import { ChangedSinceToggle } from './ChangedSinceToggle'
import type { AtlasDecor } from './decor'
import { exportAtlasView } from './export'
import { PathTrace } from './PathTrace'
import { activateNode, performResolution, resolveEdgeTarget } from './resolve'
import { ProjectLauncher } from './ProjectLauncher'
import { ProjectPage } from './ProjectPage'
import { TourPanel } from './TourPanel'

const LEVEL_LABEL: Record<AtlasLevel, string> = {
  overview: 'Overview',
  learn: 'Learn',
  deep: 'Deep Dive',
}

export function AtlasView(): React.JSX.Element {
  const graph = useAtlas((s) => s.graph)
  const loading = useAtlas((s) => s.loading)
  const error = useAtlas((s) => s.error)
  const level = useAtlas((s) => s.level)
  const scope = useAtlas((s) => s.scope)
  const selectedId = useAtlas((s) => s.selectedId)
  const expandedTopic = useAtlas((s) => s.expandedTopic)
  const select = useAtlas((s) => s.select)
  const load = useAtlas((s) => s.load)
  const navigate = useAtlas((s) => s.navigate)
  const drillProject = useAtlas((s) => s.drillProject)
  const toggleTopic = useAtlas((s) => s.toggleTopic)
  const up = useAtlas((s) => s.up)
  const panel = useAtlas((s) => s.panel)
  const setPanel = useAtlas((s) => s.setPanel)
  const tourHighlight = useAtlas((s) => s.tourHighlight)
  const activeTour = useAtlas((s) => s.activeTour)
  const filters = useAtlas((s) => s.filters)
  const toggleBlocked = useAtlas((s) => s.toggleBlocked)
  const focusId = useAtlas((s) => s.focusId)
  const setFocus = useAtlas((s) => s.setFocus)
  const pathResult = useAtlas((s) => s.pathResult)
  const searchRings = useAtlas((s) => s.searchRings)
  const overlayOn = useAtlas((s) => s.overlayOn)
  const overlayChanged = useAtlas((s) => s.overlayChanged)
  const toggleOverlay = useAtlas((s) => s.toggleOverlay)
  const legendOpen = useAtlas((s) => s.legendOpen)
  const openLegend = useAtlas((s) => s.openLegend)
  const maybeAutoOpenLegend = useAtlas((s) => s.maybeAutoOpenLegend)
  const [exportOpen, setExportOpen] = useState(false)
  // Atlas reframe WP2: Overview defaults to the readable project LAUNCHER; the
  // SVG topology is one "Flow view" toggle away (topology preserved for who
  // wants it). Local UI state — resets to the launcher each visit, by design.
  const [flowView, setFlowView] = useState(false)

  useEffect(() => {
    // live data (watcher/poller) keeps it fresh after this first fetch
    if (graph === null && !loading) void load()
  }, [graph, loading, load])

  useEffect(() => {
    // first-ever Atlas visit opens the legend once (app.db flag)
    void maybeAutoOpenLegend()
  }, [maybeAutoOpenLegend])

  useEffect(() => {
    // ⌘[ / ⌘] — history back/forward while the atlas is on screen
    function onKey(e: KeyboardEvent): void {
      if (!e.metaKey || (e.key !== '[' && e.key !== ']')) return
      e.preventDefault()
      const s = useAtlas.getState()
      void (e.key === '[' ? s.back() : s.forward())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // filters narrow the rendered set live, composing AND across facets (10.6 AC2)
  const shownGraph = useMemo(() => {
    if (!graph) return null
    const kept = applyAtlasFilters(graph.nodes, graph.edges, filters)
    return { ...graph, nodes: kept.nodes, edges: kept.edges }
  }, [graph, filters])

  const visibility = useMemo(
    () => (shownGraph ? visibleAtlas(shownGraph, expandedTopic) : { nodes: [], atoms: [] }),
    [shownGraph, expandedTopic],
  )

  const decor = useMemo<AtlasDecor>(() => {
    const path = pathResult && pathResult !== 'none' ? pathResult : null
    // the overlay composes with filters/focus (10.7 AC2): sets derive over the
    // SHOWN edges; toggling it off restores the plain canvas
    const changed = overlayOn && overlayChanged.size > 0 ? overlayChanged : null
    return {
      ...(tourHighlight.length > 0 ? { tour: new Set(tourHighlight) } : {}),
      ...(searchRings.size > 0 ? { search: searchRings } : {}),
      ...(path ? { path: new Set(path.nodeIds), pathEdges: new Set(path.edgeIds) } : {}),
      ...(changed && shownGraph
        ? { changed, affected: affectedNodeIds(changed, shownGraph.edges) }
        : {}),
      // focus composes with the filtered set (10.6 AC5): 1-hop over shown edges
      ...(focusId && shownGraph
        ? { focus: focusNeighborhood(focusId, shownGraph.edges) }
        : {}),
    }
  }, [tourHighlight, searchRings, pathResult, focusId, shownGraph, overlayOn, overlayChanged])

  const changedCounts = useMemo(
    () => (overlayOn ? clusterChangedCounts(overlayChanged) : undefined),
    [overlayOn, overlayChanged],
  )

  // the selected node's project — lets the Learn segment work from Overview
  const selectedProject = useMemo(() => {
    const node = graph?.nodes.find((n) => n.id === selectedId)
    return node?.type === 'project' ? node.label : node?.project
  }, [graph, selectedId])
  const learnTarget = scope.project ?? selectedProject

  // Atlas reframe: Learn is now a readable project PAGE (ProjectPage), not the
  // SVG graph. The neighbor-flow relationship strip moved onto that page's
  // flows-with section, so the header no longer renders it.
  const showProjectPage = level === 'learn'
  // Overview renders the launcher by default; Flow view falls back to the graph
  const showLauncher = level === 'overview' && !flowView

  function onActivate(node: AtlasNode): void {
    // §3 resolution table, one click per row (story 10.4): project drills
    // (10.3's row), everything else resolves through views/atlas/resolve.ts
    if (node.type === 'project') void drillProject(node.label)
    else void activateNode(node)
  }

  // D1 amendment 3 header: each toolbar pill's pressed state + click, mapped
  // from the model id to the same handlers the old naked buttons carried
  function pillState(id: ToolbarAction['id']): { pressed: boolean; onClick: () => void } {
    switch (id) {
      case 'tours':
        return { pressed: panel === 'tour', onClick: () => setPanel(panel === 'tour' ? null : 'tour') }
      case 'filters':
        return { pressed: panel === 'filters', onClick: () => setPanel(panel === 'filters' ? null : 'filters') }
      case 'path':
        return { pressed: panel === 'path', onClick: () => setPanel(panel === 'path' ? null : 'path') }
      case 'blocked':
        return { pressed: filters.blocked, onClick: toggleBlocked }
      case 'changed':
        return {
          pressed: overlayOn,
          onClick: () => {
            if (overlayOn && panel !== 'changed') setPanel('changed')
            else toggleOverlay()
          },
        }
      case 'export':
        return { pressed: exportOpen, onClick: () => setExportOpen((o) => !o) }
      case 'help':
        return { pressed: legendOpen, onClick: openLegend }
    }
  }

  function pillLabel(action: ToolbarAction): string {
    if (action.id === 'tours') return `${action.label}${activeTour ? ' ●' : ''}`
    return toolbarLabel(action, activeFilterCount(filters))
  }

  return (
    <div className="atlas">
      <div className="atlas-header">
        {/* D1 amendment 6: actions on row 1, breadcrumb navigation on its own
            row below — the toolbar no longer overlaps the breadcrumb. */}
        <div className="atlas-header-row">
        <div className="atlas-header-left">
          <span className="atlas-eyebrow">VAULT ATLAS</span>
          <div className="seg-control" role="tablist" aria-label="Zoom level">
            {(['overview', 'learn', 'deep'] as const).map((l) => (
              <button
                key={l}
                type="button"
                className="seg-option"
                role="tab"
                aria-selected={level === l}
                disabled={l === 'learn' && !learnTarget}
                title={
                  l === 'learn' && !learnTarget
                    ? 'Select or open a project first'
                    : `${LEVEL_LABEL[l]} level`
                }
                onClick={() => {
                  if (l === 'overview') void navigate('overview', {})
                  else if (l === 'learn' && learnTarget) void navigate('learn', { project: learnTarget })
                  else if (l === 'deep') void navigate('deep', scope)
                }}
              >
                {LEVEL_LABEL[l]}
              </button>
            ))}
          </div>
        </div>
        <div className="atlas-toolbar">
          {TOOLBAR_GROUPS.map((group, gi) => (
            // biome-ignore lint: group index is a stable structural key here
            <Fragment key={gi}>
              {gi > 0 && <span className="atlas-tool-divider" aria-hidden />}
              <div className="atlas-tool-group">
                {group.map((action) => {
                  const state = pillState(action.id)
                  if (action.id === 'export') {
                    return (
                      <div key={action.id} className="atlas-export-wrap">
                        <button
                          type="button"
                          className="atlas-tool"
                          aria-pressed={state.pressed}
                          aria-haspopup="menu"
                          aria-expanded={exportOpen}
                          title={action.tooltip}
                          onClick={state.onClick}
                        >
                          <span className="atlas-tool-icon" aria-hidden>
                            {action.icon}
                          </span>
                          {action.label} ▾
                        </button>
                        {exportOpen && (
                          <div className="atlas-export-menu" role="menu">
                            {(action.submenu ?? []).map((fmt) => (
                              <button
                                key={fmt}
                                type="button"
                                role="menuitem"
                                className="atlas-export-item"
                                title={`Export the current view as ${fmt.toUpperCase()}`}
                                onClick={() => {
                                  setExportOpen(false)
                                  void exportAtlasView(fmt)
                                }}
                              >
                                {fmt.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }
                  const helpPill = action.id === 'help'
                  return (
                    <button
                      key={action.id}
                      type="button"
                      className={`atlas-tool${helpPill ? ' atlas-tool-icon-only' : ''}`}
                      aria-pressed={state.pressed}
                      aria-label={helpPill ? action.label : undefined}
                      title={action.tooltip}
                      onClick={state.onClick}
                    >
                      <span className="atlas-tool-icon" aria-hidden>
                        {action.icon}
                      </span>
                      {!helpPill && pillLabel(action)}
                    </button>
                  )
                })}
              </div>
            </Fragment>
          ))}
        </div>
        </div>
        <div className="atlas-header-nav">
          <AtlasBreadcrumbs />
          {level === 'overview' && (
            <div
              className="seg-control atlas-flow-toggle"
              role="tablist"
              aria-label="Overview display"
            >
              <button
                type="button"
                className="seg-option"
                role="tab"
                aria-selected={!flowView}
                title="Read the vault as a grid of project cards"
                onClick={() => setFlowView(false)}
              >
                Launcher
              </button>
              <button
                type="button"
                className="seg-option"
                role="tab"
                aria-selected={flowView}
                title="See the project flow topology as a graph"
                onClick={() => setFlowView(true)}
              >
                Flow view
              </button>
            </div>
          )}
        </div>
      </div>
      {legendOpen && <AtlasLegend />}
      {error && <div className="note-error">{error}</div>}
      {graph === null ? (
        <div className="atlas-loading" aria-label="Loading the atlas">
          <div className="atlas-loading-card" />
          <div className="atlas-loading-card" />
          <div className="atlas-loading-card" />
        </div>
      ) : graph.nodes.length === 0 ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>Nothing to map yet — the atlas draws itself from projects and handoffs.</p>
          <button
            type="button"
            className="button-primary"
            onClick={() => useHandoffs.getState().openCompose()}
          >
            Compose a handoff
          </button>
        </div>
      ) : showProjectPage ? (
        // Atlas reframe (spec §Learn): Learn renders the readable project PAGE,
        // never the SVG canvas. The graph tools (tour/filters/path/…) are graph
        // affordances and stay with Deep Dive + the Overview flow-view.
        graph.level === 'learn' ? (
          <div className="atlas-body atlas-body-page">
            <ProjectPage graph={graph} />
          </div>
        ) : (
          <div className="atlas-loading" aria-label="Opening the project page">
            <div className="atlas-loading-card" />
            <div className="atlas-loading-card" />
          </div>
        )
      ) : showLauncher ? (
        // Atlas reframe (spec §Overview): Overview renders the readable project
        // LAUNCHER by default; the SVG topology is the Flow-view toggle above.
        <div className="atlas-body atlas-body-page">
          <ProjectLauncher />
        </div>
      ) : (
        <div className="atlas-body">
          <AtlasCanvas
            graph={shownGraph ?? graph}
            visibleNodes={visibility.nodes}
            atoms={visibility.atoms}
            selectedId={selectedId}
            onSelect={(n) => select(n?.id ?? null)}
            onActivate={onActivate}
            onActivateEdge={(edge, nearerEnd) => {
              const byId = new Map(graph.nodes.map((n) => [n.id, n]))
              const target = resolveEdgeTarget(edge, byId, nearerEnd)
              if (!target) return
              if ('board' in target) performResolution({ kind: 'board', project: target.board })
              else onActivate(target.node)
            }}
            onExpandTopic={toggleTopic}
            // Esc exits focus mode first (10.6 AC4), then walks up (10.3)
            onEscape={() => {
              if (focusId) setFocus(null)
              else void up()
            }}
            // 'f' on a selected card toggles the 1-hop isolate
            onFocusKey={() => {
              if (selectedId) setFocus(focusId === selectedId ? null : selectedId)
            }}
            decor={decor}
            fitToIds={tourHighlight}
            changedCounts={changedCounts}
          />
          {panel === 'tour' && <TourPanel />}
          {panel === 'filters' && <AtlasFilterPanel />}
          {panel === 'path' && <PathTrace />}
          {panel === 'blocked' && <BlockedList />}
          {panel === 'changed' && <ChangedSinceToggle />}
        </div>
      )}
    </div>
  )
}
