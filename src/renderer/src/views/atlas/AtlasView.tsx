/**
 * Vault Atlas view (story 10.2): Overview — project cluster cards +
 * aggregated handoff-flow edges. Who owes whom, one glance, before drilling
 * anywhere (drill navigation lands with story 10.3).
 */
import { useEffect } from 'react'
import type { AtlasNode } from '../../../../shared/types'
import { useAtlas } from '../../stores/atlas'
import { useHandoffs } from '../../stores/handoffs'
import { AtlasCanvas } from './AtlasCanvas'

export function AtlasView(): React.JSX.Element {
  const graph = useAtlas((s) => s.graph)
  const loading = useAtlas((s) => s.loading)
  const error = useAtlas((s) => s.error)
  const selectedId = useAtlas((s) => s.selectedId)
  const select = useAtlas((s) => s.select)
  const load = useAtlas((s) => s.load)

  useEffect(() => {
    // live data (watcher/poller) keeps it fresh after this first fetch
    if (graph === null && !loading) void load()
  }, [graph, loading, load])

  function onActivate(_node: AtlasNode): void {
    // story 10.2 scope: click selects only; drill (10.3) + resolution (10.4)
  }

  return (
    <div className="atlas">
      <div className="atlas-header">
        <span className="pane-list-title">Vault Atlas</span>
        <span className="atlas-level-label">Overview</span>
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
          selectedId={selectedId}
          onSelect={(n) => select(n?.id ?? null)}
          onActivate={onActivate}
        />
      )}
    </div>
  )
}
