/**
 * The Atlas SVG canvas (stories 10.2/10.3): hand-rolled SVG — pan (drag),
 * zoom (wheel), edges with navy arrowheads (gold when a blocking request
 * rides the route), aggregated `N open / M total` badges, collapsed topic
 * atoms, keyboard-traversable cards (arrows move, Enter drills/expands,
 * Esc/Backspace goes up). Positions arrive precomputed from atlas.graph.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AtlasEdge, AtlasGraph, AtlasNode } from '../../../../shared/types'
import { AtlasNodeCard } from './AtlasNodeCard'
import type { TopicAtom } from './atlas-visibility'
import { type AtlasDecor, edgeDecorClass, nodeDecorClass } from './decor'
import { TopicGroup } from './TopicGroup'
import {
  edgeAnchors,
  fitViewBox,
  fitViewBoxAround,
  type FocusTarget,
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
    return `project ${node.label}, ${open} open handoff${open === 1 ? '' : 's'} — Enter opens it`
  }
  if (node.type === 'handoff') return `handoff ${node.label}, ${node.status || 'open'} — Enter opens the card`
  if (node.type === 'note') return `note ${node.label}${node.stale ? ', stale' : ''} — Enter opens the reader`
  if (node.type === 'source') {
    return node.localPath
      ? `source file ${node.label} — Enter opens it in your editor`
      : `source file ${node.label}, repo not on this machine — Enter copies the path`
  }
  if (node.type === 'commit') {
    return node.commitBase
      ? `commit ${node.label} — Enter opens it on GitHub`
      : `commit ${node.label}, non-GitHub remote — Enter copies the sha`
  }
  return `contract ${node.label} — Enter opens its timeline`
}

/** Which endpoint the click landed nearer to — §3 "by direction of click". */
function nearerEndOf(
  e: React.MouseEvent<SVGLineElement>,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): 'source' | 'target' {
  const ctm = e.currentTarget.getScreenCTM()
  if (!ctm) return 'target'
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
  return (pt.x - x1) ** 2 + (pt.y - y1) ** 2 <= (pt.x - x2) ** 2 + (pt.y - y2) ** 2
    ? 'source'
    : 'target'
}

function EdgeLine({
  edge,
  byId,
  onActivateEdge,
  decorClass = '',
}: {
  edge: AtlasEdge
  byId: Map<string, AtlasNode>
  onActivateEdge: (edge: AtlasEdge, nearerEnd: 'source' | 'target') => void
  /** path gold / focus fade (views/atlas/decor.ts, story 10.6) */
  decorClass?: string
}): React.JSX.Element | null {
  const a = byId.get(edge.source)
  const b = byId.get(edge.target)
  if (!a || !b) return null // an endpoint is collapsed into an atom — edge waits
  const { x1, y1, x2, y2, midX, midY } = edgeAnchors(a, b)
  const gold = edge.category === 'route' && edge.blocking
  const dashed =
    edge.category === 'affinity' ||
    (edge.category === 'contract-link' && edge.confidence === 'heuristic')
  const aggregated = edge.totalCount !== undefined
  return (
    <g className={`atlas-edge atlas-edge-${edge.category}${decorClass}`}>
      <line
        className={`atlas-edge-line${gold ? ' atlas-edge-blocking' : ''}${dashed ? ' atlas-edge-heuristic' : ''}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        markerEnd={gold ? 'url(#atlas-arrow-gold)' : 'url(#atlas-arrow)'}
      />
      {/* wide invisible hit line: edge click = the handoff/diff it stands for */}
      {/* biome-ignore lint: pointer affordance for edges; nodes carry keyboard access */}
      <line
        className="atlas-edge-hit"
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        onClick={(e) => {
          e.stopPropagation()
          onActivateEdge(edge, nearerEndOf(e, x1, y1, x2, y2))
        }}
      >
        <title>
          {edge.category === 'route'
            ? 'route — open the handoff behind it'
            : edge.category === 'thread'
              ? `thread (${edge.field ?? ''})`
              : edge.category === 'contract-link'
                ? `contract link${edge.confidence ? ` — ${edge.confidence}` : ''}`
                : edge.category}
        </title>
      </line>
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
  visibleNodes,
  atoms,
  selectedId,
  onSelect,
  onActivate,
  onActivateEdge,
  onExpandTopic,
  onEscape,
  onFocusKey,
  decor,
  fitToIds,
}: {
  graph: AtlasGraph
  /** nodes after collapsed-atom filtering (atlas-visibility) */
  visibleNodes: AtlasNode[]
  atoms: TopicAtom[]
  selectedId: string | null
  onSelect: (node: AtlasNode | null) => void
  onActivate: (node: AtlasNode) => void
  onExpandTopic: (key: string) => void
  /** edge click → the handoff/diff it stands for (story 10.4 §3 rows) */
  onActivateEdge: (edge: AtlasEdge, nearerEnd: 'source' | 'target') => void
  /** Esc/Backspace: one level up (story 10.3 keyboard map) */
  onEscape: () => void
  /** 'f': toggle focus mode on the selected card (story 10.6 AC4) */
  onFocusKey?: () => void
  /** ring decorations (tour pulse, story 10.5) — pure class computation */
  decor?: AtlasDecor
  /** fit the viewport AROUND these nodes (tour step, story 10.5 AC3) */
  fitToIds?: string[]
}): React.JSX.Element {
  const paneRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const nodeEls = useRef(new Map<string, SVGGElement>())
  const [viewBox, setViewBox] = useState<ViewBox | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  const byId = useMemo(() => new Map(visibleNodes.map((n) => [n.id, n])), [visibleNodes])
  const ordered = useMemo<FocusTarget[]>(
    () =>
      traversalOrder<FocusTarget>([
        ...visibleNodes,
        ...atoms.map((a) => ({ id: `topic:${a.key}`, x: a.x, y: a.y })),
      ]),
    [visibleNodes, atoms],
  )

  // fit on discrete state change (level/scope/expansion are navigation, not zoom)
  const fitKey = `${graph.level}|${graph.scope.project ?? ''}|${graph.scope.topic ?? ''}|${visibleNodes.length}|${atoms.length}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: refit exactly on the discrete-state key
  useEffect(() => {
    const pane = paneRef.current
    setViewBox(fitViewBox(ordered, pane?.clientWidth ?? 1200, pane?.clientHeight ?? 800))
  }, [fitKey])

  // tour step: fit the viewport around the highlighted set (story 10.5 AC3)
  const fitIdsKey = (fitToIds ?? []).join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: refit exactly when the highlight set or discrete state changes
  useEffect(() => {
    if (!fitToIds || fitToIds.length === 0) return
    const wanted = new Set(fitToIds)
    const targets = ordered.filter((t) => wanted.has(t.id))
    const pane = paneRef.current
    const around = fitViewBoxAround(targets, pane?.clientWidth ?? 1200, pane?.clientHeight ?? 800)
    if (around) setViewBox(around)
  }, [fitIdsKey, fitKey])

  const vb = viewBox ?? fitViewBox(ordered, 1200, 800)
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
    if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault()
      onEscape()
      return
    }
    if (e.key === 'f' && !e.metaKey && !e.ctrlKey && onFocusKey) {
      e.preventDefault()
      onFocusKey() // story 10.6: toggle 1-hop focus on the selected card
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const focusedId =
        (document.activeElement as SVGGElement | null)?.dataset?.nodeId ?? selectedId
      const next = nextFocus(ordered, focusedId, e.key)
      if (next) {
        const node = byId.get(next)
        if (node) onSelect(node)
        nodeEls.current.get(next)?.focus()
      }
    }
  }

  const refFor =
    (id: string) =>
    (el: SVGGElement | null): void => {
      if (el) nodeEls.current.set(id, el)
      else nodeEls.current.delete(id)
    }

  return (
    <div ref={paneRef} className="atlas-pane">
      {/* biome-ignore lint: the canvas itself pans on drag; cards carry button semantics */}
      <svg
        ref={svgRef}
        className="atlas-canvas"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="application"
        aria-label={`Vault atlas, ${graph.level} level, ${visibleNodes.length} nodes`}
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
            <EdgeLine
              key={edge.id}
              edge={edge}
              byId={byId}
              onActivateEdge={onActivateEdge}
              decorClass={edgeDecorClass(edge, decor)}
            />
          ))}
        </g>
        <g className="atlas-nodes">
          {atoms.map((atom) => (
            <TopicGroup
              key={atom.key}
              atom={atom}
              onExpand={onExpandTopic}
              nodeRef={refFor(`topic:${atom.key}`)}
            />
          ))}
          {visibleNodes.map((node) => (
            <AtlasNodeCard
              key={node.id}
              node={node}
              selected={selectedId === node.id}
              describe={describeNode(node)}
              onSelect={(n) => onSelect(n)}
              onActivate={onActivate}
              nodeRef={refFor(node.id)}
              decorClass={nodeDecorClass(node.id, decor)}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
