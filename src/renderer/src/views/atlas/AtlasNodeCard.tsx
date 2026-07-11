/**
 * Atlas node cards (stories 10.2/10.4): every node is a mini routing-slip
 * card — white card, hairline, radius 12, navy 600 name — hand-rolled SVG,
 * no chart lib. All 6 types render to spec: note (serif title, type/topic
 * chips, freshness), handoff (stamp + route line + REQUEST chip, live via
 * handoff.stateChanged), contract, source (honest disabled state), commit
 * (outbound affordance), project (open-count gold badge). Atlas cards never
 * stamp-press — that animation stays exclusive to the board card.
 */
import {
  CLUSTER_W,
  NODE_H,
  NODE_W,
  ORDER_CHIP_H,
  ORDER_CHIP_W,
  PILL_H,
  PILL_W,
  truncateLabel,
} from '../../../../shared/atlas-layout'
import type { AtlasNode } from '../../../../shared/types'
import { humanizeTitle, noteDate } from '../../humanize'

/** Unified card chrome (WP5): every mini routing-slip body shares one inner
 *  padding and one footer baseline — type-specific content varies above it, but
 *  the chip style, left padding and footer line up across all five types. */
const CARD_PAD_X = 14
const CARD_FOOTER_Y = NODE_H - 14
/** inner width a full-bleed text line (padded both sides) may occupy on a card */
const CARD_TEXT_W = NODE_W - CARD_PAD_X * 2

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
  // story 17.1 (D1 amendment 3): the serif title humanizes; the stripped
  // date rides the EXISTING date line; native SVG tooltip keeps the filename
  // WP5 containment: bound the type-chip width so the topic chip's x can't be
  // pushed off the card, then clamp the topic chip to the remaining inner width
  const typeLabel = truncateLabel(node.noteType || 'note', 70, 5.6)
  const topicX = CARD_PAD_X + typeLabel.length * 5.6 + 18
  return (
    <>
      <title>{node.label}</title>
      <text className="atlas-note-title" x={CARD_PAD_X} y={22}>
        {truncateLabel(humanizeTitle(node.label), CARD_TEXT_W, 6.6)}
      </text>
      <Chip x={CARD_PAD_X} y={30} text={typeLabel} variant="atlas-chip-type" />
      {node.topic && (
        <Chip
          x={topicX}
          y={30}
          text={truncateLabel(node.topic, NODE_W - topicX - 20, 5.6)}
          variant="atlas-chip-topic"
        />
      )}
      {node.summary && (
        <text className="atlas-node-summary" x={CARD_PAD_X} y={58}>
          {truncateLabel(node.summary, CARD_TEXT_W, 5.8)}
        </text>
      )}
      <text
        className={`atlas-node-meta${node.stale ? ' atlas-meta-stale' : ''}`}
        x={CARD_PAD_X}
        y={CARD_FOOTER_Y}
      >
        {node.date ?? noteDate(node.label) ?? ''}
        {node.stale ? ' · stale' : ''}
      </text>
    </>
  )
}

function HandoffBody({ node }: { node: AtlasNode }): React.JSX.Element {
  // WP5 containment: clamp the stamp text (arbitrary frontmatter status), the
  // date, the route line and the summary so nothing overruns NODE_W. The
  // stamp width drives the REQUEST chip x, so a bounded stamp keeps the chip on
  // the card too.
  const stampText = truncateLabel(node.expired ? 'expired' : node.status || 'open', 84, 6)
  const stampW = stampText.length * 6 + 12
  return (
    <>
      <g className={`atlas-stamp ${stampClass(node.status, node.expired)}`} aria-hidden>
        <rect x={12} y={10} width={stampW} height={15} rx={3} />
        <text x={12 + stampW / 2} y={21} textAnchor="middle">
          {stampText.toUpperCase()}
        </text>
      </g>
      {node.kind === 'request' && (
        <Chip x={stampW + 18} y={10.5} text="request" variant="atlas-chip-request" />
      )}
      <text className="atlas-node-date" x={NODE_W - 12} y={21} textAnchor="end">
        {truncateLabel(node.date ?? '', 78, 5.4)}
      </text>
      <text className="atlas-route-line" x={CARD_PAD_X} y={44}>
        {truncateLabel(`${node.from ?? ''} ⟶ ${node.to ?? ''}`, CARD_TEXT_W, 6)}
      </text>
      <text className="atlas-node-summary" x={CARD_PAD_X} y={CARD_FOOTER_Y}>
        {truncateLabel(node.summary ?? node.label, CARD_TEXT_W, 5.8)}
      </text>
    </>
  )
}

function ContractBody({ node }: { node: AtlasNode }): React.JSX.Element {
  return (
    <>
      <Chip x={CARD_PAD_X} y={10} text="contract" variant="atlas-chip-type" />
      <text className="atlas-node-mono" x={CARD_PAD_X} y={46}>
        {truncateLabel(node.file ?? node.label, CARD_TEXT_W, 6.6)}
      </text>
      <text className="atlas-node-meta" x={CARD_PAD_X} y={CARD_FOOTER_Y}>
        {node.changeCount === 1 ? '1 change' : `${node.changeCount ?? 0} changes`} · timeline
      </text>
    </>
  )
}

function SourceBody({ node }: { node: AtlasNode }): React.JSX.Element {
  const local = node.localPath != null
  return (
    <>
      <Chip x={CARD_PAD_X} y={10} text="source" variant="atlas-chip-type" />
      <text className="atlas-node-mono" x={CARD_PAD_X} y={46}>
        {truncateLabel(node.sourceRel ?? node.label, CARD_TEXT_W, 6.6)}
      </text>
      <text className="atlas-node-meta" x={CARD_PAD_X} y={CARD_FOOTER_Y}>
        {truncateLabel(
          local
            ? `${node.sourceProject ?? 'repo'} · open in editor ↗`
            : 'repo not on this machine · copy path',
          CARD_TEXT_W,
          5.4,
        )}
      </text>
    </>
  )
}

function CommitBody({ node }: { node: AtlasNode }): React.JSX.Element {
  const linked = Boolean(node.commitBase)
  return (
    <>
      <Chip x={CARD_PAD_X} y={10} text="commit" variant="atlas-chip-type" />
      <text className="atlas-node-mono" x={CARD_PAD_X} y={46}>
        {truncateLabel(node.label, CARD_TEXT_W, 6.6)}
      </text>
      <text className="atlas-node-meta" x={CARD_PAD_X} y={CARD_FOOTER_Y}>
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
  orderChip,
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
  /** `01`/`02`… recency order chip for a note inside a topic sub-card (D1a3) */
  orderChip?: string
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
      {orderChip && node.type === 'note' && (
        <g className="atlas-order-chip" aria-hidden>
          <rect x={-8} y={-7} width={ORDER_CHIP_W} height={ORDER_CHIP_H} rx={4} />
          <text x={-8 + ORDER_CHIP_W / 2} y={-7 + ORDER_CHIP_H - 3.5} textAnchor="middle">
            {orderChip}
          </text>
        </g>
      )}
      {node.type === 'project' && variant === 'cluster' && changedCount > 0 && (
        <text className="atlas-node-changed-count" x={14} y={NODE_H - 32} aria-hidden>
          {changedCount} changed
        </text>
      )}
    </g>
  )
}
