/**
 * Today (DESIGN v3 §5, story 26.3) — replaces Home. The day's work surface:
 *   • Needs-you queue: every due-now inbound handoff (ranked oldest-first,
 *     one-key A/D/S/E per §4) + stale-brief and done-hidden rows from the
 *     epic25 attention insight — nothing double-listed.
 *   • In flight: the latest write per agent identity from the activity feed
 *     (recent writes today; the LIVE session feed arrives with P4's Agents).
 *   • New knowledge: the newest filed notes, one click from the Reader.
 *   • Rail: velocity + backlog charts, per-project health, relations — the
 *     epic25 dashboard re-homed (§5.1 keep-everything), same pure insights.
 * Live-recompute on watcher/poller events; the range toggle re-slices the
 * loaded feed, never re-fetches.
 */
import { useEffect, useState } from 'react'
import type { ActivityEvent, HandoffCard } from '../../../../shared/types'
import { actionsFor } from '../../../../shared/handoff-lanes'
import { AgentChip } from '../../components/AgentChip'
import { Button } from '../../components/Button'
import { ConsumeReceiptView } from '../../components/ConsumeReceiptView'
import { Segmented } from '../../components/Segmented'
import { StatusChip } from '../../components/StatusChip'
import { humanizeTitle } from '../../humanize'
import { useApp } from '../../stores/app'
import { useHandoffs } from '../../stores/handoffs'
import { useHome } from '../../stores/home'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { useReader } from '../../stores/reader'
import { useRoute } from '../../stores/route'
import { useWizard } from '../../stores/wizard'
import { relativeTime } from '../feed/feed-logic'
import { sectionTint } from '../reader/sectionTint'
import { openBrief } from '../handoffs/open-brief'
import { localDay } from '../handoffs/lifecycle'
import { sprintRollup, useWork } from '../../stores/work'
import { BrandMark } from '../../components/BrandMark'
import { useDashboardData } from '../home/dashboard-data'
import '../home/home.css'
import {
  ageTone,
  attentionQueue,
  isDueNow,
  openInbound,
  projectHealth,
  recentActivity,
  syncTile,
  topRelations,
  velocity,
  velocitySeries,
} from '../home/insights'
import { BacklogChart, goInbox, HealthCard, RelationChip, rowKey, VelocityChart } from './RailCards'

// ── range toggle (persisted; re-slices the loaded feed) ─────────────────────
type Range = '7' | '14' | '30'
const RANGE_KEY = 'loredex.home.range'
const RANGES: ReadonlyArray<{ value: Range; label: string }> = [
  { value: '7', label: 'Week' },
  { value: '14', label: '2 wks' },
  { value: '30', label: 'Month' },
]
function loadRange(): Range {
  try {
    const v = localStorage.getItem(RANGE_KEY)
    return v === '7' || v === '14' || v === '30' ? v : '7'
  } catch {
    return '7'
  }
}

const LONG_DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})

function openNote(path: string): void {
  useApp.getState().setView('reader')
  void useReader.getState().open(path)
}

/** Due-now inbound cards, oldest first — the queue's triage rows. */
export function needsYou(cards: readonly HandoffCard[]): HandoffCard[] {
  return [...cards.filter(isDueNow)].sort((a, b) => b.ageDays - a.ageDays)
}

/** Latest write per actor from the feed — Today's in-flight strip (the live
 *  MCP session feed replaces this source in P4; git attribution stays). */
export function latestByActor(feed: readonly ActivityEvent[], limit: number): ActivityEvent[] {
  const seen = new Set<string>()
  const rows: ActivityEvent[] = []
  for (const e of feed) {
    if (e.kind === 'sync' || !e.actor.name) continue
    if (seen.has(e.actor.name)) continue
    seen.add(e.actor.name)
    rows.push(e)
    if (rows.length >= limit) break
  }
  return rows
}

/** Newest filed notes (route events with a path) — the New knowledge strip. */
export function newKnowledge(feed: readonly ActivityEvent[], limit: number): ActivityEvent[] {
  const seen = new Set<string>()
  const rows: ActivityEvent[] = []
  for (const e of feed) {
    if (e.kind !== 'route' || !e.subject.path) continue
    if (seen.has(e.subject.path)) continue
    seen.add(e.subject.path)
    rows.push(e)
    if (rows.length >= limit) break
  }
  return rows
}

const NEEDS_YOU_CAP = 6

function TriageCard({ card, selected }: { card: HandoffCard; selected: boolean }): React.JSX.Element {
  const consume = useHandoffs((s) => s.consume)
  const setStatus = useHandoffs((s) => s.setStatus)
  const openDecline = useHandoffs((s) => s.openDecline)
  const openSnooze = useHandoffs((s) => s.openSnooze)
  const select = useHandoffs((s) => s.select)
  const busy = useHandoffs((s) => s.consumingId !== null || s.transitioningId !== null)
  const hasIdentity = useIdentity((s) => effectiveIdentity(s) !== null)
  const disabled = !hasIdentity || busy
  const idleTitle = hasIdentity ? undefined : 'Set your identity in Settings first'
  const actions = actionsFor(card, true)
  const tone = ageTone(card.ageDays)
  const stop =
    (fn: () => void) =>
    (e: React.MouseEvent): void => {
      e.stopPropagation()
      fn()
    }
  return (
    <div
      className={`triage-card${selected ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => {
        select(card.id)
        openBrief(card)
      }}
      onKeyDown={rowKey(() => openBrief(card))}
      onMouseEnter={() => select(card.id)}
    >
      <div className="triage-chips">
        <StatusChip status={card.expired ? 'expired' : card.status} />
        {card.kind === 'request' && <StatusChip status="request" />}
        <span className="triage-route">
          {card.from} ⟶ {card.to}
        </span>
        <span className={`triage-age age-${tone}`}>{card.ageDays}d ⟵ oldest</span>
      </div>
      <p className="triage-title" title={card.name}>
        {card.objective || humanizeTitle(card.name)}
      </p>
      <div className="triage-foot">
        <span className="triage-meta">
          from {card.from}
          {card.readingOrder.length > 0
            ? ` · reading order attached (${card.readingOrder.length})`
            : ''}
        </span>
        <span className="triage-actions">
          {actions.includes('accept') && (
            <Button
              variant="quiet"
              kbd="A"
              disabled={disabled}
              title={idleTitle ?? 'Accept — you will take this up'}
              onClick={stop(() => void setStatus(card, { to: 'accepted' }))}
            >
              Accept
            </Button>
          )}
          {actions.includes('decline') && (
            <Button
              variant="danger"
              className="button-small"
              kbd="D"
              disabled={disabled}
              title={idleTitle ?? 'Decline with a reason (reversible)'}
              onClick={stop(() => openDecline(card))}
            >
              Decline
            </Button>
          )}
          {actions.includes('snooze') && (
            <Button
              className="button-small"
              kbd="S"
              disabled={disabled}
              title={idleTitle ?? 'Snooze until a date'}
              onClick={stop(() => openSnooze(card))}
            >
              Snooze
            </Button>
          )}
          {actions.includes('reopen') && (
            <Button
              className="button-small"
              disabled={disabled}
              title={idleTitle ?? 'Reopen — back to the open lane'}
              onClick={stop(() => void setStatus(card, { to: 'open' }))}
            >
              Reopen
            </Button>
          )}
          {(card.status === 'open' || card.status === 'accepted') && (
            <Button
              variant="primary"
              className="button-small"
              kbd="E"
              disabled={disabled}
              title={idleTitle ?? 'Consume — mark it done for real'}
              onClick={stop(() => void consume(card))}
            >
              Consume
            </Button>
          )}
        </span>
      </div>
    </div>
  )
}

export function TodayView(): React.JSX.Element {
  const dash = useDashboardData((s) => s.dash)
  const activity = useDashboardData((s) => s.activity)
  const health = useDashboardData((s) => s.health)
  const dashError = useDashboardData((s) => s.error)
  const loadDash = useDashboardData((s) => s.load)
  const recurate = useDashboardData((s) => s.recurate)
  const recuratingProject = useDashboardData((s) => s.recuratingProject)
  const recurateDone = useDashboardData((s) => s.recurateDone)
  const [recurateTarget, setRecurateTarget] = useState<string | null>(null)
  const [recurateBefore, setRecurateBefore] = useState<{ brief: string; newer: number } | null>(
    null,
  )
  const cards = useHandoffs((s) => s.cards)
  const receipt = useHandoffs((s) => s.receipt)
  const dismissReceipt = useHandoffs((s) => s.dismissReceipt)
  const selectedId = useHandoffs((s) => s.selectedId)
  const brief = useHome((s) => s.brief)
  const workItems = useWork((s) => s.items)
  const vaultPath = useApp((s) => s.identity?.vaultPath ?? '')
  const setView = useApp((s) => s.setView)
  const [range, setRangeState] = useState<Range>(loadRange)

  useEffect(() => {
    if (!dash) void loadDash()
  }, [dash, loadDash])
  useEffect(() => {
    if (cards === null) void useHandoffs.getState().load()
    if (brief === null) void useHome.getState().load()
    if (workItems === null) void useWork.getState().load()
  }, [cards, brief, workItems])

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

  const queue = needsYou(all)
  const shownQueue = queue.slice(0, NEEDS_YOU_CAP)
  // brief-stale + done-hidden rows from the epic25 attention insight — cards
  // already shown as triage rows never double-list (their key carries cardId)
  const softRows = attentionQueue(all, dash?.states ?? []).filter((i) => !i.cardId)
  const inbound = openInbound(all)
  const vel = velocity(feed, today, inbound.open, windowDays)
  const velSeries = velocitySeries(feed, today, windowDays)
  const sync = syncTile(health)
  const healthRows = projectHealth(dash?.states ?? [], all)
  const relations = topRelations(dash?.edges ?? [])
  const sprint = sprintRollup(workItems ?? [])
  const inFlight = latestByActor(feed, 4)
  const knowledge = newKnowledge(feed, 5)
  const recent = recentActivity(feed, 6)

  const openRecurate = (project: string): void => {
    const row = (dash?.states ?? []).find((r) => r.project === project)
    setRecurateBefore({
      brief: row?.briefPath ? (row.notesNewerThanBrief > 0 ? 'stale' : 'fresh') : 'none',
      newer: row?.notesNewerThanBrief ?? 0,
    })
    setRecurateTarget(project)
  }
  const closeRecurate = (): void => {
    setRecurateTarget(null)
    setRecurateBefore(null)
    useDashboardData.getState().clearRecurate()
  }

  const metaLine = `${LONG_DATE.format(now).toLowerCase()} · ${queue.length} need you · ${
    inbound.open
  } open${sprint.sprint ? ` · ${sprint.sprint}` : ''} · sync ${sync.value.toLowerCase()}`

  if (empty) {
    return (
      <div className="ops-dash today">
        <div className="today-head">
          <div>
            <h1 className="ops-title">Today</h1>
            <span className="ops-subtitle">
              {(vaultPath.split('/').filter(Boolean).pop() ?? 'dex') + ' · fresh dex'}
            </span>
          </div>
        </div>
        <div className="ops-fresh">
          <p className="ops-fresh-line">Today fills as agents route notes and hand off work.</p>
          <div className="ops-fresh-actions">
            <Button variant="primary" onClick={() => void useRoute.getState().start()}>
              File a note…
            </Button>
            <Button onClick={() => useWizard.getState().openJoin()}>Join a dex…</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ops-dash today">
      <div className="today-head">
        <div>
          <h1 className="ops-title">Today</h1>
          <span className="ops-subtitle">{metaLine}</span>
        </div>
        <Segmented
          ariaLabel="Time range"
          options={RANGES}
          value={range}
          onChange={setRange}
        />
      </div>
      {dashError && <div className="note-error">{dashError}</div>}
      {receipt && <ConsumeReceiptView receipt={receipt} onDismiss={dismissReceipt} />}
      {sync.localOnly && (
        <div className="ops-degraded">
          This dex has no remote — notes stay local.{' '}
          <Button variant="quiet" onClick={() => setView('sync')}>
            Wire a remote
          </Button>
        </div>
      )}

      <div className="today-layout">
        <div className="today-main">
          {/* ── needs you ── */}
          <section aria-label="Needs you">
            <div className="today-sect">
              <span className="today-sect-label">needs you · {queue.length}</span>
              <span className="today-sect-note">ranked oldest-first</span>
            </div>
            {queue.length === 0 && softRows.length === 0 ? (
              <div className="ops-clear">All clear — nothing needs you.</div>
            ) : (
              <>
                {shownQueue.map((card) => (
                  <TriageCard key={card.id} card={card} selected={selectedId === card.id} />
                ))}
                {queue.length > shownQueue.length && (
                  <button type="button" className="today-more" onClick={goInbox}>
                    {queue.length - shownQueue.length} more in Inbox →
                  </button>
                )}
                {softRows.map((item) => (
                  <div
                    className="triage-soft"
                    key={item.key}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      item.action.kind === 'recurate' && item.project
                        ? openRecurate(item.project)
                        : goInbox()
                    }
                    onKeyDown={rowKey(() =>
                      item.action.kind === 'recurate' && item.project
                        ? openRecurate(item.project)
                        : goInbox(),
                    )}
                  >
                    <StatusChip status={item.action.kind === 'recurate' ? 'stale' : 'done'} />
                    <span className="triage-soft-title">
                      {item.title} — {item.reason}
                    </span>
                    <Button
                      className="button-small"
                      disabled={item.action.kind === 'recurate' && recuratingProject === item.project}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (item.action.kind === 'recurate' && item.project) openRecurate(item.project)
                        else goInbox()
                      }}
                    >
                      {item.action.kind === 'recurate' && recuratingProject === item.project
                        ? 'Re-curating…'
                        : item.action.label}
                    </Button>
                  </div>
                ))}
              </>
            )}
          </section>

          {/* ── in flight (latest write per agent; P4 wires the live session feed) ── */}
          <section aria-label="In flight">
            <div className="today-sect">
              <span className="today-sect-label">in flight · recent</span>
              <button type="button" className="today-sect-link" onClick={() => setView('feed')}>
                Open Activity →
              </button>
            </div>
            {inFlight.length === 0 ? (
              <div className="ops-clear">No agent writes in this range.</div>
            ) : (
              inFlight.map((e) => (
                <div className="flight-row" key={e.actor.name}>
                  <AgentChip name={e.actor.name} meta={relativeTime(e.at, nowMs)} />
                  <span className="flight-line" title={e.summary}>
                    ❯ {e.summary}
                  </span>
                  <Button variant="quiet" onClick={() => setView('feed')}>
                    Watch
                  </Button>
                </div>
              ))
            )}
          </section>

          {/* ── new knowledge ── */}
          <section aria-label="New knowledge">
            <div className="today-sect">
              <span className="today-sect-label">new knowledge</span>
            </div>
            {knowledge.length === 0 ? (
              <div className="ops-clear">Nothing filed yet in this range.</div>
            ) : (
              knowledge.map((e) => (
                <div
                  className="knowledge-row"
                  key={e.sha + (e.subject.path ?? '')}
                  role="button"
                  tabIndex={0}
                  onClick={() => e.subject.path && openNote(e.subject.path)}
                  onKeyDown={rowKey(() => e.subject.path && openNote(e.subject.path))}
                >
                  <span className="knowledge-title">
                    {humanizeTitle(
                      (e.subject.path ?? '').split('/').pop()?.replace(/\.md$/, '') ?? '',
                    )}
                  </span>
                  <span className="knowledge-path">{e.subject.path}</span>
                  <span className="ops-mini">{relativeTime(e.at, nowMs)}</span>
                </div>
              ))
            )}
          </section>

          {/* ── recent activity (the dex's git log teaser — §5.1 kept) ── */}
          <section aria-label="Recent activity">
            <div className="today-sect">
              <span className="today-sect-label">recent activity</span>
              <button type="button" className="today-sect-link" onClick={() => setView('feed')}>
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
        </div>

        {/* ── rail (reference/dom/01): Sprint → Pulse → Velocity; the v2
            backlog/health capabilities keep their cards below (§5.1) ── */}
        <div className="today-rail">
          <section className="ops-card sprint-card" aria-label="Sprint">
            <div className="sprint-head">
              <span className="sprint-name">
                {sprint.sprint ? sprint.sprint.toUpperCase() : 'No sprint'}
              </span>
              <span className="meta">
                {sprint.sprint ? `${sprint.done}/${sprint.total} done` : 'set sprint: on work items'}
              </span>
            </div>
            {sprint.total > 0 && (
              <>
                <div className="sprint-bar">
                  <span
                    className="sprint-bar-fill"
                    style={{ width: `${Math.round((sprint.done / Math.max(1, sprint.total)) * 100)}%` }}
                  />
                </div>
                <div className="sprint-stats meta">
                  {sprint.done} done · {sprint.doing} doing ·{' '}
                  <span className={sprint.todo > 0 ? 'sprint-todo' : ''}>{sprint.todo} to do</span>
                </div>
              </>
            )}
            <button type="button" className="today-sect-link" onClick={() => setView('plan')}>
              Open board →
            </button>
          </section>

          <section className="ops-card" aria-label="Project pulse">
            <div className="today-sect" style={{ margin: 0 }}>
              <span className="today-sect-label">project pulse</span>
            </div>
            <div className="pulse-list">
              {healthRows.slice(0, 6).map((row) => (
                <div className="pulse-row" key={row.project}>
                  <span
                    className="shelf-dot"
                    style={{ background: sectionTint(row.project) }}
                    aria-hidden="true"
                  />
                  <span className="pulse-name">{row.project}</span>
                  <span className={`pulse-state ${row.brief === 'stale' ? 'is-stale' : 'is-fresh'}`}>
                    {row.brief === 'stale' ? 'stale' : 'fresh'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <VelocityChart series={velSeries} open={vel.open} />
          <BacklogChart series={velSeries} openNow={inbound.open} />
          <section className="ops-card" aria-label="Project health">
            <div className="ops-card-head">
              <div>
                <div className="ops-card-title">Project health</div>
                <div className="ops-card-desc">Size, open flow, brief freshness.</div>
              </div>
            </div>
            <div className="ops-health-grid">
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
      </div>
      {recurateTarget && (
        <RecurateDialog
          project={recurateTarget}
          before={recurateBefore}
          running={recuratingProject === recurateTarget}
          done={recurateDone?.project === recurateTarget ? recurateDone : null}
          after={(dash?.states ?? []).find((r) => r.project === recurateTarget) ?? null}
          onConfirm={() => void recurate(recurateTarget)}
          onClose={closeRecurate}
        />
      )}
    </div>
  )
}

/** Re-curate flow (user request 2026-07-18): confirm → background CLI job with
 *  the logo as the loading graphic → before vs after, closed by the user. */
function RecurateDialog({
  project,
  before,
  running,
  done,
  after,
  onConfirm,
  onClose,
}: {
  project: string
  before: { brief: string; newer: number } | null
  running: boolean
  done: { ok: boolean; error?: string } | null
  after: { briefPath: string | null; notesNewerThanBrief: number } | null
  onConfirm: () => void
  onClose: () => void
}): React.JSX.Element {
  const stage = done ? 'done' : running ? 'running' : 'confirm'
  const afterState = after
    ? after.briefPath
      ? after.notesNewerThanBrief > 0
        ? `stale · ${after.notesNewerThanBrief} newer note${after.notesNewerThanBrief === 1 ? '' : 's'}`
        : 'fresh'
      : 'no brief'
    : '…'
  const beforeState = before
    ? before.brief === 'none'
      ? 'no brief'
      : `${before.brief}${before.newer > 0 ? ` · ${before.newer} newer note${before.newer === 1 ? '' : 's'}` : ''}`
    : '…'
  return (
    // biome-ignore lint: Escape/backdrop close only when not mid-run
    <div className="modal-backdrop" onMouseDown={stage === 'running' ? undefined : onClose}>
      <div
        className="modal recurate-dialog"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-title">Re-curate {project}</div>
        {stage === 'confirm' && (
          <>
            <p className="recurate-copy">
              Rewrites the project's Start-Here brief from everything filed since — runs the
              bundled loredex CLI and takes about a minute. The dex keeps working while it runs.
            </p>
            <div className="modal-footer recurate-footer">
              <Button variant="quiet" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={onConfirm}>
                Re-curate
              </Button>
            </div>
          </>
        )}
        {stage === 'running' && (
          <div className="recurate-running">
            <span className="recurate-logo">
              <BrandMark size={44} />
            </span>
            <p className="recurate-copy">
              curating {project} — reading every note, rewriting the brief…
            </p>
          </div>
        )}
        {stage === 'done' && (
          <>
            {done?.ok ? (
              <div className="recurate-result">
                <div className="recurate-row">
                  <span className="recurate-key">before</span>
                  <span className="recurate-val">{beforeState}</span>
                </div>
                <div className="recurate-row">
                  <span className="recurate-key">after</span>
                  <span className="recurate-val is-ok">{afterState}</span>
                </div>
              </div>
            ) : (
              <p className="modal-error">{done?.error ?? 'curate failed'}</p>
            )}
            <div className="modal-footer recurate-footer">
              <Button variant="primary" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
