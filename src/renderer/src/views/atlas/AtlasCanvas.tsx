/**
 * The Atlas SVG canvas (stories 10.2/10.3, reworked by the epic10 layout-v2
 * defect burndown): hand-rolled SVG — designed surface (faint 24px dot grid
 * on the canvas card), drag pan + wheel/pinch zoom clamped 0.5–2 around the
 * fit, ⌘0 refit, orthogonal elbow edges routed through card-free channels
 * with white label chips that never clip under a card, focused-cluster
 * panels at learn/deep with neighbor pills, hover emphasis (raised card +
 * connected edges, non-neighbors faded), keyboard-traversable cards
 * (arrows move, Enter drills/expands, Esc/Backspace goes up).
 * Positions arrive precomputed from atlas.graph.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { GUTTER, NODE_H, NODE_W } from '../../../../shared/atlas-layout'
import type { AtlasEdge, AtlasGraph, AtlasNode } from '../../../../shared/types'
import { AtlasNodeCard, type AtlasNodeVariant } from './AtlasNodeCard'
import { focusNeighborhood } from './atlas-filters'
import { type TopicAtom, visiblePanels } from './atlas-visibility'
import { type AtlasDecor, edgeDecorClass, nodeDecorClass } from './decor'
import { TopicGroup } from './TopicGroup'
import {
  fitViewBox,
  fitViewBoxAround,
  type FocusTarget,
  laneOffsets,
  nextFocus,
  nodeRect,
  orthoRoute,
  panViewBox,
  type Rect,
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
  e: React.MouseEvent<SVGPathElement>,
  start: { x: number; y: number },
  end: { x: number; y: number },
): 'source' | 'target' {
  const ctm = e.currentTarget.getScreenCTM()
  if (!ctm) return 'target'
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
  return (pt.x - start.x) ** 2 + (pt.y - start.y) ** 2 <=
    (pt.x - end.x) ** 2 + (pt.y - end.y) ** 2
    ? 'source'
    : 'target'
}

const pathOf = (points: Array<{ x: number; y: number }>): string =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

function OrthoEdge({
  edge,
  a,
  b,
  off,
  onActivateEdge,
  decorClass = '',
  hot,
}: {
  edge: AtlasEdge
  a: Rect
  b: Rect
  /** parallel-lane offset (±12px per lane between the same pair) */
  off: number
  onActivateEdge: (edge: AtlasEdge, nearerEnd: 'source' | 'target') => void
  /** path gold / focus fade (views/atlas/decor.ts, story 10.6) */
  decorClass?: string
  /** hover emphasis: this edge touches the hovered node */
  hot?: boolean
}): React.JSX.Element {
  // aggregated route chips need the full gutter channel; quiet in-panel
  // edges (thread rails, wikilinks) stay inside the 40px column gaps
  const stub = edge.category === 'route' ? GUTTER / 2 : 20
  const { points, label } = orthoRoute(a, b, off, stub)
  const start = points[0] as { x: number; y: number }
  const end = points[points.length - 1] as { x: number; y: number }
  const gold = edge.category === 'route' && edge.blocking
  const dashed =
    edge.category === 'affinity' ||
    (edge.category === 'contract-link' && edge.confidence === 'heuristic')
  const aggregated = edge.totalCount !== undefined
  const d = pathOf(points)
  return (
    <g className={`atlas-edge atlas-edge-${edge.category}${decorClass}${hot ? ' atlas-edge-hot' : ''}`}>
      <path
        className={`atlas-edge-line${gold ? ' atlas-edge-blocking' : ''}${dashed ? ' atlas-edge-heuristic' : ''}`}
        d={d}
        markerEnd={gold ? 'url(#atlas-arrow-gold)' : 'url(#atlas-arrow)'}
      />
      {/* wide invisible hit path: edge click = the handoff/diff it stands for */}
      {/* biome-ignore lint: pointer affordance for edges; nodes carry keyboard access */}
      <path
        className="atlas-edge-hit"
        d={d}
        onClick={(e) => {
          e.stopPropagation()
          onActivateEdge(edge, nearerEndOf(e, start, end))
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
      </path>
      {aggregated && (
        <g
          className={`atlas-edge-badge${(edge.openCount ?? 0) > 0 ? ' atlas-edge-badge-open' : ''}`}
        >
          <rect x={label.x - 56} y={label.y - 9} width={112} height={18} rx={9} />
          <text x={label.x} y={label.y + 3.5} textAnchor="middle">
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
  changedCounts,
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
  /** changed-since counts per project cluster (story 10.7 AC1) */
  changedCounts?: ReadonlyMap<string, number>
}): React.JSX.Element {
  const paneRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const nodeEls = useRef(new Map<string, SVGGElement>())
  const [viewBox, setViewBox] = useState<ViewBox | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  const level = graph.level
  const byId = useMemo(() => new Map(visibleNodes.map((n) => [n.id, n])), [visibleNodes])

  // focused-cluster panels (learn/deep): one large white card per cluster,
  // sized by what is VISIBLE (cards + atoms) — hidden collapsed members must
  // never inflate the panel (the story 16.5 tiny-top-strip defect)
  const panelOwners = useMemo(
    () => (level === 'overview' ? new Set<string>() : new Set(graph.clusters.map((c) => c.project))),
    [graph.clusters, level],
  )
  const panels = useMemo(
    () =>
      level === 'overview' ? [] : visiblePanels(graph.clusters, visibleNodes, atoms, level),
    [graph.clusters, visibleNodes, atoms, level],
  )

  // topic column labels inside panels (mono 10px caps): only topics with
  // VISIBLE members (collapsed atoms carry their own name), anchored above
  // the flow-first member — wrapped topics get one label, at their head
  const topicLabels = useMemo(() => {
    if (level === 'overview') return []
    const out: Array<{ key: string; text: string; x: number; y: number }> = []
    for (const cluster of graph.clusters) {
      for (const topic of cluster.topics) {
        const members = topic.nodeIds
          .map((id) => byId.get(id))
          .filter((n): n is AtlasNode => n !== undefined)
          .sort((a, b) => a.x - b.x || a.y - b.y)
        const first = members[0]
        if (!first) continue
        out.push({
          key: `${cluster.project}/${topic.name}`,
          text: topic.name,
          x: first.x,
          y: first.y - 8,
        })
      }
    }
    return out
  }, [graph.clusters, byId, level])

  const variantOf = (node: AtlasNode): AtlasNodeVariant => {
    if (node.type !== 'project') return 'card'
    if (level === 'overview') return 'cluster'
    return panelOwners.has(node.label) ? 'header' : 'pill'
  }

  const ordered = useMemo<FocusTarget[]>(
    () =>
      traversalOrder<FocusTarget>([
        ...visibleNodes,
        ...atoms.map((a) => ({ id: `topic:${a.key}`, x: a.x, y: a.y })),
      ]),
    [visibleNodes, atoms],
  )

  // fit-to-content: everything drawn (cards, atoms, panels) plus FIT_PAD
  const fitRects = useMemo<Rect[]>(
    () => [
      ...visibleNodes.map((n) => nodeRect(n, level)),
      ...atoms.map((a) => ({ x: a.x, y: a.y, w: NODE_W, h: NODE_H })),
      ...panels.map((p) => p.rect),
    ],
    [visibleNodes, atoms, panels, level],
  )
  const fitW = useRef(1200)
  const refit = (): void => {
    const pane = paneRef.current
    const vb = fitViewBox(fitRects, pane?.clientWidth ?? 1200, pane?.clientHeight ?? 800)
    fitW.current = vb.w
    setViewBox(vb)
  }

  // fit on discrete state change (level/scope/expansion are navigation, not zoom)
  const fitKey = `${level}|${graph.scope.project ?? ''}|${graph.scope.topic ?? ''}|${visibleNodes.length}|${atoms.length}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: refit exactly on the discrete-state key
  useEffect(() => {
    refit()
  }, [fitKey])

  // ⌘0 refits to content (viewport spec) while the atlas is on screen
  // biome-ignore lint/correctness/useExhaustiveDependencies: listener rebinds with the fit inputs
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault()
        refit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fitKey, fitRects])

  // tour step: fit the viewport around the highlighted set (story 10.5 AC3)
  const fitIdsKey = (fitToIds ?? []).join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: refit exactly when the highlight set or discrete state changes
  useEffect(() => {
    if (!fitToIds || fitToIds.length === 0) return
    const wanted = new Set(fitToIds)
    const targets = [
      ...visibleNodes.filter((n) => wanted.has(n.id)).map((n) => nodeRect(n, level)),
      ...atoms
        .filter((a) => wanted.has(`topic:${a.key}`))
        .map((a) => ({ x: a.x, y: a.y, w: NODE_W, h: NODE_H })),
    ]
    const pane = paneRef.current
    const around = fitViewBoxAround(
      targets,
      pane?.clientWidth ?? 1200,
      pane?.clientHeight ?? 800,
      fitW.current,
    )
    if (around) setViewBox(around)
  }, [fitIdsKey, fitKey])

  const vb = viewBox ?? fitViewBox(fitRects, 1200, 800)
  const scale = (): number => {
    const pane = paneRef.current
    return vb.w / Math.max(pane?.clientWidth ?? 1200, 1)
  }

  // hover emphasis: raised card handled in CSS; here the 1-hop neighborhood
  // drives connected-edge emphasis and fades non-neighbors to 30%
  const hoverHood = useMemo(
    () => (hoverId ? focusNeighborhood(hoverId, graph.edges) : null),
    [hoverId, graph.edges],
  )

  // parallel edges between the same pair fan out ±12px per lane
  const lanes = useMemo(() => laneOffsets(graph.edges), [graph.edges])

  function onWheel(e: React.WheelEvent<SVGSVGElement>): void {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const atX = vb.x + ((e.clientX - rect.left) / Math.max(rect.width, 1)) * vb.w
    const atY = vb.y + ((e.clientY - rect.top) / Math.max(rect.height, 1)) * vb.h
    // trackpad pinch arrives as ctrlKey-wheel; both zoom about the pointer
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12
    setViewBox(zoomViewBox(vb, factor, atX, atY, fitW.current))
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
        className={`atlas-canvas${hoverId ? ' atlas-hovering' : ''}`}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="application"
        aria-label={`Vault atlas, ${level} level, ${visibleNodes.length} nodes`}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || (e.target as Element).classList?.contains('atlas-grid')) {
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
          if (e.target === e.currentTarget || (e.target as Element).classList?.contains('atlas-grid'))
            onSelect(null)
        }}
      >
        <defs>
          {/* faint 24px dot grid — the designed surface, not dead whitespace */}
          <pattern id="atlas-dots" width={24} height={24} patternUnits="userSpaceOnUse">
            <circle className="atlas-dot" cx={1.5} cy={1.5} r={1.5} />
          </pattern>
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
        <rect
          className="atlas-grid"
          x={vb.x}
          y={vb.y}
          width={vb.w}
          height={vb.h}
          fill="url(#atlas-dots)"
        />
        {/* focused-cluster panels: one large white card each (radius 16) */}
        <g className="atlas-panels" aria-hidden>
          {panels.map((p) => (
            <rect
              key={p.project}
              className="atlas-panel"
              x={p.rect.x}
              y={p.rect.y}
              width={p.rect.w}
              height={p.rect.h}
              rx={16}
            />
          ))}
          {topicLabels.map((t) => (
            <text key={t.key} className="atlas-topic-label" x={t.x} y={t.y}>
              {t.text.toUpperCase()}
            </text>
          ))}
        </g>
        <g className="atlas-edges" aria-hidden>
          {graph.edges.map((edge) => {
            const a = byId.get(edge.source)
            const b = byId.get(edge.target)
            if (!a || !b) return null // an endpoint is collapsed into an atom — edge waits
            return (
              <OrthoEdge
                key={edge.id}
                edge={edge}
                a={nodeRect(a, level)}
                b={nodeRect(b, level)}
                off={lanes.get(edge.id) ?? 0}
                onActivateEdge={onActivateEdge}
                decorClass={`${edgeDecorClass(edge, decor)}${
                  hoverHood && !(hoverHood.has(edge.source) && hoverHood.has(edge.target))
                    ? ' atlas-dim'
                    : ''
                }`}
                hot={Boolean(hoverId && (edge.source === hoverId || edge.target === hoverId))}
              />
            )
          })}
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
              variant={variantOf(node)}
              selected={selectedId === node.id}
              describe={describeNode(node)}
              onSelect={(n) => onSelect(n)}
              onActivate={onActivate}
              onHover={setHoverId}
              nodeRef={refFor(node.id)}
              decorClass={`${nodeDecorClass(node.id, decor)}${
                hoverHood && !hoverHood.has(node.id) ? ' atlas-dim' : ''
              }`}
              changedCount={
                node.type === 'project' ? (changedCounts?.get(node.label) ?? 0) : 0
              }
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
