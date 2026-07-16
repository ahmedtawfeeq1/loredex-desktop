/**
 * Today's rail cards (story 26.3) — the epic25 dashboard capabilities
 * re-homed per DESIGN v3 §5 ("Today … + rail (sprint/pulse/velocity)"):
 * hand-built SVG velocity bars + backlog area from the pure charts/*
 * geometry, per-project health cards, and the relations strip. Moved
 * verbatim from HomeView.tsx; only the section framing changed.
 */
import { useApp } from '../../stores/app'
import { useAtlas } from '../../stores/atlas'
import { useHandoffs } from '../../stores/handoffs'
import { sectionTint } from '../reader/sectionTint'
import { backlogArea } from '../home/charts/backlog-area'
import { velocityBars } from '../home/charts/velocity-bars'
import type { HealthRow, Relation, VelDay } from '../home/insights'

export function goInbox(): void {
  useHandoffs.getState().setProject('all')
  useApp.getState().setView('handoffs')
}
export function goAtlas(): void {
  useApp.getState().setView('atlas')
}
export function goAtlasLearn(project: string): void {
  useApp.getState().setView('atlas')
  void useAtlas.getState().drillProject(project)
}
/** Row-as-button keyboard contract: ⏎ activates when the row itself is focused. */
export function rowKey(run: () => void): (e: React.KeyboardEvent) => void {
  return (e) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) run()
  }
}

function ChartEmpty(): React.JSX.Element {
  return <div className="ops-chart-empty">Not enough history yet in this range.</div>
}

export function VelocityChart({
  series,
  open,
}: {
  series: VelDay[]
  open: number
}): React.JSX.Element {
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
        <button type="button" className="ops-chart-btn" onClick={goInbox} title="Open the Inbox">
          <svg
            className="ops-chart"
            viewBox={`0 0 ${lay.w} ${lay.h}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`${created} created, ${consumed} consumed`}
          >
            {lay.grid.map((g) => (
              <g key={g.value}>
                <line
                  className="ops-grid"
                  x1={lay.plot.left}
                  x2={lay.w - lay.plot.right}
                  y1={g.y}
                  y2={g.y}
                />
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

export function BacklogChart({
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
        <button type="button" className="ops-chart-btn" onClick={goInbox} title="Open the Inbox">
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
                <line
                  className="ops-grid"
                  x1={lay.plot.left}
                  x2={lay.w - lay.plot.right}
                  y1={g.y}
                  y2={g.y}
                />
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

export function HealthCard({ row }: { row: HealthRow }): React.JSX.Element {
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
        <span
          className="ops-dot"
          style={{ background: sectionTint(row.project) }}
          aria-hidden="true"
        />
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

export function RelationChip({ rel }: { rel: Relation }): React.JSX.Element {
  return (
    <button type="button" className="ops-rel" onClick={goAtlas} title="Open Atlas overview">
      <span
        className="ops-rel-dot"
        style={{ background: sectionTint(rel.from) }}
        aria-hidden="true"
      />
      <span className="ops-rel-from">{rel.from}</span>
      <span className="ops-rel-arrow">→</span>
      <span className="ops-rel-dot" style={{ background: sectionTint(rel.to) }} aria-hidden="true" />
      <span className="ops-rel-to">{rel.to}</span>
      <span className="ops-rel-n">{rel.count}</span>
    </button>
  )
}
