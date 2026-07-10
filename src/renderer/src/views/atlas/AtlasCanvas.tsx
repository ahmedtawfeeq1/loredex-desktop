/**
 * The Atlas SVG canvas (story 10.2): hand-rolled SVG — pan (drag), zoom
 * (wheel), edges with navy arrowheads (gold when a blocking request rides the
 * route), aggregated `N open / M total` badges, keyboard-traversable node
 * cards. Positions arrive precomputed from atlas.graph; this renders only.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AtlasEdge, AtlasGraph, AtlasNode } from '../../../../shared/types'
import { AtlasNodeCard } from './AtlasNodeCard'
import {
  edgeAnchors,
  fitViewBox,
  nextFocus,
  panViewBox,
  routeBadge,
  traversalOrder,
  type ViewBox,
  zoomViewBox,
} from './atlas-geometry'

function describeNode(node: AtlasNode): string {
  if (node.type === 'project') {
    const open = node.openCount ?? 0
    return `project ${node.label}, ${open} open handoff${open === 1 ? '' : 's'}`
  }
  return `${node.type} ${node.label}`
}

function EdgeLine({
  edge,
  byId,
}: {
  edge: AtlasEdge
  byId: Map<string, AtlasNode>
}): React.JSX.Element | null {
  const a = byId.get(edge.source)
  const b = byId.get(edge.target)
  if (!a || !b) return null
  const { x1, y1, x2, y2, midX, midY } = edgeAnchors(a, b)
  const gold = edge.category === 'route' && edge.blocking
  const dashed = edge.category === 'contract-link' && edge.confidence === 'heuristic'
  const aggregated = edge.totalCount !== undefined
  return (
    <g className={`atlas-edge atlas-edge-${edge.category}`}>
      <line
        className={`atlas-edge-line${gold ? ' atlas-edge-blocking' : ''}${dashed ? ' atlas-edge-heuristic' : ''}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        markerEnd={gold ? 'url(#atlas-arrow-gold)' : 'url(#atlas-arrow)'}
      />
      {aggregated && (
        <g className={`atlas-edge-badge${(edge.openCount ?? 0) > 0 ? ' atlas-edge-badge-open' : ''}`}>
          <rect x={midX - 56} y={midY - 21} width={112} height={18} rx={9} />
          <text x={midX} y={midY - 8} textAnchor="middle">
            {routeBadge(edge.openCount, edge.totalCount)}
          </text>
        </g>
      )}
    </g>
  )
}

export function AtlasCanvas({
  graph,
  selectedId,
  onSelect,
  onActivate,
}: {
  graph: AtlasGraph
  selectedId: string | null
  onSelect: (node: AtlasNode | null) => void
  onActivate: (node: AtlasNode) => void
}): React.JSX.Element {
  const paneRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const nodeEls = useRef(new Map<string, SVGGElement>())
  const [viewBox, setViewBox] = useState<ViewBox | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes])
  const ordered = useMemo(() => traversalOrder(graph.nodes), [graph.nodes])

  // fit on graph change (level/scope moves are discrete — refit is expected)
  const fitKey = `${graph.level}|${graph.scope.project ?? ''}|${graph.scope.topic ?? ''}|${graph.nodes.length}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: refit exactly on the discrete-state key
  useEffect(() => {
    const pane = paneRef.current
    setViewBox(fitViewBox(graph.nodes, pane?.clientWidth ?? 1200, pane?.clientHeight ?? 800))
  }, [fitKey])

  const vb = viewBox ?? fitViewBox(graph.nodes, 1200, 800)
  const scale = (): number => {
    const pane = paneRef.current
    return vb.w / Math.max(pane?.clientWidth ?? 1200, 1)
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>): void {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const atX = vb.x + ((e.clientX - rect.left) / Math.max(rect.width, 1)) * vb.w
    const atY = vb.y + ((e.clientY - rect.top) / Math.max(rect.height, 1)) * vb.h
    setViewBox(zoomViewBox(vb, e.deltaY > 0 ? 1.12 : 1 / 1.12, atX, atY))
  }

  function onKeyDown(e: React.KeyboardEvent<SVGSVGElement>): void {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = nextFocus(ordered, selectedId, e.key)
      if (next) {
        const node = byId.get(next)
        if (node) onSelect(node)
        nodeEls.current.get(next)?.focus()
      }
    }
  }

  return (
    <div ref={paneRef} className="atlas-pane">
      {/* biome-ignore lint: the canvas itself pans on drag; nodes carry the button semantics */}
      <svg
        ref={svgRef}
        className="atlas-canvas"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="application"
        aria-label={`Vault atlas, ${graph.level} level, ${graph.nodes.length} nodes`}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            drag.current = { x: e.clientX, y: e.clientY }
            ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
          }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const s = scale()
          setViewBox(
            panViewBox(vb, (drag.current.x - e.clientX) * s, (drag.current.y - e.clientY) * s),
          )
          drag.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null)
        }}
      >
        <defs>
          <marker
            id="atlas-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="atlas-arrowhead" />
          </marker>
          <marker
            id="atlas-arrow-gold"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="atlas-arrowhead-gold" />
          </marker>
        </defs>
        <g className="atlas-edges" aria-hidden>
          {graph.edges.map((edge) => (
            <EdgeLine key={edge.id} edge={edge} byId={byId} />
          ))}
        </g>
        <g className="atlas-nodes">
          {graph.nodes.map((node) => (
            <AtlasNodeCard
              key={node.id}
              node={node}
              selected={selectedId === node.id}
              describe={describeNode(node)}
              onSelect={(n) => onSelect(n)}
              onActivate={onActivate}
              nodeRef={(el) => {
                if (el) nodeEls.current.set(node.id, el)
                else nodeEls.current.delete(node.id)
              }}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
