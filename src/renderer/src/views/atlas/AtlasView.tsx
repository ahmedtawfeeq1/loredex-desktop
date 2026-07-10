/**
 * Vault Atlas view (stories 10.2/10.3): discrete zoom — Overview (project
 * clusters + aggregated flow), Learn (one project: topic atoms, lazy expand),
 * Deep Dive (everything in scope) — with breadcrumbs and a bounded history.
 * Exploring feels like browsing, never panning a physics diagram.
 */
import { useEffect, useMemo } from 'react'
import type { AtlasLevel, AtlasNode } from '../../../../shared/types'
import { useAtlas } from '../../stores/atlas'
import { useHandoffs } from '../../stores/handoffs'
import { AtlasBreadcrumbs } from './AtlasBreadcrumbs'
import { AtlasCanvas } from './AtlasCanvas'
import { visibleAtlas } from './atlas-visibility'

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

  useEffect(() => {
    // live data (watcher/poller) keeps it fresh after this first fetch
    if (graph === null && !loading) void load()
  }, [graph, loading, load])

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

  const visibility = useMemo(
    () => (graph ? visibleAtlas(graph, expandedTopic) : { nodes: [], atoms: [] }),
    [graph, expandedTopic],
  )

  // the selected node's project — lets the Learn segment work from Overview
  const selectedProject = useMemo(() => {
    const node = graph?.nodes.find((n) => n.id === selectedId)
    return node?.type === 'project' ? node.label : node?.project
  }, [graph, selectedId])
  const learnTarget = scope.project ?? selectedProject

  function onActivate(node: AtlasNode): void {
    // §3 resolution: project cluster click drills into Learn (story 10.3's row);
    // the remaining node types resolve via story 10.4
    if (node.type === 'project') void drillProject(node.label)
  }

  return (
    <div className="atlas">
      <div className="atlas-header">
        <span className="pane-list-title">Vault Atlas</span>
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
        <AtlasBreadcrumbs />
      </div>
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
      ) : (
        <AtlasCanvas
          graph={graph}
          visibleNodes={visibility.nodes}
          atoms={visibility.atoms}
          selectedId={selectedId}
          onSelect={(n) => select(n?.id ?? null)}
          onActivate={onActivate}
          onExpandTopic={toggleTopic}
          onEscape={() => void up()}
        />
      )}
    </div>
  )
}
