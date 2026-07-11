/**
 * Vault Operations Dashboard (epic25, D1 amendment 9) — the modern Home rebuild
 * that supersedes epic21's flat KPI dashboard. A dark-hero operations surface:
 *   • Command strip — real stat pills + title + a range toggle (7/14/30d).
 *   • Left column — Quick Actions (icon CTAs) → Attention Queue (severity-ranked
 *     alerts, the project-status insight) → Recent Activity.
 *   • Right column — Handoff Velocity (paired bars) → Backlog trend (area) →
 *     per-project health cards + a who-hands-off-to-whom relations strip.
 * Every chart is hand-built SVG from the pure `charts/*` geometry (no chart
 * lib); every number folds from the existing channels through `insights.ts`
 * (zero new backend). Live-recompute on the watcher/poller — no Refresh button;
 * the range toggle re-slices the already-loaded 30-day feed, never re-fetches.
 */
import { useEffect, useState } from 'react'
import type { HandoffCard } from '../../../../shared/types'
import { humanizeTitle } from '../../humanize'
import { useApp } from '../../stores/app'
import { useAtlas } from '../../stores/atlas'
import { useHandoffs } from '../../stores/handoffs'
import { useHome } from '../../stores/home'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { useReader } from '../../stores/reader'
import { useRoute } from '../../stores/route'
import { useWizard } from '../../stores/wizard'
import { relativeTime } from '../feed/feed-logic'
import { openBrief } from '../handoffs/Board'
import { localDay } from '../handoffs/lifecycle'
import { sectionTint } from '../reader/sectionTint'
import { backlogArea } from './charts/backlog-area'
import { velocityBars } from './charts/velocity-bars'
import { useDashboardData } from './dashboard-data'
import './home.css'
import {
  type AttentionItem,
  attentionQueue,
  changesInWindow,
  type HealthRow,
  onTrackPct,
  openInbound,
  projectHealth,
  type Relation,
  recentActivity,
  requestsWaiting,
  severityCounts,
  syncTile,
  topRelations,
  velocity,
  type VelDay,
  velocitySeries,
} from './insights'

// ── range toggle (persisted) ────────────────────────────────────────────────
// The spec's three windows are the literal 7/14/30-day series it names; the
// labels below front them. (Deviation from the "Today" label: a 1-day velocity
// bar chart is dead space, which the spec forbids — so the smallest window is a
// real week. Noted in the story.)
type Range = '7' | '14' | '30'
const RANGE_KEY = 'loredex.home.range'
const RANGES: { id: Range; label: string }[] = [
  { id: '7', label: 'This Week' },
  { id: '14', label: '2 Weeks' },
  { id: '30', label: 'This Month' },
]
function loadRange(): Range {
  try {
    const v = localStorage.getItem(RANGE_KEY)
    return v === '7' || v === '14' || v === '30' ? v : '7'
  } catch {
    return '7'
  }
}

// ── deep links ───────────────────────────────────────────────────────────────

function goBoard(): void {
  useHandoffs.getState().setProject('all')
  useApp.getState().setView('handoffs')
}
function goAtlas(): void {
  useApp.getState().setView('atlas')
}
function goAtlasLearn(project: string): void {
  useApp.getState().setView('atlas')
  void useAtlas.getState().drillProject(project)
}
/** Open the product brief in the reader (Quick Action / Re-curate affordance). */
function openProductBrief(): void {
  const brief = useHome.getState().brief
  if (!brief?.path) return
  useApp.getState().setView('reader')
  void useReader.getState().open(brief.path)
}

/** Row-as-button keyboard contract: ⏎ activates when the row itself is focused. */
function rowKey(run: () => void): (e: React.KeyboardEvent) => void {
  return (e) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) run()
  }
}

const LONG_DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
})

export function HomeView(): React.JSX.Element {
  const dash = useDashboardData((s) => s.dash)
  const changes = useDashboardData((s) => s.changes)
  const rootsCount = useDashboardData((s) => s.rootsCount)
  const activity = useDashboardData((s) => s.activity)
  const health = useDashboardData((s) => s.health)
  const dashError = useDashboardData((s) => s.error)
  const loadDash = useDashboardData((s) => s.load)
  const cards = useHandoffs((s) => s.cards)
  const brief = useHome((s) => s.brief)
  const vaultPath = useApp((s) => s.identity?.vaultPath ?? '')
  const setView = useApp((s) => s.setView)
  const [range, setRangeState] = useState<Range>(loadRange)

  useEffect(() => {
    if (!dash) void loadDash()
  }, [dash, loadDash])
  useEffect(() => {
    if (cards === null) void useHandoffs.getState().load()
    if (brief === null) void useHome.getState().load()
  }, [cards, brief])

  const setRange = (r: Range): void => {
    setRangeState(r)
    try {
      localStorage.setItem(RANGE_KEY, r)
    } catch {
      /* private mode — the choice just doesn't persist */
    }
  }

  const now = new Date()
  const today = localDay(now)
  const nowMs = now.getTime()
  const windowDays = Number(range)
  const all = cards ?? []
  const feed = activity ?? []
  const loading = dash === null
  const empty = !loading && dash.states.length === 0 && all.length === 0

  const inbound = openInbound(all)
  const waiting = requestsWaiting(all)
  const vel = velocity(feed, today, inbound.open, windowDays)
  const velSeries = velocitySeries(feed, today, windowDays)
  const contractCount = changesInWindow(changes ?? [], nowMs, windowDays).length
  const sync = syncTile(health)
  const onTrack = onTrackPct(vel.consumed, inbound.open)
  const queue = attentionQueue(all, dash?.states ?? [])
  const sev = severityCounts(queue)
  const healthRows = projectHealth(dash?.states ?? [], all)
  const relations = topRelations(dash?.edges ?? [])
  const recent = recentActivity(feed, 8)
  const hasContracts = (rootsCount ?? 0) > 0
  const vaultName = vaultPath.split('/').filter(Boolean).pop() ?? 'vault'
  const subtitle = `${vaultName} · ${LONG_DATE.format(now)} · live overview`

  if (empty) {
    return (
      <div className="ops-dash">
        <CommandStrip
          title="Vault Dashboard"
          subtitle={subtitle}
          range={range}
          setRange={setRange}
          pills={[]}
        />
        <div className="ops-fresh">
          <p className="ops-fresh-line">
            Your dashboard fills as agents route notes and hand off work.
          </p>
          <div className="ops-fresh-actions">
            <button
              type="button"
              className="button-primary"
              onClick={() => void useRoute.getState().start()}
            >
              Route a note…
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => useWizard.getState().openJoin()}
            >
              Join a vault…
            </button>
          </div>
        </div>
      </div>
    )
  }

  const pills: Pill[] = [
    { label: 'Open', value: loading ? '…' : `${inbound.open}/${all.length}`, onClick: goBoard },
    {
      label: 'Projects',
      value: loading ? '…' : String(dash.states.length),
      onClick: goAtlas,
    },
    { label: 'Requests waiting', value: loading ? '…' : String(waiting), onClick: goBoard },
    ...(hasContracts
      ? [
          {
            label: `Contract Δ (${windowDays}d)`,
            value: String(contractCount),
            onClick: () => setView('contracts'),
          } as Pill,
        ]
      : []),
    { label: 'Sync', value: sync.value, tone: sync.tone, onClick: () => setView('sync') },
    { label: 'On-track', value: `${onTrack}%`, onClick: goBoard },
  ]

  return (
    <div className="ops-dash">
      <CommandStrip
        title="Vault Dashboard"
        subtitle={subtitle}
        range={range}
        setRange={setRange}
        pills={pills}
      />
      {dashError && <div className="note-error">{dashError}</div>}
      {sync.localOnly && (
        <div className="ops-degraded">
          This vault has no remote — notes stay local.{' '}
          <button type="button" className="button-quiet" onClick={() => setView('sync')}>
            Wire a remote
          </button>
        </div>
      )}

      {/* Attention queue — full width, the actionable hero: what needs doing.
          Full width so a short queue never leaves a gap beside a tall chart. */}
      <section className="ops-card" aria-label="Attention queue">
        <div className="ops-card-head">
          <div>
            <div className="ops-card-title">Attention queue</div>
            <div className="ops-card-desc">What needs you, most urgent first.</div>
          </div>
          <div className="ops-sevkeys">
            {sev.critical > 0 && <span className="sevkey sev-critical">{sev.critical} critical</span>}
            {sev.warning > 0 && <span className="sevkey sev-warning">{sev.warning} warning</span>}
            {sev.info > 0 && <span className="sevkey sev-info">{sev.info} info</span>}
          </div>
        </div>
        {queue.length === 0 ? (
          <div className="ops-clear">All clear — nothing needs you.</div>
        ) : (
          <div className="ops-queue-grid">
            {queue.map((item) => <AttentionRow key={item.key} item={item} cards={all} />)}
          </div>
        )}
      </section>

      {/* Trends — two equal-height charts side by side (no dead space) */}
      <div className="ops-grid ops-grid-even">
        <VelocityChart series={velSeries} open={vel.open} />
        <BacklogChart series={velSeries} openNow={inbound.open} />
      </div>

      {/* Recent activity — full width */}
      <section className="ops-card" aria-label="Recent activity">
        <div className="ops-card-head">
          <div>
            <div className="ops-card-title">Recent activity</div>
            <div className="ops-card-desc">The vault's own git log, newest first.</div>
          </div>
          <button type="button" className="button-quiet" onClick={() => setView('feed')}>
            See all →
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="ops-clear">No activity yet.</div>
        ) : (
          recent.map((e, i) => (
            <div className="ops-act" key={`${e.sha}/${i}`}>
              <span className={`feed-kind feed-kind-${e.kind}`}>{e.kind}</span>
              <span className="ops-act-sum" title={e.summary}>
                {e.summary}
              </span>
              <span className="ops-mini" title={e.at}>
                {relativeTime(e.at, nowMs)}
              </span>
            </div>
          ))
        )}
      </section>

      {/* Project health + relations — full width at the bottom */}
      <section className="ops-card" aria-label="Project health">
        <div className="ops-card-head">
          <div>
            <div className="ops-card-title">Project health</div>
            <div className="ops-card-desc">Size, open flow, brief freshness, utilization.</div>
          </div>
        </div>
        <div className="ops-health-grid ops-health-grid-wide">
          {healthRows.map((row) => (
            <HealthCard key={row.project} row={row} />
          ))}
        </div>
        {relations.length > 0 && (
          <>
            <div className="ops-relations-label">Who hands off to whom</div>
            <div className="ops-relations">
              {relations.map((r) => (
                <RelationChip key={`${r.from}/${r.to}`} rel={r} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

// ── command strip ─────────────────────────────────────────────────────────────

interface Pill {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'err' | 'off'
  onClick?: () => void
}

function CommandStrip({
  title,
  subtitle,
  pills,
  range,
  setRange,
}: {
  title: string
  subtitle: string
  pills: Pill[]
  range: Range
  setRange: (r: Range) => void
}): React.JSX.Element {
  return (
    <div className="ops-command">
      {pills.length > 0 && (
        <div className="ops-pills">
          {pills.map((p) => (
            <button
              key={p.label}
              type="button"
              className="ops-pill"
              onClick={p.onClick}
              title={p.label}
            >
              <span className="ops-pill-k">{p.label}</span>
              <span className={`ops-pill-v${p.tone ? ` pill-${p.tone}` : ''}`}>{p.value}</span>
            </button>
          ))}
        </div>
      )}
      <div className="ops-titlerow">
        <div className="ops-titlewrap">
          <h1 className="ops-title">{title}</h1>
          <span className="ops-subtitle">{subtitle}</span>
        </div>
        <div className="ops-range" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={range === r.id}
              className={`ops-range-seg${range === r.id ? ' is-active' : ''}`}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// (Quick actions moved to the sidebar — components/QuickActionsMenu.tsx)

// ── attention queue row ─────────────────────────────────────────────────────────

/** Find the live card the item acts on (by id + receiving project). */
function findCard(cards: readonly HandoffCard[], item: AttentionItem): HandoffCard | undefined {
  if (!item.cardId) return undefined
  return cards.find((c) => c.id === item.cardId && (!item.cardTo || c.to === item.cardTo))
}

function AttentionRow({
  item,
  cards,
}: {
  item: AttentionItem
  cards: readonly HandoffCard[]
}): React.JSX.Element {
  const consume = useHandoffs((s) => s.consume)
  const setStatus = useHandoffs((s) => s.setStatus)
  const busy = useHandoffs((s) => s.consumingId !== null || s.transitioningId !== null)
  const hasIdentity = useIdentity((s) => effectiveIdentity(s) !== null)
  const card = findCard(cards, item)
  const disabled = !hasIdentity || busy
  const idleTitle = hasIdentity ? undefined : 'Set your identity in Settings first'

  const primary = (): void => {
    if (card && (item.action.kind === 'open' || item.action.kind === 'consume' || item.action.kind === 'reopen')) {
      openBrief(card)
    } else if (item.action.kind === 'recurate') {
      openProductBrief()
    } else {
      goBoard()
    }
  }

  const act = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (!card) return
    if (item.action.kind === 'consume') void consume(card)
    else if (item.action.kind === 'reopen') void setStatus(card, { to: 'open' })
    else openBrief(card)
  }

  return (
    <div
      className="ops-alert ops-row-link"
      role="button"
      tabIndex={0}
      onClick={primary}
      onKeyDown={rowKey(primary)}
    >
      <span className={`sevchip sev-${item.severity}`} title={item.severity}>
        {item.glyph}
      </span>
      <div className="ops-alert-body">
        {/* humanized title on the surface; the raw filename stays in the tooltip
            (D1 amendment 3 — the ONE humanize util, no per-view drift) */}
        {card ? (
          <span className="ops-alert-title" title={card.name}>
            {card.objective || humanizeTitle(card.name)}
          </span>
        ) : (
          <span className="ops-alert-title" title={item.title}>
            {item.title}
          </span>
        )}
        <span className="ops-alert-reason">{item.reason}</span>
      </div>
      <div className="ops-alert-actions">
        {item.action.kind === 'recurate' || item.action.kind === 'see' ? (
          <button type="button" className="button-secondary button-small" onClick={act}>
            {item.action.label}
          </button>
        ) : card ? (
          <button
            type="button"
            className="button-secondary button-small"
            disabled={disabled}
            title={idleTitle ?? item.action.label}
            onClick={act}
          >
            {item.action.label}
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ── charts ──────────────────────────────────────────────────────────────────────

function ChartEmpty(): React.JSX.Element {
  return <div className="ops-chart-empty">Not enough history yet in this range.</div>
}

function VelocityChart({ series, open }: { series: VelDay[]; open: number }): React.JSX.Element {
  const created = series.reduce((a, d) => a + d.created, 0)
  const consumed = series.reduce((a, d) => a + d.consumed, 0)
  const active = created + consumed > 0
  const lay = velocityBars(series)
  const first = series[0]?.day.slice(5) ?? ''
  const last = series.at(-1)?.day.slice(5) ?? ''
  return (
    <section className="ops-card" aria-label="Handoff velocity">
      <div className="ops-card-head">
        <div>
          <div className="ops-card-title">Handoff velocity</div>
          <div className="ops-card-desc">Created vs consumed, per day.</div>
        </div>
        <span className="ops-legend">
          <span className="lg lg-created" /> created
          <span className="lg lg-consumed" /> consumed
        </span>
      </div>
      {active ? (
        <button type="button" className="ops-chart-btn" onClick={goBoard} title="Open the board">
          <svg
            className="ops-chart"
            viewBox={`0 0 ${lay.w} ${lay.h}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`${created} created, ${consumed} consumed`}
          >
            {lay.grid.map((g) => (
              <g key={g.value}>
                <line className="ops-grid" x1={lay.plot.left} x2={lay.w - lay.plot.right} y1={g.y} y2={g.y} />
                <text className="ops-ax-y" x={lay.plot.left - 4} y={g.y + 3}>
                  {g.value}
                </text>
              </g>
            ))}
            {lay.groups.map((g, i) => (
              <rect
                key={g.day}
                className="ops-hoverband"
                x={g.x0}
                y={lay.plot.top}
                width={g.x1 - g.x0}
                height={lay.plot.bottom - lay.plot.top}
              >
                <title>{`${g.day}: ${series[i]?.created ?? 0} created / ${series[i]?.consumed ?? 0} consumed`}</title>
              </rect>
            ))}
            {lay.bars.map((b, i) => (
              <rect
                key={`${b.day}/${b.series}/${i}`}
                className={`ops-vbar v-${b.series}`}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={1}
              />
            ))}
          </svg>
        </button>
      ) : (
        <ChartEmpty />
      )}
      <div className="ops-axis-x">
        <span className="ops-mini">{first}</span>
        <span className="ops-mini">today {last}</span>
      </div>
      <div className="ops-chart-sum">
        <b>{created}</b> created · <b>{consumed}</b> consumed · <b>{open}</b> still open
      </div>
    </section>
  )
}

function BacklogChart({
  series,
  openNow,
}: {
  series: VelDay[]
  openNow: number
}): React.JSX.Element {
  // reconstruct the open-backlog per day from the same series + the snapshot
  const points: { day: string; value: number }[] = new Array(series.length)
  let running = openNow
  for (let i = series.length - 1; i >= 0; i--) {
    const d = series[i] as VelDay
    points[i] = { day: d.day, value: Math.max(0, running) }
    running -= d.created - d.consumed
  }
  const active = points.some((p) => p.value > 0)
  const lay = backlogArea(points)
  const first = points[0]?.day.slice(5) ?? ''
  const last = points.at(-1)?.day.slice(5) ?? ''
  return (
    <section className="ops-card" aria-label="Open backlog">
      <div className="ops-card-head">
        <div>
          <div className="ops-card-title">Open backlog</div>
          <div className="ops-card-desc">Handoffs still open, per day.</div>
        </div>
      </div>
      {active ? (
        <button type="button" className="ops-chart-btn" onClick={goBoard} title="Open the board">
          <svg
            className="ops-chart"
            viewBox={`0 0 ${lay.w} ${lay.h}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`open backlog now ${openNow}`}
          >
            <defs>
              <linearGradient id="ops-backlog-grad" x1="0" y1="0" x2="0" y2="1">
                <stop className="grad-top" offset="0%" />
                <stop className="grad-bot" offset="100%" />
              </linearGradient>
            </defs>
            {lay.grid.map((g) => (
              <g key={g.value}>
                <line className="ops-grid" x1={lay.plot.left} x2={lay.w - lay.plot.right} y1={g.y} y2={g.y} />
                <text className="ops-ax-y" x={lay.plot.left - 4} y={g.y + 3}>
                  {g.value}
                </text>
              </g>
            ))}
            <path className="ops-area-fill" d={lay.areaPath} fill="url(#ops-backlog-grad)" />
            <path className="ops-area-line" d={lay.linePath} />
            {lay.points.map((p) => (
              <circle key={p.day} className="ops-area-hit" cx={p.x} cy={p.y} r={6}>
                <title>{`${p.day}: ${p.value} open`}</title>
              </circle>
            ))}
            <circle className="ops-area-dot" cx={lay.dot.x} cy={lay.dot.y} r={3} />
          </svg>
        </button>
      ) : (
        <ChartEmpty />
      )}
      <div className="ops-axis-x">
        <span className="ops-mini">{first}</span>
        <span className="ops-mini">today {last}</span>
      </div>
      <div className="ops-chart-sum">
        <b>{openNow}</b> open now
      </div>
    </section>
  )
}

// ── project health card + relations ───────────────────────────────────────────

function HealthCard({ row }: { row: HealthRow }): React.JSX.Element {
  const pct = Math.round(row.utilization * 100)
  return (
    <div
      className="ops-health ops-row-link"
      role="button"
      tabIndex={0}
      onClick={() => goAtlasLearn(row.project)}
      onKeyDown={rowKey(() => goAtlasLearn(row.project))}
      title={`Open Atlas for ${row.project}`}
    >
      <div className="ops-health-head">
        <span className="ops-dot" style={{ background: sectionTint(row.project) }} aria-hidden="true" />
        <span className="ops-health-name" title={row.project}>
          {row.project}
        </span>
        <span className="ops-mini ops-health-date">{row.lastDate}</span>
      </div>
      <div className="ops-health-chips">
        <span className="ops-chip">{row.noteCount} notes</span>
        {row.openIn > 0 && <span className="ops-chip">{row.openIn} in</span>}
        {row.openOut > 0 && <span className="ops-chip">{row.openOut} out</span>}
        {row.brief === 'stale' ? (
          <span className="ops-chip chip-rust">brief stale</span>
        ) : row.brief === 'none' ? (
          <span className="ops-chip">no brief</span>
        ) : (
          <span className="ops-chip chip-ok">brief fresh</span>
        )}
      </div>
      <div className="ops-util" title={`${row.openTotal} of ${row.total} handoffs open`}>
        <span className="ops-util-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function RelationChip({ rel }: { rel: Relation }): React.JSX.Element {
  return (
    <button type="button" className="ops-rel" onClick={goAtlas} title="Open Atlas overview">
      <span className="ops-rel-dot" style={{ background: sectionTint(rel.from) }} aria-hidden="true" />
      <span className="ops-rel-from">{rel.from}</span>
      <span className="ops-rel-arrow">→</span>
      <span className="ops-rel-dot" style={{ background: sectionTint(rel.to) }} aria-hidden="true" />
      <span className="ops-rel-to">{rel.to}</span>
      <span className="ops-rel-n">{rel.count}</span>
    </button>
  )
}
