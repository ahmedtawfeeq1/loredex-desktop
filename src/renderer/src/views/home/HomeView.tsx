/**
 * Home dashboard (story 15.5, spec: docs/plan/wireframe-home-dashboard.html):
 * Home stops rendering the Start-Here brief as a page of prose and becomes a
 * full-width insight dashboard — KPI row, attention/blocked band, project
 * pulse, churn/activity band, and the brief demoted to a link-out card.
 * Zero new backend asks: every number maps to an existing channel; this view
 * is a pure consumer of the insights aggregation module, and every tile is a
 * one-click jump into the view that acts on it.
 */
import { useEffect } from 'react'
import { blockedRows } from '../../../../shared/blocked'
import { formatAge } from '../../../../shared/handoff-lanes'
import type { HandoffCard } from '../../../../shared/types'
import { StatusChip } from '../../components/StatusChip'
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
  type ActivitySummary,
  activityCounts,
  ageTone,
  attentionRows,
  changesInWindow,
  type ChurnRow,
  churnByFile,
  oldestOpen,
  openInbound,
  type PulseRow,
  pulseRows,
  requestsWaiting,
  staleBriefs,
  startOfTodayIso,
  syncTile,
} from './insights'

/** Kinds in the feed's own vocabulary, fixed chip order (spec note 8). */
const ACTIVITY_KINDS = ['route', 'handoff', 'consume', 'status', 'sync'] as const

// ── deep links (spec §4 — each tile jumps into the view that acts on it) ────

function goBoard(): void {
  useHandoffs.getState().setProject('all')
  useApp.getState().setView('handoffs')
}

function goAtlasBlocked(): void {
  const atlas = useAtlas.getState()
  if (!atlas.filters.blocked) atlas.toggleBlocked() // opens the blocked side list
  useApp.getState().setView('atlas')
}

/** Project pulse row → Atlas Learn scoped to the project (spec note 6). */
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
  const all = cards ?? []
  const loading = dash === null
  const empty = !loading && dash.states.length === 0 && all.length === 0

  const inbound = openInbound(all)
  const waiting = requestsWaiting(all)
  const oldest = oldestOpen(all)
  const briefs = staleBriefs(dash?.states ?? [])
  const churn = churnByFile(changes ?? [], now.getTime())
  const contractCount = changesInWindow(changes ?? [], now.getTime()).length
  const today = activityCounts(activity ?? [], startOfTodayIso(now))
  const sync = syncTile(health)
  const attention = attentionRows(all)
  const blocked = blockedRows(all, vaultPath)
  const pulse = pulseRows(dash?.states ?? [], all)
  const vaultName = vaultPath.split('/').filter(Boolean).pop() ?? 'vault'
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(now)

  if (empty) {
    return (
      <div className="home-dash">
        <Header vaultName={vaultName} sub={`${weekday} ${localDay(now)}`} />
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
      <Header vaultName={vaultName} sub={`${weekday} ${localDay(now)}`} />
      {dashError && <div className="note-error">{dashError}</div>}

      <div className="dash-kpis">
        <Kpi label="Open inbound" value={loading ? '…' : String(inbound.open)}
          caption={`across ${inbound.projects} project${inbound.projects === 1 ? '' : 's'}`}
          title="Open the handoff board" onClick={goBoard} />
        <Kpi label="Requests waiting" value={loading ? '…' : String(waiting)} caption="no reply yet"
          title="Open the handoff board" onClick={goBoard} />
        <Kpi label="Oldest open" value={oldest ? formatAge(oldest.ageDays) : '—'}
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
          } />
        {(rootsCount ?? 0) > 0 && (
          <Kpi label="Contract changes" value={String(contractCount)} caption="last 7 days"
            title="Open the contract timeline" onClick={() => setView('contracts')} />
        )}
        <Kpi label="Stale briefs" value={loading ? '…' : String(briefs.attention)}
          caption={`of ${briefs.total} project${briefs.total === 1 ? '' : 's'}`}
          title="Open the Atlas overview" onClick={() => setView('atlas')} />
        <Kpi label="Sync" value={sync.value} caption={sync.caption} tone={sync.tone}
          title="Open sync health" onClick={() => setView('sync')} />
      </div>
      {/* degraded state (spec §3): local-only vault → one quiet wire-a-remote line */}
      {sync.localOnly && (
        <div className="dash-mini">
          This vault has no remote — notes stay local.{' '}
          <button type="button" className="button-quiet" onClick={() => setView('sync')}>
            Wire a remote
          </button>
        </div>
      )}

      <div className="dash-two-col">
        <section className="dash-card" aria-label="Needs attention">
          <div className="dash-card-title">Needs attention</div>
          <div className="dash-card-desc">
            Open + expired-snooze handoffs, oldest first. Click a row for its card.
          </div>
          {attention.length === 0 && <div className="dash-mini">nothing waiting — clean board</div>}
          {attention.map((card) => (
            <AttentionRow key={`${card.to}/${card.id}`} card={card} />
          ))}
        </section>

        <section className="dash-card" aria-label="Blocked, critical path">
          <div className="dash-card-title">Blocked · critical path</div>
          <div className="dash-card-desc">The blocking sentences, verbatim.</div>
          {blocked.length === 0 && <div className="dash-mini">no project is blocked right now</div>}
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
          <button type="button" className="button-quiet" onClick={goAtlasBlocked}>
            Open Atlas → Blocked
          </button>
        </section>
      </div>

      <section className="dash-card" aria-label="Project pulse">
        <div className="dash-card-title">Project pulse</div>
        <div className="dash-card-desc">
          One row per project — freshness, open flow, topics. Click for its Atlas Learn view.
        </div>
        {pulse.map((row) => (
          <PulseRowView key={row.project} row={row} />
        ))}
      </section>

      <div className="dash-two-col">
        {(rootsCount ?? 0) > 0 && (
          <section className="dash-card" aria-label="Contract churn">
            <div className="dash-card-title">Contract churn</div>
            <div className="dash-card-desc">Changes in registered contract files, 7-day window.</div>
            {churn.length === 0 && <div className="dash-mini">no contract changes this week</div>}
            {churn.map((row) => (
              <ChurnRowView key={`${row.repoRoot} ${row.file}`} row={row} />
            ))}
          </section>
        )}

        <section className="dash-card" aria-label="Today's activity">
          <div className="dash-card-title">Today's activity</div>
          <div className="dash-card-desc">Since midnight, from the vault's own git log.</div>
          <ActivityStrip summary={today} onOpen={() => setView('feed')} />
        </section>
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
      {/* spec note 1: live via watcher + poller — no Refresh affordance */}
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

function Kpi({
  label,
  value,
  caption,
  tone,
  title,
  onClick,
}: {
  label: string
  value: string
  caption: string
  tone?: 'ok' | 'warn' | 'err' | 'off'
  title?: string
  onClick?: () => void
}): React.JSX.Element {
  const toneClass = tone === 'ok' ? ' kpi-ok' : tone === 'warn' ? ' kpi-warn' : tone === 'err' ? ' kpi-err' : ''
  const body = (
    <>
      <div className="dash-kpi-k">{label}</div>
      <div className={`dash-kpi-v${toneClass}`}>{value}</div>
      <div className="dash-kpi-t">{caption}</div>
    </>
  )
  if (!onClick) return <div className="dash-kpi">{body}</div>
  return (
    <button type="button" className="dash-kpi" title={title} onClick={onClick}>
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
      <span className="dash-txt">{card.objective || card.name}</span>
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

function PulseRowView({ row }: { row: PulseRow }): React.JSX.Element {
  return (
    <div
      className="dash-row dash-row-link"
      role="button"
      tabIndex={0}
      onClick={() => goAtlasLearn(row.project)}
      onKeyDown={rowKey(() => goAtlasLearn(row.project))}
    >
      <span className="dash-strong">{row.project}</span>
      <span className="dash-mini">
        {row.noteCount} note{row.noteCount === 1 ? '' : 's'} · last {row.lastDate}
      </span>
      {row.openIn > 0 && <span className="dash-chip">{row.openIn} open in</span>}
      {row.openOut > 0 && <span className="dash-chip">{row.openOut} out</span>}
      {row.brief === 'stale' ? (
        <span className="dash-chip dash-chip-rust">brief stale — {row.newerNotes} newer</span>
      ) : row.brief === 'none' ? (
        <span className="dash-chip">no brief</span>
      ) : (
        <span className="dash-chip">brief fresh</span>
      )}
      <span className="dash-mini" style={{ marginLeft: 'auto' }}>
        {row.topics.filter((t) => t !== 'handoffs').slice(0, 3).join(' · ')}
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
      <span className="dash-mini">{row.file}</span>
      <span className="dash-txt">{row.project}</span>
      <span className="dash-chip">
        {row.changes} change{row.changes === 1 ? '' : 's'}
      </span>
      {row.linkedHandoffs > 0 && (
        <span className="dash-chip dash-chip-gold">
          {row.linkedHandoffs} linked handoff{row.linkedHandoffs === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}

function ActivityStrip({
  summary,
  onOpen,
}: {
  summary: ActivitySummary
  onOpen: () => void
}): React.JSX.Element {
  const max = Math.max(1, ...summary.hours)
  return (
    <button type="button" className="dash-activity" title="Open the activity feed" onClick={onOpen}>
      <div className="dash-chip-row">
        {summary.total === 0 && <span className="dash-mini">quiet so far today</span>}
        {ACTIVITY_KINDS.filter((k) => (summary.byKind[k] ?? 0) > 0).map((k) => (
          <span key={k} className="dash-chip">
            {k} ×{summary.byKind[k]}
          </span>
        ))}
      </div>
      {/* per-hour density: 24 plain SVG rects, no chart lib (spec note 8) */}
      <svg className="dash-density" viewBox="0 0 240 34" preserveAspectRatio="none" role="img"
        aria-label={`${summary.total} events today`}>
        {summary.hours.map((count, hour) => {
          const h = count === 0 ? 2 : 4 + (count / max) * 28
          return (
            <rect key={hour} className={count > 0 ? 'hour-active' : undefined}
              x={hour * 10} y={34 - h} width={8} height={h} rx={1}>
              <title>{`${String(hour).padStart(2, '0')}:00 — ${count} event${count === 1 ? '' : 's'}`}</title>
            </rect>
          )
        })}
      </svg>
    </button>
  )
}

/** The Start-Here brief, demoted to a link-out card (resolved Q4: the Reader
 *  owns prose). Freshness rides the existing home.brief payload. */
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
