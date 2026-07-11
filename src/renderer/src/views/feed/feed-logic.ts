/** Pure feed view logic (story 6.2; redesigned per D1 "Activity cards" in
 *  story 16.6): status-churn collapse, day grouping, times, paths, per-kind
 *  action descriptors, navigation targets. */
import type { ActivityEvent } from '../../../../shared/types'

/* ── status-churn collapse (D1: "status churn ×N") ─────────────────────── */

/** Consecutive status flips join a churn run when adjacent flips on the same
 *  handoff by the same actor are within this window. */
export const CHURN_WINDOW_MS = 10 * 60_000

export type FeedItem =
  | { type: 'single'; event: ActivityEvent }
  /** ≥2 collapsed status flips; events stay newest-first like the feed */
  | { type: 'churn'; handoffId: string; actor: ActivityEvent['actor']; events: ActivityEvent[] }

/** The item's timestamp (a churn card sits at its newest flip). */
export function itemAt(item: FeedItem): string {
  return item.type === 'single' ? item.event.at : (item.events[0]?.at ?? '')
}

/**
 * D1: consecutive status flips on the same handoff by the same actor within
 * 10 min collapse into ONE expandable card. Input is the feed's newest-first
 * event stream; any other event kind (or a different handoff/actor/gap) breaks
 * the run. Runs of one stay ordinary cards.
 */
export function collapseChurn(events: ActivityEvent[]): FeedItem[] {
  const items: FeedItem[] = []
  let run: ActivityEvent[] = []

  const flush = (): void => {
    const head = run[0]
    if (run.length >= 2 && head?.subject.handoffId) {
      items.push({
        type: 'churn',
        handoffId: head.subject.handoffId,
        actor: head.actor,
        events: run,
      })
    } else {
      for (const e of run) items.push({ type: 'single', event: e })
    }
    run = []
  }

  for (const event of events) {
    if (event.kind === 'status' && event.subject.handoffId) {
      const prev = run[run.length - 1] // the newer neighbour (newest-first input)
      const joins =
        !prev ||
        (prev.subject.handoffId === event.subject.handoffId &&
          prev.actor.email === event.actor.email &&
          Date.parse(prev.at) - Date.parse(event.at) <= CHURN_WINDOW_MS)
      if (!joins) flush()
      run.push(event)
    } else {
      flush()
      items.push({ type: 'single', event })
    }
  }
  flush()
  return items
}

/* ── day grouping ───────────────────────────────────────────────────────── */

export interface DayGroup {
  /** ISO day key (at.slice(0, 10) — the lib's documented grouping key) */
  day: string
  items: FeedItem[]
}

/** Group chronologically-ordered feed items under day headers (order kept). */
export function groupItemsByDay(items: FeedItem[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const item of items) {
    const day = itemAt(item).slice(0, 10)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(item)
    else groups.push({ day, items: [item] })
  }
  return groups
}

export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today'
  const y = new Date(`${today}T00:00:00Z`)
  y.setUTCDate(y.getUTCDate() - 1)
  if (day === y.toISOString().slice(0, 10)) return 'Yesterday'
  return day
}

/* ── card text helpers (D1 anatomy) ─────────────────────────────────────── */

/** Relative age for the card head; the absolute ISO rides the hover title. */
export function relativeTime(at: string, nowMs: number): string {
  const minutes = Math.floor(Math.max(0, nowMs - Date.parse(at)) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** D1: mono paths middle-truncate (tail-biased — the basename matters most);
 *  the full path rides the hover title. */
export function middleTruncate(text: string, max = 48): string {
  if (text.length <= max) return text
  const tail = Math.ceil((max - 1) * 0.6)
  const head = max - 1 - tail
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}

/** `loredex: handoff <id> <from> -> <to>` → `<from> → <to>` (expanded flips). */
export function flipLabel(summary: string): string {
  const m = summary.match(/(\S+) -> (\S+)$/)
  return m ? `${m[1]} → ${m[2]}` : summary
}

/** D1: the summary renders serif ONLY when it quotes an objective. */
export function summaryQuotesObjective(summary: string): boolean {
  return /["“”]/.test(summary)
}

/* ── per-kind actions (D1: outline pills, max 2) ────────────────────────── */

export type FeedAction =
  | { id: 'open-note'; label: 'Open note'; path: string }
  | { id: 'view-card'; label: 'View card'; handoffId: string }
  | { id: 'consume'; label: 'Consume'; handoffId: string }
  | { id: 'open-sync'; label: 'Open Sync' }
  | { id: 'view-diff'; label: 'View diff'; sha: string }

export interface FeedActionCtx {
  /** the event's handoff is an open inbound board card → offer Consume */
  consumable?: boolean
  /** newest contract change linked to the event's handoff (story 11.3 links) */
  diffSha?: string | null
}

/**
 * D1 table, verbatim: route→Open note · handoff→View card + Consume (open
 * inbound) · consume/status→View card · sync→Open Sync · contract-linked→
 * View diff. Capped at 2 — View diff takes the second slot only when free.
 */
export function feedActions(event: ActivityEvent, ctx: FeedActionCtx = {}): FeedAction[] {
  const actions: FeedAction[] = []
  const handoffId = event.subject.handoffId
  if (event.kind === 'route') {
    if (event.subject.path) actions.push({ id: 'open-note', label: 'Open note', path: event.subject.path })
  } else if (event.kind === 'handoff') {
    if (handoffId) {
      actions.push({ id: 'view-card', label: 'View card', handoffId })
      if (ctx.consumable) actions.push({ id: 'consume', label: 'Consume', handoffId })
    }
  } else if (event.kind === 'consume' || event.kind === 'status') {
    if (handoffId) actions.push({ id: 'view-card', label: 'View card', handoffId })
  } else {
    actions.push({ id: 'open-sync', label: 'Open Sync' })
  }
  if (ctx.diffSha) actions.push({ id: 'view-diff', label: 'View diff', sha: ctx.diffSha })
  return actions.slice(0, 2)
}

/* ── kept from 6.2 / 14.2 ───────────────────────────────────────────────── */

/**
 * Defect 14.2-2: one commit = one event row, however many parse passes ran.
 * Keeps the first (newest-parse) event per commit hash, input order preserved.
 */
export function dedupeBySha(events: ActivityEvent[]): ActivityEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    if (seen.has(event.sha)) return false
    seen.add(event.sha)
    return true
  })
}

/* ── filtering (Activity "manage it": by kind + by person) ──────────────── */

export type ActivityKind = ActivityEvent['kind']
/** Kinds in a stable display order — the filter rail renders them in this order. */
export const ACTIVITY_KINDS: ActivityKind[] = ['handoff', 'route', 'status', 'consume', 'sync']

/** Count events per kind (unfiltered totals for the filter chips). */
export function kindCounts(events: ActivityEvent[]): Record<ActivityKind, number> {
  const counts = { handoff: 0, route: 0, status: 0, consume: 0, sync: 0 }
  for (const e of events) counts[e.kind]++
  return counts
}

export interface ActorTally {
  name: string
  email: string
  count: number
}

/** Distinct actors, most-active first, then alphabetical — for the people filter. */
export function actorTallies(events: ActivityEvent[]): ActorTally[] {
  const by = new Map<string, ActorTally>()
  for (const e of events) {
    const key = e.actor.email || e.actor.name
    const cur = by.get(key)
    if (cur) cur.count++
    else by.set(key, { name: e.actor.name, email: e.actor.email, count: 1 })
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** Filter by kind ('all' = every kind) and actor key ('all' = everyone). */
export function filterEvents(
  events: ActivityEvent[],
  kind: ActivityKind | 'all',
  actorKey: string | 'all',
): ActivityEvent[] {
  return events.filter(
    (e) =>
      (kind === 'all' || e.kind === kind) &&
      (actorKey === 'all' || (e.actor.email || e.actor.name) === actorKey),
  )
}

export type FeedTarget = { kind: 'board' } | { kind: 'note'; path: string } | { kind: 'sync' }

/**
 * Card-click navigation: handoff subjects go to the board, note subjects to
 * the reader, plain sync events to the sync panel.
 */
export function targetOf(event: ActivityEvent): FeedTarget {
  if (event.subject.handoffId) return { kind: 'board' }
  if (event.subject.path) return { kind: 'note', path: event.subject.path }
  return { kind: 'sync' }
}
