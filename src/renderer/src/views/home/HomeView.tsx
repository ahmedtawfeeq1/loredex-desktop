/**
 * Home dashboard (epic21, D1 amendment 7 §A): a solution-grade operations
 * dashboard for a team knowledge/handoff product — not a flat KPI row.
 *   • Hero band — headline stat tiles WITH context + WoW trend arrows, each a
 *     one-click jump into the view that acts on it.
 *   • Velocity strip — handoffs created vs consumed over 7d (paired bars).
 *   • Attention column (left, 2/3) — the ranked actionable-handoff list with
 *     inline Consume/Snooze, and the Blocked/critical-path card beneath.
 *   • Insight column (right, 1/3) — per-project pulse bars, a 14-day activity
 *     sparkline, contract-churn-by-file, and a sync-health mini. The right
 *     column stacks to fill the height beside the tall attention list.
 * Zero new backend: every number folds from existing channels (dashboard.build
 * / handoffs.list / activity.feed / contracts.timeline / sync.status / atlas
 * blocked model) through the pure insights aggregation module. SVG only, no
 * chart libs. One gold primary max; live-recompute (watcher + poller), never a
 * Refresh button; empty/degraded states per amendment.
 */
import { useEffect } from 'react'
import { blockedRows } from '../../../../shared/blocked'
import { formatAge } from '../../../../shared/handoff-lanes'
import type { HandoffCard } from '../../../../shared/types'
import { StatusChip } from '../../components/StatusChip'
import { humanizeTitle } from '../../humanize'
import { useApp } from '../../stores/app'
import { useAtlas } from '../../stores/atlas'
import { useContracts } from '../../stores/contracts'
import { useHandoffs } from '../../stores/handoffs'
import { useHome } from '../../stores/home'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { useReader } from '../../stores/reader'
import { useRoute } from '../../stores/route'
import { useWizard } from '../../stores/wizard'
import { openBrief } from '../handoffs/Board'
import { localDay } from '../handoffs/lifecycle'
import { DEFAULT_BRIEF_TITLE, splitLeadingH1 } from './brief-title'
import { formatFreshness } from './freshness'
import { useDashboardData } from './dashboard-data'
import './home.css'
import {
  ageTone,
  attentionRows,
  changesInWindow,
  type ChurnRow,
  churnByFile,
  type DayBucket,
  dailyBuckets,
  maxNoteCount,
  oldestOpen,
  openInbound,
  type PulseRow,
  rankedPulse,
  requestsWaiting,
  syncTile,
  velocity,
  type WowTrend,
  wowTrend,
} from './insights'

/** Feed kinds in fixed stack order — the sparkline/velocity tint order. */
const SPARK_KINDS = ['route', 'handoff', 'consume', 'status', 'sync'] as const

// ── deep links (each tile/row jumps into the view that acts on it) ───────────

function goBoard(): void {
  useHandoffs.getState().setProject('all')
  useApp.getState().setView('handoffs')
}

function goAtlasBlocked(): void {
  const atlas = useAtlas.getState()
  if (!atlas.filters.blocked) atlas.toggleBlocked() // opens the blocked side list
  useApp.getState().setView('atlas')
}

/** Project pulse row → Atlas Learn scoped to the project. */
function goAtlasLearn(project: string): void {
  useApp.getState().setView('atlas')
  void useAtlas.getState().drillProject(project)
}

/** Churn row → Contracts scoped to the file's project, focus-ringed on its
 *  newest change — the atlas resolve.ts contract-timeline pattern. */
function goContractsFile(row: ChurnRow): void {
  const contracts = useContracts.getState()
  useApp.getState().setView('contracts')
  contracts.setProject(row.project)
  void contracts.load().then(() => {
    useContracts.getState().focus(row.latestSha)
  })
}

/** Blocked row → the handoff's board card (brief + reading order), via relPath. */
function openByRelPath(relPath: string, id: string): void {
  const card = (useHandoffs.getState().cards ?? []).find((c) => c.id === id)
  if (card) {
    openBrief(card)
    return
  }
  useApp.getState().setView('reader')
  void useReader.getState().open(relPath)
}

/** Row-as-button keyboard contract (the handoff-card pattern): ⏎ activates. */
function rowKey(run: () => void): (e: React.KeyboardEvent) => void {
  return (e) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) run()
  }
}

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

  useEffect(() => {
    if (!dash) void loadDash()
  }, [dash, loadDash])
  useEffect(() => {
    // cards + brief ride their existing stores (board badge / reader share them)
    if (cards === null) void useHandoffs.getState().load()
    if (brief === null) void useHome.getState().load()
  }, [cards, brief])

  const now = new Date()
  const today = localDay(now)
  const nowMs = now.getTime()
  const all = cards ?? []
  const feed = activity ?? []
  const loading = dash === null
  const empty = !loading && dash.states.length === 0 && all.length === 0

  const inbound = openInbound(all)
  const waiting = requestsWaiting(all)
  const oldest = oldestOpen(all)
  const churn = churnByFile(changes ?? [], nowMs)
  const contractCount = changesInWindow(changes ?? [], nowMs).length
  const sync = syncTile(health)
  const attention = attentionRows(all)
  const blocked = blockedRows(all, vaultPath)
  const pulse = rankedPulse(dash?.states ?? [], all)
  const maxNotes = maxNoteCount(pulse)
  const buckets = dailyBuckets(feed, today)
  const vel = velocity(feed, today, inbound.open)
  const inboundWow = wowTrend(feed, today, 'handoff')
  const hasContracts = (rootsCount ?? 0) > 0
  const vaultName = vaultPath.split('/').filter(Boolean).pop() ?? 'vault'
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now)

  if (empty) {
    return (
      <div className="home-dash">
        <Header vaultName={vaultName} sub={`${weekday} ${today}`} />
        <div className="empty-state" style={{ border: 'none' }}>
          <p>Nothing filed yet — this dashboard fills itself as agents route notes.</p>
          <div className="dash-empty-actions">
            <button
              type="button"
              className="button-secondary"
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

  return (
    <div className="home-dash">
      <Header vaultName={vaultName} sub={`${weekday} ${today}`} />
      {dashError && <div className="note-error">{dashError}</div>}

      {/* ── hero band: headline stats WITH context + WoW trend ─────────────── */}
      <div className="dash-hero">
        <HeroTile
          label="Open inbound"
          value={loading ? '…' : String(inbound.open)}
          caption={`across ${inbound.projects} project${inbound.projects === 1 ? '' : 's'}`}
          trend={inboundWow}
          title="Open the handoff board"
          onClick={goBoard}
        />
        <HeroTile
          label="Oldest open"
          value={oldest ? formatAge(oldest.ageDays) : '—'}
          tone={oldest ? ageKpiTone(oldest.ageDays) : undefined}
          caption={oldest ? `${oldest.from} → ${oldest.to}` : 'nothing open'}
          title={oldest ? 'Open this handoff' : undefined}
          onClick={
            oldest
              ? () => {
                  const card = all.find((c) => c.id === oldest.id && c.to === oldest.to)
                  if (card) openBrief(card)
                }
              : undefined
          }
        />
        <HeroTile
          label="Requests waiting"
          value={loading ? '…' : String(waiting)}
          caption="no reply yet"
          title="Open the handoff board"
          onClick={goBoard}
        />
        {hasContracts && (
          <HeroTile
            label="Contract changes"
            value={String(contractCount)}
            caption="last 7 days"
            title="Open the contract timeline"
            onClick={() => setView('contracts')}
          />
        )}
      </div>

      {/* degraded state (spec §3): local-only vault → one quiet wire-a-remote line */}
      {sync.localOnly && (
        <div className="dash-mini dash-degraded">
          This vault has no remote — notes stay local.{' '}
          <button type="button" className="button-quiet" onClick={() => setView('sync')}>
            Wire a remote
          </button>
        </div>
      )}

      {/* ── velocity strip: created vs consumed, 7 days ───────────────────── */}
      <VelocityStrip
        days={buckets.slice(-7)}
        created={vel.created}
        consumed={vel.consumed}
        open={vel.open}
        onOpen={goBoard}
      />

      {/* ── main: attention (2/3) · insight (1/3) ─────────────────────────── */}
      <div className="dash-main">
        <div className="dash-col-attention">
          <section className="dash-card" aria-label="Needs attention">
            <div className="dash-card-title">Needs attention</div>
            <div className="dash-card-desc">
              Open + expired-snooze handoffs, oldest first. Click a row for its card.
            </div>
            {attention.length === 0 && (
              <div className="dash-mini">nothing waiting — clean board</div>
            )}
            {attention.map((card) => (
              <AttentionRow key={`${card.to}/${card.id}`} card={card} />
            ))}
          </section>

          <section className="dash-card" aria-label="Blocked, critical path">
            <div className="dash-card-title">Blocked · critical path</div>
            <div className="dash-card-desc">The blocking sentences, verbatim.</div>
            {blocked.length === 0 && (
              <div className="dash-mini">no project is blocked right now</div>
            )}
            {blocked.map((row) => (
              <div
                key={row.id}
                className="dash-row dash-row-link"
                role="button"
                tabIndex={0}
                onClick={() => openByRelPath(row.relPath, row.id)}
                onKeyDown={rowKey(() => openByRelPath(row.relPath, row.id))}
              >
                <span className="dash-txt">
                  {row.sentence} <span className="dash-mini">— {row.objective}</span>
                </span>
              </div>
            ))}
            {blocked.length > 0 && (
              <button type="button" className="button-quiet" onClick={goAtlasBlocked}>
                Open Atlas → Blocked
              </button>
            )}
          </section>
        </div>

        <div className="dash-col-insight">
          <section className="dash-card" aria-label="Project pulse">
            <div className="dash-card-title">Project pulse</div>
            <div className="dash-card-desc">Freshness, open flow, size — busiest first.</div>
            {pulse.map((row) => (
              <PulseRowView key={row.project} row={row} maxNotes={maxNotes} />
            ))}
          </section>

          <section className="dash-card" aria-label="14-day activity">
            <div className="dash-card-title">Activity · 14 days</div>
            <div className="dash-card-desc">Per day, from the vault's own git log.</div>
            <Sparkline buckets={buckets} onOpen={() => setView('feed')} />
          </section>

          {hasContracts && (
            <section className="dash-card" aria-label="Contract churn">
              <div className="dash-card-title">Contract churn</div>
              <div className="dash-card-desc">Busiest contract files, 7-day window.</div>
              {churn.length === 0 && (
                <div className="dash-mini">no contract changes this week</div>
              )}
              {churn.slice(0, 6).map((row) => (
                <ChurnRowView key={`${row.repoRoot} ${row.file}`} row={row} />
              ))}
            </section>
          )}

          <SyncMini
            value={sync.value}
            caption={sync.caption}
            tone={sync.tone}
            onOpen={() => setView('sync')}
          />
        </div>
      </div>

      <BriefCard />
    </div>
  )
}

function Header({ vaultName, sub }: { vaultName: string; sub: string }): React.JSX.Element {
  return (
    <div className="dash-header">
      <span className="dash-title">Home</span>
      <span className="dash-sub">
        {vaultName} · {sub}
      </span>
      {/* live via watcher + poller — no Refresh affordance */}
      <span className="dash-live" title="Recomputes on vault watcher and remote poller events">
        live · watcher + poller
      </span>
    </div>
  )
}

function ageKpiTone(ageDays: number): 'warn' | 'err' | undefined {
  const tone = ageTone(ageDays)
  return tone === 'amber' ? 'warn' : tone === 'rust' ? 'err' : undefined
}

/** Week-over-week arrow: ▲ up / ▼ down / — flat, with the signed delta. Tone is
 *  informational (navy/quiet), not judgemental — more inbound isn't "bad". */
function TrendArrow({ trend }: { trend: WowTrend }): React.JSX.Element | null {
  if (trend.current === 0 && trend.previous === 0) return null
  const glyph = trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '—'
  const sign = trend.delta > 0 ? `+${trend.delta}` : String(trend.delta)
  return (
    <span
      className={`dash-trend dash-trend-${trend.direction}`}
      title={`${trend.current} this week vs ${trend.previous} last week`}
    >
      {glyph} {trend.direction === 'flat' ? 'flat' : `${sign} wk`}
    </span>
  )
}

function HeroTile({
  label,
  value,
  caption,
  tone,
  trend,
  title,
  onClick,
}: {
  label: string
  value: string
  caption: string
  tone?: 'ok' | 'warn' | 'err' | 'off'
  trend?: WowTrend
  title?: string
  onClick?: () => void
}): React.JSX.Element {
  const toneClass =
    tone === 'ok' ? ' kpi-ok' : tone === 'warn' ? ' kpi-warn' : tone === 'err' ? ' kpi-err' : ''
  const body = (
    <>
      <div className="dash-kpi-k">{label}</div>
      <div className="dash-hero-vrow">
        <span className={`dash-kpi-v${toneClass}`}>{value}</span>
        {trend && <TrendArrow trend={trend} />}
      </div>
      <div className="dash-kpi-t">{caption}</div>
    </>
  )
  if (!onClick) return <div className="dash-kpi dash-hero-tile">{body}</div>
  return (
    <button type="button" className="dash-kpi dash-hero-tile" title={title} onClick={onClick}>
      {body}
    </button>
  )
}

/**
 * One needs-attention row: click opens the card's brief exactly like the
 * board; hover/focus reveals the state-legal inline actions riding the
 * board's own store (handoffs.consume / handoffs.setStatus — receipt toast +
 * instant recompute, no duplicated logic). Nothing here deletes.
 */
function AttentionRow({ card }: { card: HandoffCard }): React.JSX.Element {
  const consume = useHandoffs((s) => s.consume)
  const setStatus = useHandoffs((s) => s.setStatus)
  const openSnooze = useHandoffs((s) => s.openSnooze)
  const busy = useHandoffs((s) => s.consumingId !== null || s.transitioningId !== null)
  const hasIdentity = useIdentity((s) => effectiveIdentity(s) !== null)
  const disabled = !hasIdentity || busy
  const idleTitle = hasIdentity ? undefined : 'Set your identity in Settings first'
  const stop =
    (fn: () => void) =>
    (e: React.MouseEvent): void => {
      e.stopPropagation()
      fn()
    }
  return (
    <div
      className="dash-row dash-row-link"
      role="button"
      tabIndex={0}
      onClick={() => openBrief(card)}
      onKeyDown={rowKey(() => openBrief(card))}
    >
      <StatusChip status={card.status} />
      {card.kind === 'request' && <span className="status-chip chip-request">request</span>}
      <span className="dash-mini">
        {card.from} ⟶ {card.to}
      </span>
      {/* story 17.1: the name fallback humanizes; filename stays in the tooltip */}
      <span className="dash-txt" title={card.name}>
        {card.objective || humanizeTitle(card.name)}
      </span>
      <span className="dash-row-actions">
        {(card.status === 'open' || card.status === 'accepted') && (
          <button
            type="button"
            className="button-secondary button-small"
            disabled={disabled}
            title={idleTitle ?? 'Consume this handoff'}
            onClick={stop(() => void consume(card))}
          >
            Consume
          </button>
        )}
        {card.status === 'open' && (
          <button
            type="button"
            className="button-secondary button-small"
            disabled={disabled}
            title={idleTitle ?? 'Snooze until a date'}
            onClick={stop(() => openSnooze(card))}
          >
            Snooze ▾
          </button>
        )}
        {card.status === 'snoozed' && card.expired && (
          <button
            type="button"
            className="button-secondary button-small"
            disabled={disabled}
            title={idleTitle ?? 'Reopen — back with the open cards'}
            onClick={stop(() => void setStatus(card, { to: 'open' }))}
          >
            Reopen
          </button>
        )}
      </span>
      <span className={`age-chip age-${ageTone(card.ageDays)}`}>
        {card.expired ? 'expired' : formatAge(card.ageDays)}
      </span>
    </div>
  )
}

/** Compact pulse row with a note-count bar (relative to the busiest project). */
function PulseRowView({ row, maxNotes }: { row: PulseRow; maxNotes: number }): React.JSX.Element {
  const pct = Math.round((row.noteCount / maxNotes) * 100)
  return (
    <div
      className="dash-pulse dash-row-link"
      role="button"
      tabIndex={0}
      onClick={() => goAtlasLearn(row.project)}
      onKeyDown={rowKey(() => goAtlasLearn(row.project))}
    >
      <div className="dash-pulse-head">
        <span className="dash-strong">{row.project}</span>
        {row.openIn > 0 && <span className="dash-chip">{row.openIn} in</span>}
        {row.openOut > 0 && <span className="dash-chip">{row.openOut} out</span>}
        {row.brief === 'stale' ? (
          <span className="dash-chip dash-chip-rust">brief stale · {row.newerNotes}</span>
        ) : row.brief === 'none' ? (
          <span className="dash-chip">no brief</span>
        ) : (
          <span className="dash-chip">brief fresh</span>
        )}
        <span className="dash-mini dash-pulse-date">{row.lastDate}</span>
      </div>
      <div className="dash-pulse-bar" aria-hidden="true">
        <span className="dash-pulse-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="dash-mini">
        {row.noteCount} note{row.noteCount === 1 ? '' : 's'}
      </span>
    </div>
  )
}

function ChurnRowView({ row }: { row: ChurnRow }): React.JSX.Element {
  return (
    <div
      className="dash-row dash-row-link"
      role="button"
      tabIndex={0}
      title="Open the timeline scoped to this file's project"
      onClick={() => goContractsFile(row)}
      onKeyDown={rowKey(() => goContractsFile(row))}
    >
      <span className="dash-mini dash-txt">{row.file}</span>
      <span className="dash-chip">
        {row.changes} change{row.changes === 1 ? '' : 's'}
      </span>
      {row.linkedHandoffs > 0 && (
        <span className="dash-chip dash-chip-gold">
          {row.linkedHandoffs} linked
        </span>
      )}
    </div>
  )
}

/** 14 kind-tinted stacked day bars — one click target into the Activity feed. */
function Sparkline({
  buckets,
  onOpen,
}: {
  buckets: DayBucket[]
  onOpen: () => void
}): React.JSX.Element {
  const total = buckets.reduce((s, b) => s + b.total, 0)
  const max = Math.max(1, ...buckets.map((b) => b.total))
  const colW = 100 / buckets.length
  const barW = colW * 0.66
  const H = 40
  const first = buckets[0]?.day.slice(5) ?? ''
  const last = buckets[buckets.length - 1]?.day.slice(5) ?? ''
  return (
    <button
      type="button"
      className="dash-spark-wrap"
      title="Open the activity feed"
      onClick={onOpen}
    >
      <svg
        className="dash-spark"
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${total} events over 14 days`}
      >
        {buckets.map((b, i) => {
          const x = i * colW + (colW - barW) / 2
          if (b.total === 0) {
            return (
              <rect key={b.day} className="spark-empty" x={x} y={H - 1.5} width={barW} height={1.5}>
                <title>{`${b.day} — no activity`}</title>
              </rect>
            )
          }
          let acc = 0
          return (
            <g key={b.day}>
              {SPARK_KINDS.map((k) => {
                const c = b.byKind[k] ?? 0
                if (c === 0) return null
                const h = (c / max) * (H - 2)
                const y = H - acc - h
                acc += h
                return (
                  <rect key={k} className={`spark-${k}`} x={x} y={y} width={barW} height={h}>
                    <title>{`${b.day} · ${k} ×${c}`}</title>
                  </rect>
                )
              })}
            </g>
          )
        })}
      </svg>
      <div className="dash-spark-axis">
        <span className="dash-mini">{first}</span>
        <span className="dash-mini">today {last}</span>
      </div>
    </button>
  )
}

/** Handoffs created vs consumed over 7 days — paired bars + the plain summary. */
function VelocityStrip({
  days,
  created,
  consumed,
  open,
  onOpen,
}: {
  days: DayBucket[]
  created: number
  consumed: number
  open: number
  onOpen: () => void
}): React.JSX.Element {
  const max = Math.max(
    1,
    ...days.flatMap((b) => [b.byKind.handoff ?? 0, b.byKind.consume ?? 0]),
  )
  const H = 34
  const groupW = 100 / days.length
  const barW = groupW * 0.28
  return (
    <section className="dash-card dash-velocity" aria-label="Handoff velocity">
      <div className="dash-velocity-head">
        <span className="dash-card-title">Velocity · 7 days</span>
        <span className="dash-velocity-legend">
          <span className="vel-key vel-created" /> handed off
          <span className="vel-key vel-consumed" /> consumed
        </span>
      </div>
      <button type="button" className="dash-spark-wrap" title="Open the handoff board" onClick={onOpen}>
        <svg
          className="dash-velbars"
          viewBox={`0 0 100 ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${created} handed off, ${consumed} consumed over 7 days`}
        >
          {days.map((b, i) => {
            const c = b.byKind.handoff ?? 0
            const d = b.byKind.consume ?? 0
            const base = i * groupW + groupW / 2
            const ch = c === 0 ? 0 : (c / max) * (H - 2)
            const dh = d === 0 ? 0 : (d / max) * (H - 2)
            return (
              <g key={b.day}>
                <rect className="vel-created" x={base - barW - 0.6} y={H - ch} width={barW} height={ch}>
                  <title>{`${b.day} — ${c} handed off`}</title>
                </rect>
                <rect className="vel-consumed" x={base + 0.6} y={H - dh} width={barW} height={dh}>
                  <title>{`${b.day} — ${d} consumed`}</title>
                </rect>
              </g>
            )
          })}
        </svg>
      </button>
      <div className="dash-velocity-sum">
        <b>{created}</b> handed off · <b>{consumed}</b> consumed · <b>{open}</b> still open
      </div>
    </section>
  )
}

function SyncMini({
  value,
  caption,
  tone,
  onOpen,
}: {
  value: string
  caption: string
  tone: 'ok' | 'warn' | 'err' | 'off'
  onOpen: () => void
}): React.JSX.Element {
  return (
    <button type="button" className="dash-card dash-syncmini" onClick={onOpen} title="Open sync health">
      <span className={`dash-syncdot sync-${tone}`}>{value}</span>
      <span className="dash-syncmini-body">
        <span className="dash-card-title">Sync</span>
        <span className="dash-mini">{caption}</span>
      </span>
    </button>
  )
}

/** The Start-Here brief, demoted to a link-out card (the Reader owns prose).
 *  Freshness rides the existing home.brief payload. */
function BriefCard(): React.JSX.Element {
  const brief = useHome((s) => s.brief)
  const error = useHome((s) => s.error)
  const freshness = brief ? formatFreshness(brief.mtime) : null
  const title = brief ? (splitLeadingH1(brief.markdown).title ?? DEFAULT_BRIEF_TITLE) : DEFAULT_BRIEF_TITLE
  const open = (): void => {
    if (!brief?.path) return
    useApp.getState().setView('reader')
    void useReader.getState().open(brief.path)
  }
  return (
    <section className="dash-card" aria-label="Product brief">
      <div className="dash-card-title">Product brief</div>
      {error && <div className="dash-mini">{error}</div>}
      <div className="dash-row">
        <span className="dash-txt">{title}</span>
        {freshness && (
          <span className={`freshness freshness-${freshness.tone}`}>{freshness.label}</span>
        )}
        {brief?.generated && (
          <span className="dash-mini">
            live snapshot — run <span className="mono">loredex product</span> to curate
          </span>
        )}
        <button
          type="button"
          className="button-secondary button-small"
          style={{ marginLeft: 'auto' }}
          disabled={!brief?.path}
          title={
            brief?.path
              ? 'Read the brief with working links'
              : 'No curated brief file yet — the dashboard above is the live state'
          }
          onClick={open}
        >
          Open in Reader
        </button>
      </div>
    </section>
  )
}
