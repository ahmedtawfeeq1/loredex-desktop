/**
 * Path tracing (story 10.6 AC1): pick two nodes, BFS core-side, render the
 * result gold as a clickable routing-slip chain — a provenance story ("how
 * did this decision reach that repo?"). No path → one honest sentence.
 */
import type { AtlasNode } from '../../../../shared/types'
import { useAtlas } from '../../stores/atlas'
import { activateNode } from './resolve'

function labelOf(id: string | null, nodes: AtlasNode[] | undefined): string {
  if (!id) return '—'
  const node = nodes?.find((n) => n.id === id)
  return node ? `${node.type}: ${node.label}` : id
}

export function PathTrace(): React.JSX.Element {
  const graph = useAtlas((s) => s.graph)
  const selectedId = useAtlas((s) => s.selectedId)
  const pathFrom = useAtlas((s) => s.pathFrom)
  const pathTo = useAtlas((s) => s.pathTo)
  const pathResult = useAtlas((s) => s.pathResult)
  const setPathEnd = useAtlas((s) => s.setPathEnd)
  const tracePath = useAtlas((s) => s.tracePath)
  const clearPath = useAtlas((s) => s.clearPath)
  const setPanel = useAtlas((s) => s.setPanel)

  const nodes = graph?.nodes
  const chain =
    pathResult && pathResult !== 'none'
      ? pathResult.nodeIds.map((id) => ({ id, node: nodes?.find((n) => n.id === id) }))
      : []

  return (
    <aside className="atlas-side" aria-label="Path trace">
      <div className="atlas-side-head">
        <span className="atlas-side-title">Trace a path</span>
        <button type="button" className="atlas-side-close" onClick={() => setPanel(null)} aria-label="Close panel">
          ×
        </button>
      </div>
      {(['from', 'to'] as const).map((end) => (
        <div key={end} className="atlas-path-end">
          <span className="atlas-filter-title">{end === 'from' ? 'From' : 'To'}</span>
          <span className="atlas-path-end-label">
            {labelOf(end === 'from' ? pathFrom : pathTo, nodes)}
          </span>
          <button
            type="button"
            className="atlas-tool"
            disabled={!selectedId}
            title={selectedId ? 'Use the selected node' : 'Select a node on the canvas first'}
            onClick={() => setPathEnd(end, selectedId)}
          >
            Use selected
          </button>
        </div>
      ))}
      <div className="atlas-tour-controls">
        <button
          type="button"
          className="button-secondary"
          disabled={!pathFrom || !pathTo}
          onClick={() => void tracePath()}
        >
          Trace
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={!pathFrom && !pathTo && !pathResult}
          onClick={clearPath}
        >
          Clear
        </button>
      </div>
      {pathResult === 'none' && (
        <p className="atlas-side-empty">
          No path connects these two on the map — they share no route, thread, link or
          provenance yet.
        </p>
      )}
      {chain.length > 0 && (
        <ol className="atlas-path-chain" aria-label="Traced path, start to end">
          {chain.map(({ id, node }) => (
            <li key={id}>
              <button
                type="button"
                className="atlas-path-card"
                disabled={!node}
                title={node ? 'Open (resolves per its type)' : 'Not on this canvas — drill deeper to open'}
                onClick={() => {
                  if (node) void activateNode(node)
                }}
              >
                <span className="atlas-path-card-type">{node?.type ?? id.split(':')[0]}</span>
                <span className="atlas-path-card-label">
                  {node?.label ?? id.slice(id.indexOf(':') + 1)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
