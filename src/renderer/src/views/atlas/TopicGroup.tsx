/**
 * Collapsed topic atom (story 10.3): a topic folder rendered as one group
 * card — name, note count — that expands lazily on click/Enter. Inset ground
 * distinguishes it from resolvable node cards (it navigates, never resolves).
 */
import { NODE_H, NODE_W, truncateLabel } from '../../../../shared/atlas-layout'
import type { TopicAtom } from './atlas-visibility'

export function TopicGroup({
  atom,
  onExpand,
  nodeRef,
}: {
  atom: TopicAtom
  onExpand: (key: string) => void
  nodeRef?: (el: SVGGElement | null) => void
}): React.JSX.Element {
  return (
    // biome-ignore lint: SVG group acts as a button — Enter/click both expand
    <g
      ref={nodeRef}
      className="atlas-node atlas-topic-atom"
      transform={`translate(${atom.x}, ${atom.y})`}
      tabIndex={0}
      role="button"
      aria-label={`topic ${atom.topic}, ${atom.count} notes — press Enter to expand`}
      aria-expanded={false}
      data-node-id={`topic:${atom.key}`}
      onClick={(e) => {
        e.stopPropagation()
        onExpand(atom.key)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.stopPropagation()
          onExpand(atom.key)
        }
      }}
    >
      <rect className="atlas-card atlas-topic-card" width={NODE_W} height={NODE_H} rx={12} />
      {/* ▸ chevron affordance + topic name; a prominent count on the right reads
          as "expandable", replacing the old weak dashed-empty look (WP5) */}
      <text className="atlas-topic-chevron" x={14} y={NODE_H / 2 + 5}>
        ▸
      </text>
      <text className="atlas-node-name" x={32} y={30}>
        {truncateLabel(atom.topic, NODE_W - 80, 7.2)}/
      </text>
      <text className="atlas-topic-count" x={NODE_W - 14} y={32} textAnchor="end">
        {atom.count}
      </text>
      <text className="atlas-node-meta" x={32} y={NODE_H - 16}>
        {truncateLabel(
          `${atom.count === 1 ? '1 note' : `${atom.count} notes`} · click to expand`,
          NODE_W - 46,
          6,
        )}
      </text>
    </g>
  )
}
