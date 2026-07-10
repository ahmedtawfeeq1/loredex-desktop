/**
 * Home dashboard (story 15.5, spec: docs/plan/wireframe-home-dashboard.html):
 * Home stops rendering the Start-Here brief as a page of prose and becomes a
 * full-width insight dashboard — KPI row, attention/blocked band, project
 * pulse, churn/activity band, and the brief demoted to a link-out card.
 * Zero new backend asks: every number maps to an existing channel; this view
 * is a pure consumer of the insights aggregation module.
 */
import { useEffect } from 'react'
import { blockedRows } from '../../../../shared/blocked'
import { formatAge } from '../../../../shared/handoff-lanes'
import type { HandoffCard } from '../../../../shared/types'
import { StatusChip } from '../../components/StatusChip'
import { useApp } from '../../stores/app'
import { useHandoffs } from '../../stores/handoffs'
import { useHome } from '../../stores/home'
import { useRoute } from '../../stores/route'
import { useWizard } from '../../stores/wizard'
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
          caption={`across ${inbound.projects} project${inbound.projects === 1 ? '' : 's'}`} />
        <Kpi label="Requests waiting" value={loading ? '…' : String(waiting)} caption="no reply yet" />
        <Kpi label="Oldest open" value={oldest ? formatAge(oldest.ageDays) : '—'}
          tone={oldest ? ageKpiTone(oldest.ageDays) : undefined}
          caption={oldest ? `${oldest.from} → ${oldest.to}` : 'nothing open'} />
        {(rootsCount ?? 0) > 0 && (
          <Kpi label="Contract changes" value={String(contractCount)} caption="last 7 days" />
        )}
        <Kpi label="Stale briefs" value={loading ? '…' : String(briefs.attention)}
          caption={`of ${briefs.total} project${briefs.total === 1 ? '' : 's'}`} />
        <Kpi label="Sync" value={sync.value} caption={sync.caption} tone={sync.tone} />
      </div>

      <div className="dash-two-col">
        <section className="dash-card" aria-label="Needs attention">
          <div className="dash-card-title">Needs attention</div>
          <div className="dash-card-desc">Open + expired-snooze handoffs, oldest first.</div>
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
            <div key={row.id} className="dash-row">
              <span className="dash-txt">
                {row.sentence} <span className="dash-mini">— {row.objective}</span>
              </span>
            </div>
          ))}
        </section>
      </div>

      <section className="dash-card" aria-label="Project pulse">
        <div className="dash-card-title">Project pulse</div>
        <div className="dash-card-desc">One row per project — freshness, open flow, topics.</div>
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
          <ActivityStrip summary={today} />
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
}: {
  label: string
  value: string
  caption: string
  tone?: 'ok' | 'warn' | 'err' | 'off'
}): React.JSX.Element {
  const toneClass = tone === 'ok' ? ' kpi-ok' : tone === 'warn' ? ' kpi-warn' : tone === 'err' ? ' kpi-err' : ''
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-k">{label}</div>
      <div className={`dash-kpi-v${toneClass}`}>{value}</div>
      <div className="dash-kpi-t">{caption}</div>
    </div>
  )
}

function AttentionRow({ card }: { card: HandoffCard }): React.JSX.Element {
  return (
    <div className="dash-row">
      <StatusChip status={card.status} />
      {card.kind === 'request' && <span className="status-chip chip-request">request</span>}
      <span className="dash-mini">
        {card.from} ⟶ {card.to}
      </span>
      <span className="dash-txt">{card.objective || card.name}</span>
      <span className={`age-chip age-${ageTone(card.ageDays)}`}>
        {card.expired ? 'expired' : formatAge(card.ageDays)}
      </span>
    </div>
  )
}

function PulseRowView({ row }: { row: PulseRow }): React.JSX.Element {
  return (
    <div className="dash-row">
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
    <div className="dash-row">
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

function ActivityStrip({ summary }: { summary: ActivitySummary }): React.JSX.Element {
  const max = Math.max(1, ...summary.hours)
  return (
    <div>
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
    </div>
  )
}

/** The Start-Here brief, demoted to a link-out card (resolved Q4: the Reader
 *  owns prose). Freshness rides the existing home.brief payload. */
function BriefCard(): React.JSX.Element {
  const brief = useHome((s) => s.brief)
  const error = useHome((s) => s.error)
  const freshness = brief ? formatFreshness(brief.mtime) : null
  const title = brief ? (splitLeadingH1(brief.markdown).title ?? DEFAULT_BRIEF_TITLE) : DEFAULT_BRIEF_TITLE
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
      </div>
    </section>
  )
}
