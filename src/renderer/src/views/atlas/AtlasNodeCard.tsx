/**
 * Atlas node cards (stories 10.2/10.4): every node is a mini routing-slip
 * card — white card, hairline, radius 12, navy 600 name — hand-rolled SVG,
 * no chart lib. All 6 types render to spec: note (serif title, type/topic
 * chips, freshness), handoff (stamp + route line + REQUEST chip, live via
 * handoff.stateChanged), contract, source (honest disabled state), commit
 * (outbound affordance), project (open-count gold badge). Atlas cards never
 * stamp-press — that animation stays exclusive to the board card.
 */
import { CLUSTER_W, NODE_H, NODE_W, PILL_H, PILL_W } from '../../../../shared/atlas-layout'
import type { AtlasNode } from '../../../../shared/types'

/** How a node renders (layout-v2): `card` = mini routing-slip; `cluster` =
 *  wide overview project card; `pill` = collapsed neighbor at learn/deep;
 *  `header` = the focused panel's title bar. */
export type AtlasNodeVariant = 'card' | 'cluster' | 'pill' | 'header'

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Stamp-vocabulary chip class per handoff status (DESIGN routing-slip spec). */
export function stampClass(status: string | undefined, expired: boolean | undefined): string {
  const s = status || 'open'
  if (s === 'open' || expired) return 'atlas-stamp-open'
  if (s === 'accepted') return 'atlas-stamp-accepted'
  if (s === 'declined' || s === 'stale') return 'atlas-stamp-declined'
  if (s === 'snoozed') return 'atlas-stamp-snoozed'
  return 'atlas-stamp-consumed' // consumed/done and anything unknown: quiet
}

function Chip({
  x,
  y,
  text,
  variant,
}: {
  x: number
  y: number
  text: string
  variant: string
}): React.JSX.Element {
  const width = text.length * 5.6 + 12
  return (
    <g className={`atlas-chip ${variant}`} aria-hidden>
      <rect x={x} y={y} width={width} height={14} rx={4} />
      <text x={x + width / 2} y={y + 10.5} textAnchor="middle">
        {text.toUpperCase()}
      </text>
    </g>
  )
}

function ProjectBody({ node, width }: { node: AtlasNode; width: number }): React.JSX.Element {
  const open = node.openCount ?? 0
  return (
    <>
      <text className="atlas-node-name" x={14} y={30}>
        {truncate(node.label, Math.floor((width - 60) / 7.2))}
      </text>
      {open > 0 && (
        <g className="atlas-badge-open" aria-hidden>
          <rect x={width - 40} y={12} width={28} height={18} rx={9} />
          <text x={width - 26} y={25} textAnchor="middle">
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

/** Compact neighbor pill / focused-panel header bar (layout-v2). */
function ProjectPillBody({ node, header }: { node: AtlasNode; header: boolean }): React.JSX.Element {
  const open = node.openCount ?? 0
  return (
    <>
      <text className={header ? 'atlas-panel-title' : 'atlas-pill-name'} x={12} y={25}>
        {truncate(node.label, 18)}
      </text>
      {open > 0 && (
        <g className="atlas-badge-open" aria-hidden>
          <rect x={PILL_W - 36} y={11} width={26} height={18} rx={9} />
          <text x={PILL_W - 23} y={24} textAnchor="middle">
            {open}
          </text>
        </g>
      )}
    </>
  )
}

function NoteBody({ node }: { node: AtlasNode }): React.JSX.Element {
  return (
    <>
      <text className="atlas-note-title" x={14} y={22}>
        {truncate(node.label, 26)}
      </text>
      <Chip x={14} y={30} text={node.noteType || 'note'} variant="atlas-chip-type" />
      {node.topic && (
        <Chip
          x={14 + (node.noteType || 'note').length * 5.6 + 18}
          y={30}
          text={truncate(node.topic, 14)}
          variant="atlas-chip-topic"
        />
      )}
      {node.summary && (
        <text className="atlas-node-summary" x={14} y={58}>
          {truncate(node.summary, 34)}
        </text>
      )}
      <text
        className={`atlas-node-meta${node.stale ? ' atlas-meta-stale' : ''}`}
        x={14}
        y={NODE_H - 12}
      >
        {node.date ?? ''}
        {node.stale ? ' · stale' : ''}
      </text>
    </>
  )
}

function HandoffBody({ node }: { node: AtlasNode }): React.JSX.Element {
  const stampText = node.expired ? 'expired' : node.status || 'open'
  return (
    <>
      <g className={`atlas-stamp ${stampClass(node.status, node.expired)}`} aria-hidden>
        <rect x={12} y={10} width={stampText.length * 6 + 12} height={15} rx={3} />
        <text x={12 + (stampText.length * 6 + 12) / 2} y={21} textAnchor="middle">
          {stampText.toUpperCase()}
        </text>
      </g>
      {node.kind === 'request' && (
        <Chip x={stampText.length * 6 + 30} y={10.5} text="request" variant="atlas-chip-request" />
      )}
      <text className="atlas-node-date" x={NODE_W - 12} y={21} textAnchor="end">
        {node.date ?? ''}
      </text>
      <text className="atlas-route-line" x={14} y={44}>
        {truncate(`${node.from ?? ''} ⟶ ${node.to ?? ''}`, 32)}
      </text>
      <text className="atlas-node-summary" x={14} y={NODE_H - 18}>
        {truncate(node.summary ?? node.label, 34)}
      </text>
    </>
  )
}

function ContractBody({ node }: { node: AtlasNode }): React.JSX.Element {
  return (
    <>
      <Chip x={14} y={10} text="contract" variant="atlas-chip-type" />
      <text className="atlas-node-mono" x={14} y={46}>
        {truncate(node.file ?? node.label, 28)}
      </text>
      <text className="atlas-node-meta" x={14} y={NODE_H - 14}>
        {node.changeCount === 1 ? '1 change' : `${node.changeCount ?? 0} changes`} · timeline
      </text>
    </>
  )
}

function SourceBody({ node }: { node: AtlasNode }): React.JSX.Element {
  const local = node.localPath != null
  return (
    <>
      <Chip x={14} y={10} text="source" variant="atlas-chip-type" />
      <text className="atlas-node-mono" x={14} y={46}>
        {truncate(node.sourceRel ?? node.label, 28)}
      </text>
      <text className="atlas-node-meta" x={14} y={NODE_H - 14}>
        {local
          ? `${node.sourceProject ?? 'repo'} · open in editor ↗`
          : 'repo not on this machine · copy path'}
      </text>
    </>
  )
}

function CommitBody({ node }: { node: AtlasNode }): React.JSX.Element {
  const linked = Boolean(node.commitBase)
  return (
    <>
      <Chip x={14} y={10} text="commit" variant="atlas-chip-type" />
      <text className="atlas-node-mono" x={14} y={46}>
        {node.label}
      </text>
      <text className="atlas-node-meta" x={14} y={NODE_H - 14}>
        {linked ? 'GitHub ↗' : 'non-GitHub remote · copy sha'}
      </text>
    </>
  )
}

function Body({ node, variant }: { node: AtlasNode; variant: AtlasNodeVariant }): React.JSX.Element {
  switch (node.type) {
    case 'project':
      return variant === 'cluster' ? (
        <ProjectBody node={node} width={CLUSTER_W} />
      ) : (
        <ProjectPillBody node={node} header={variant === 'header'} />
      )
    case 'note':
      return <NoteBody node={node} />
    case 'handoff':
      return <HandoffBody node={node} />
    case 'contract':
      return <ContractBody node={node} />
    case 'source':
      return <SourceBody node={node} />
    case 'commit':
      return <CommitBody node={node} />
  }
}

export function AtlasNodeCard({
  node,
  variant = 'card',
  selected,
  onActivate,
  onSelect,
  onHover,
  nodeRef,
  describe,
  decorClass = '',
  changedCount = 0,
}: {
  node: AtlasNode
  /** layout-v2 render mode — sizes MUST match shared atlasNodeBox */
  variant?: AtlasNodeVariant
  selected: boolean
  /** Enter / click: the §3 resolution for this node type */
  onActivate: (node: AtlasNode) => void
  onSelect: (node: AtlasNode) => void
  /** hover emphasis (layout-v2): connected edges light up, others fade */
  onHover?: (id: string | null) => void
  nodeRef?: (el: SVGGElement | null) => void
  /** accessible label ("project nimbus-backend, 3 open handoffs") */
  describe: string
  /** ring decoration classes (tour/search/path/… — views/atlas/decor.ts) */
  decorClass?: string
  /** project clusters at Overview: changed-since count (story 10.7 AC1) */
  changedCount?: number
}): React.JSX.Element {
  const disabledSource = node.type === 'source' && node.localPath == null
  const w = variant === 'cluster' ? CLUSTER_W : variant === 'card' ? NODE_W : PILL_W
  const h = variant === 'pill' || variant === 'header' ? PILL_H : NODE_H
  return (
    // biome-ignore lint: SVG card is a button — full keyboard path via tabIndex/Enter
    <g
      ref={nodeRef}
      className={`atlas-node atlas-node-${node.type} atlas-variant-${variant}${disabledSource ? ' atlas-node-disabled' : ''}${decorClass}`}
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
      onPointerEnter={() => onHover?.(node.id)}
      onPointerLeave={() => onHover?.(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.stopPropagation()
          onActivate(node)
        }
      }}
    >
      <rect
        className={`atlas-card${variant === 'pill' ? ' atlas-pill-card' : ''}${variant === 'header' ? ' atlas-header-card' : ''}${selected ? ' atlas-card-selected' : ''}`}
        width={w}
        height={h}
        rx={variant === 'pill' || variant === 'header' ? PILL_H / 2 : 12}
      />
      <Body node={node} variant={variant} />
      {node.type === 'project' && variant === 'cluster' && changedCount > 0 && (
        <text className="atlas-node-changed-count" x={14} y={NODE_H - 32} aria-hidden>
          {changedCount} changed
        </text>
      )}
    </g>
  )
}
