/**
 * Atlas node cards (stories 10.2/10.4): every node is a mini routing-slip
 * card — white card, hairline, radius 12, navy 600 name — hand-rolled SVG,
 * no chart lib. Overview renders the project variant; the full per-type spec
 * (stamps, chips, provenance/commit variants) lands with story 10.4.
 */
import { NODE_H, NODE_W } from '../../../../shared/atlas-layout'
import type { AtlasNode } from '../../../../shared/types'

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function ProjectCardBody({ node }: { node: AtlasNode }): React.JSX.Element {
  const open = node.openCount ?? 0
  return (
    <>
      <text className="atlas-node-name" x={14} y={30}>
        {truncate(node.label, 20)}
      </text>
      {open > 0 && (
        <g className="atlas-badge-open" aria-hidden>
          <rect x={NODE_W - 40} y={12} width={28} height={18} rx={9} />
          <text x={NODE_W - 26} y={25} textAnchor="middle">
            {open}
          </text>
        </g>
      )}
      <text className="atlas-node-meta" x={14} y={NODE_H - 16}>
        {node.noteCount === 1 ? '1 note' : `${node.noteCount ?? 0} notes`}
        {open > 0 ? ` · ${open} open` : ''}
      </text>
    </>
  )
}

export function AtlasNodeCard({
  node,
  selected,
  onActivate,
  onSelect,
  nodeRef,
  describe,
}: {
  node: AtlasNode
  selected: boolean
  /** Enter / click resolution (story 10.4; 10.2 selects only) */
  onActivate: (node: AtlasNode) => void
  onSelect: (node: AtlasNode) => void
  nodeRef?: (el: SVGGElement | null) => void
  /** accessible label ("project nimbus-backend, 3 open handoffs") */
  describe: string
}): React.JSX.Element {
  return (
    // biome-ignore lint: SVG card is a button — full keyboard path via tabIndex/Enter
    <g
      ref={nodeRef}
      className={`atlas-node atlas-node-${node.type}`}
      transform={`translate(${node.x}, ${node.y})`}
      tabIndex={0}
      role="button"
      aria-label={describe}
      aria-pressed={selected}
      data-node-id={node.id}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(node)
        onActivate(node)
      }}
      onFocus={() => onSelect(node)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.stopPropagation()
          onActivate(node)
        }
      }}
    >
      <rect
        className={`atlas-card${selected ? ' atlas-card-selected' : ''}`}
        width={NODE_W}
        height={NODE_H}
        rx={12}
      />
      <ProjectCardBody node={node} />
    </g>
  )
}
