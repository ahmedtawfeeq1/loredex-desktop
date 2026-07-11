/**
 * Home dashboard insights vs the nimbus simulation ground truth (story 15.5).
 * Dashboard/handoff payloads are built by the lib itself against the checked-in
 * nimbus vault fixture (copied from the real simulation vault); activity and
 * contract fixtures are JSON captured from the live simulation repos via the
 * lib's own parseActivity / a real numstat scan. `today` is pinned so ages and
 * windows are deterministic.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildDashboard, listHandoffs } from 'loredex'
import { describe, expect, it } from 'vitest'
import type { ActivityEvent, ContractChange, HandoffCard, SyncHealth } from '../../../../shared/types'
import {
  activityCounts,
  ageTone,
  type AttentionItem,
  attentionQueue,
  attentionRows,
  backlogSeries,
  changesInWindow,
  churnByFile,
  dailyBuckets,
  dayStringsEndingAt,
  isDueNow,
  maxNoteCount,
  oldestOpen,
  onTrackPct,
  openInbound,
  projectHealth,
  pulseRows,
  rankedPulse,
  recentActivity,
  requestsWaiting,
  severityCounts,
  staleBriefs,
  startOfTodayIso,
  syncTile,
  topRelations,
  velocity,
  velocitySeries,
  wowTrend,
} from './insights'

const VAULT = join(import.meta.dirname, '../../../../../tests/fixtures/nimbus-vault')
const TODAY = '2026-07-10'

const dash = buildDashboard(VAULT, TODAY)
const cards = listHandoffs(VAULT, { direction: 'all' }, TODAY)

const activity = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/nimbus-activity.json'), 'utf8'),
) as ActivityEvent[]
const contractChanges = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/nimbus-contract-changes.json'), 'utf8'),
) as ContractChange[]

/** Synthetic card for cases the fixture vault doesn't contain (expired snooze). */
function card(over: Partial<HandoffCard>): HandoffCard {
  return {
    id: 'x',
    name: 'x',
    from: 'a',
    to: 'b',
    objective: '',
    date: TODAY,
    ageDays: 0,
    status: 'open',
    path: `${VAULT}/projects/b/handoffs/x.md`,
    readingOrder: [],
    kind: 'delivery',
    expired: false,
    ...over,
  }
}

describe('KPI aggregation (nimbus fixture ground truth)', () => {
  it('open inbound: 10 due-now cards across 3 receiving projects', () => {
    expect(openInbound(cards)).toEqual({ open: 10, projects: 3 })
  })

  it('requests waiting: 4 open requests, consumed/accepted ones excluded', () => {
    expect(requestsWaiting(cards)).toBe(4)
  })

  it('oldest open: the 1d backend → mobile delivery, route attached', () => {
    expect(oldestOpen(cards)).toEqual({
      id: '2026-07-09-handoff-nimbus-backend-2',
      ageDays: 1,
      from: 'nimbus-backend',
      to: 'nimbus-mobile',
    })
  })

  it('oldest open is null on an empty vault', () => {
    expect(oldestOpen([])).toBeNull()
  })

  it('stale briefs: all 4 nimbus projects have no per-project brief yet', () => {
    expect(staleBriefs(dash.states)).toEqual({ attention: 4, total: 4, stale: 0, missing: 4 })
  })

  it('stale vs missing split follows the spec chip semantics', () => {
    const states = [
      { ...dash.states[0]!, briefPath: 'projects/a/Start Here - a.md', notesNewerThanBrief: 3 },
      { ...dash.states[1]!, briefPath: 'projects/b/Start Here - b.md', notesNewerThanBrief: 0 },
      { ...dash.states[2]!, briefPath: null },
    ]
    expect(staleBriefs(states)).toEqual({ attention: 2, total: 3, stale: 1, missing: 1 })
  })
})

describe('needs-attention ranking (expired first, then ageDays desc)', () => {
  it('ranks the fixture: the 1d-old open card leads, everything due-now included', () => {
    const rows = attentionRows(cards)
    expect(rows).toHaveLength(10)
    expect(rows[0]!.id).toBe('2026-07-09-handoff-nimbus-backend-2')
    expect(rows.every(isDueNow)).toBe(true)
    // never a current snooze / consumed card
    expect(rows.some((r) => r.status === 'consumed' || r.status === 'accepted')).toBe(false)
  })

  it('expired snoozes outrank older open cards', () => {
    const expired = card({ id: 'snoozed-expired', status: 'snoozed', expired: true, ageDays: 1 })
    const old = card({ id: 'old-open', ageDays: 6 })
    const fresh = card({ id: 'fresh-open', ageDays: 0 })
    const snoozedCurrent = card({ id: 'snoozed-current', status: 'snoozed', expired: false })
    const rows = attentionRows([fresh, snoozedCurrent, old, expired])
    expect(rows.map((r) => r.id)).toEqual(['snoozed-expired', 'old-open', 'fresh-open'])
  })

  it('age chips: amber at ≥2d, rust at ≥5d (resolved Q1)', () => {
    expect(ageTone(0)).toBe('quiet')
    expect(ageTone(1)).toBe('quiet')
    expect(ageTone(2)).toBe('amber')
    expect(ageTone(4)).toBe('amber')
    expect(ageTone(5)).toBe('rust')
    expect(ageTone(12)).toBe('rust')
  })
})

describe('contract churn (real nimbus-backend openapi history, 7d window)', () => {
  const now = new Date('2026-07-10T12:00:00+03:00').getTime()

  it('window keeps all 8 captured change rows (all dated 2026-07-09)', () => {
    expect(changesInWindow(contractChanges, now)).toHaveLength(8)
  })

  it('groups by file: 4 changes each, newest sha 97d4b73 carried for focus', () => {
    const rows = churnByFile(contractChanges, now)
    expect(rows.map((r) => [r.file, r.changes])).toEqual([
      ['openapi.yaml', 4],
      ['postman_collection.json', 4],
    ])
    expect(rows[0]!.project).toBe('nimbus-backend')
    expect(rows[0]!.latestSha).toBe('97d4b73311d32c94d6ea3d23784243f572d9977d')
    expect(rows[0]!.linkedHandoffs).toBe(0) // links land core-side (11.3); none captured
  })

  it('a stale window drops everything; linked handoffs count distinct ids', () => {
    const later = new Date('2026-08-01T00:00:00Z').getTime()
    expect(churnByFile(contractChanges, later)).toEqual([])
    const linked = contractChanges.map((c, i) => ({
      ...c,
      links:
        i < 3
          ? [{ handoffId: 'h1', confidence: 'mentioned' as const }]
          : i === 3
            ? [
                { handoffId: 'h1', confidence: 'heuristic' as const },
                { handoffId: 'h2', confidence: 'heuristic' as const },
              ]
            : [],
    }))
    // fixture rows alternate openapi/postman (date desc): openapi gets h1 at
    // i=0/2; postman gets h1 at i=1 and h1+h2 at i=3 → distinct ids 1 vs 2
    const openapi = churnByFile(linked, now).find((r) => r.file === 'openapi.yaml')
    expect(openapi!.linkedHandoffs).toBe(1)
    const postman = churnByFile(linked, now).find((r) => r.file === 'postman_collection.json')
    expect(postman!.linkedHandoffs).toBe(2)
  })
})

describe("today's activity (real vault git log via lib parseActivity)", () => {
  // the simulation vault's own local midnight — pinned, timezone-independent math
  const midnight = '2026-07-10T00:00:00+03:00'

  it('counts by kind since midnight match the vault git log', () => {
    const s = activityCounts(activity, midnight)
    expect(s.total).toBe(33)
    expect(s.byKind).toEqual({ handoff: 13, sync: 2, consume: 7, status: 9, route: 2 })
  })

  it('per-hour density: 24 buckets summing to the total, busiest hour 06', () => {
    const s = activityCounts(activity, midnight)
    expect(s.hours).toHaveLength(24)
    expect(s.hours.reduce((a, b) => a + b, 0)).toBe(33)
    expect(s.hours[6]).toBe(20)
    expect(s.hours[15]).toBe(2)
  })

  it('yesterday is excluded; an empty feed yields zeros', () => {
    const s = activityCounts(activity, '2026-07-11T00:00:00+03:00')
    expect(s.total).toBe(0)
    expect(activityCounts([], midnight).hours.every((h) => h === 0)).toBe(true)
  })

  it('startOfTodayIso anchors at the local midnight of the given clock', () => {
    const now = new Date(2026, 6, 10, 14, 30, 5)
    const midnightLocal = new Date(2026, 6, 10)
    expect(startOfTodayIso(now)).toBe(midnightLocal.toISOString())
  })
})

describe('14-day activity sparkline buckets (amendment 7 §A)', () => {
  it('day keys end at today, oldest→newest, exactly `days` long', () => {
    const keys = dayStringsEndingAt(TODAY, 14)
    expect(keys).toHaveLength(14)
    expect(keys[0]).toBe('2026-06-27')
    expect(keys[13]).toBe(TODAY)
    // strictly ascending
    expect([...keys].sort()).toEqual(keys)
  })

  it('buckets the real vault git log by calendar day (all 61 events land)', () => {
    const b = dailyBuckets(activity, TODAY)
    expect(b).toHaveLength(14)
    expect(b.reduce((s, d) => s + d.total, 0)).toBe(61)
    // the fixture spans two days; the older 12 are zero-filled
    const nonzero = b.filter((d) => d.total > 0)
    expect(nonzero.map((d) => [d.day, d.total])).toEqual([
      ['2026-07-09', 28],
      ['2026-07-10', 33],
    ])
    const today = b[13]!
    expect(today.day).toBe(TODAY)
    expect(today.byKind).toEqual({ handoff: 13, sync: 2, consume: 7, status: 9, route: 2 })
  })

  it('an empty feed still yields 14 zero buckets (no crash on fresh vault)', () => {
    const b = dailyBuckets([], TODAY, 14)
    expect(b).toHaveLength(14)
    expect(b.every((d) => d.total === 0)).toBe(true)
  })
})

describe('velocity strip: created vs consumed, 7-day window', () => {
  it('counts handoff-created and consumed events from the vault log', () => {
    // all fixture events fall inside the 7d window ending TODAY
    expect(velocity(activity, TODAY, 10)).toEqual({ created: 21, consumed: 12, open: 10 })
  })

  it('the open count is a snapshot passed through, not derived from the feed', () => {
    expect(velocity(activity, TODAY, 0).open).toBe(0)
    expect(velocity([], TODAY, 5)).toEqual({ created: 0, consumed: 0, open: 5 })
  })
})

describe('week-over-week trend (this window vs the one before)', () => {
  it('all fixture activity is this week; last week is empty → up', () => {
    expect(wowTrend(activity, TODAY, 'handoff')).toEqual({
      current: 21,
      previous: 0,
      delta: 21,
      direction: 'up',
    })
    expect(wowTrend(activity, TODAY, 'consume')).toEqual({
      current: 12,
      previous: 0,
      delta: 12,
      direction: 'up',
    })
  })

  it('anchoring a week later pushes the same events into last week → down', () => {
    // anchor 07-17: current window 07-11..07-17 (empty), previous 07-04..07-10
    // holds every fixture handoff → the trend reads as declining
    const t = wowTrend(activity, '2026-07-17', 'handoff')
    expect(t.current).toBe(0)
    expect(t.previous).toBe(21)
    expect(t.direction).toBe('down')
  })

  it('flat when both windows are empty', () => {
    expect(wowTrend([], TODAY, 'handoff')).toEqual({
      current: 0,
      previous: 0,
      delta: 0,
      direction: 'flat',
    })
  })
})

describe('ranked project pulse (busiest open-flow first)', () => {
  it('reorders the fixture states by open flow, then size, then name', () => {
    const ranked = rankedPulse(dash.states, cards)
    // same rows as pulseRows, only reordered
    expect(new Set(ranked.map((r) => r.project))).toEqual(
      new Set(pulseRows(dash.states, cards).map((r) => r.project)),
    )
    // flow desc: each row's open-flow ≥ the next
    const flow = ranked.map((r) => r.openIn + r.openOut)
    expect([...flow].sort((a, b) => b - a)).toEqual(flow)
    // nimbus-backend carries the most flow (5 in + 5 out) → leads
    expect(ranked[0]!.project).toBe('nimbus-backend')
  })

  it('maxNoteCount is the bar denominator and never below 1', () => {
    expect(maxNoteCount(rankedPulse(dash.states, cards))).toBe(18)
    expect(maxNoteCount([])).toBe(1)
  })
})

describe('sync tile states (spec §3 degraded row)', () => {
  const base: SyncHealth = {
    state: 'ok',
    branch: 'main',
    canonicalBranch: 'main',
    branchMatches: true,
    remote: 'origin',
    remoteReachable: true,
    ahead: 0,
    behind: 0,
    mergeDriverInstalled: true,
    gitattributesValid: true,
    lastPull: null,
    lastPush: '2026-07-10T02:48:00+03:00',
    warnings: [],
  }

  it('in sync: check glyph + pushed clock', () => {
    const tile = syncTile(base)
    expect(tile.value).toBe('✓')
    expect(tile.tone).toBe('ok')
    expect(tile.caption).toMatch(/^pushed \d{2}:\d{2}$/)
    expect(tile.localOnly).toBe(false)
  })

  it('no remote: local-only tile carries the wire-a-remote affordance', () => {
    const tile = syncTile({ ...base, remote: null, remoteReachable: false })
    expect(tile).toEqual({
      value: '—',
      caption: 'local-only · no remote',
      tone: 'off',
      localOnly: true,
    })
  })

  it('ahead/behind warns with counts; error goes rust; null is quiet', () => {
    expect(syncTile({ ...base, state: 'ahead', ahead: 2 })).toMatchObject({
      value: '↑',
      caption: '2 ahead',
      tone: 'warn',
    })
    expect(syncTile({ ...base, state: 'diverged', ahead: 1, behind: 3 })).toMatchObject({
      value: '±',
      caption: '1 ahead · 3 behind',
    })
    expect(syncTile({ ...base, state: 'error' }).tone).toBe('err')
    expect(syncTile(null).tone).toBe('off')
  })
})

describe('project pulse rows (dashboard.build + open cards)', () => {
  it('folds the fixture states with per-project open in/out counts', () => {
    const rows = pulseRows(dash.states, cards)
    expect(rows.map((r) => r.project)).toEqual([
      'nimbus-ai-engine',
      'nimbus-backend',
      'nimbus-frontend',
      'nimbus-mobile',
    ])
    const backend = rows.find((r) => r.project === 'nimbus-backend')!
    expect(backend.noteCount).toBe(18)
    expect(backend.lastDate).toBe('2026-07-10')
    expect(backend.openIn).toBe(5)
    expect(backend.openOut).toBe(5)
    expect(backend.brief).toBe('none')
    expect(backend.topics).toContain('channels')
  })

  it('brief chip: stale when newer notes exist, fresh when none', () => {
    const s = { ...dash.states[0]!, briefPath: 'x.md', notesNewerThanBrief: 2 }
    expect(pulseRows([s], [])[0]!.brief).toBe('stale')
    expect(pulseRows([{ ...s, notesNewerThanBrief: 0 }], [])[0]!.brief).toBe('fresh')
  })
})

// ── amendment 9: modern dashboard aggregations ──────────────────────────────

describe('velocity series ↔ velocity summary (amendment 9)', () => {
  it('per-day created/consumed sums equal the scalar velocity, 7-day window', () => {
    const series = velocitySeries(activity, TODAY, 7)
    expect(series).toHaveLength(7)
    const sum = series.reduce(
      (a, d) => ({ c: a.c + d.created, x: a.x + d.consumed }),
      { c: 0, x: 0 },
    )
    const vel = velocity(activity, TODAY, 10)
    expect(sum.c).toBe(vel.created)
    expect(sum.x).toBe(vel.consumed)
    expect(sum).toEqual({ c: 21, x: 12 })
  })

  it('each series day matches the dailyBuckets kind counts', () => {
    const series = velocitySeries(activity, TODAY, 14)
    const buckets = dailyBuckets(activity, TODAY, 14)
    series.forEach((d, i) => {
      expect(d.day).toBe(buckets[i]!.day)
      expect(d.created).toBe(buckets[i]!.byKind.handoff ?? 0)
      expect(d.consumed).toBe(buckets[i]!.byKind.consume ?? 0)
    })
  })
})

describe('backlog series (open-handoff trend, reconstructed from the snapshot)', () => {
  it('newest point equals the current open snapshot; reconstructs the real vault trend', () => {
    const series = backlogSeries(activity, TODAY, 10, 7)
    expect(series).toHaveLength(7)
    expect(series.at(-1)!.value).toBe(10) // ends at openNow
    expect(series.map((p) => p.value)).toEqual([1, 1, 1, 1, 1, 4, 10])
    expect(series.every((p) => p.value >= 0)).toBe(true)
  })

  it('each step back removes that day’s net (created − consumed), clamped at 0', () => {
    const events = activity
    const days = 7
    const series = backlogSeries(events, TODAY, 10, days)
    const vel = velocitySeries(events, TODAY, days)
    for (let i = series.length - 1; i > 0; i--) {
      const net = vel[i]!.created - vel[i]!.consumed
      // prior day's backlog = this day's − net (unless a clamp intervened)
      if (series[i]!.value - net >= 0) {
        expect(series[i - 1]!.value).toBe(series[i]!.value - net)
      }
    }
  })

  it('an empty feed holds the snapshot flat across the window', () => {
    expect(backlogSeries([], TODAY, 3, 5).map((p) => p.value)).toEqual([3, 3, 3, 3, 3])
  })
})

describe('on-track %', () => {
  it('consumed share of the outstanding work, nothing outstanding = 100%', () => {
    expect(onTrackPct(12, 10)).toBe(55)
    expect(onTrackPct(0, 0)).toBe(100)
    expect(onTrackPct(5, 0)).toBe(100)
    expect(onTrackPct(0, 5)).toBe(0)
  })
})

describe('attention queue (severity-ranked, the project-status insight)', () => {
  it('the fixture has no overdue/stale rows — 4 waiting requests + a done summary, all info', () => {
    const q = attentionQueue(cards, dash.states)
    expect(q).toHaveLength(5)
    expect(severityCounts(q)).toEqual({ critical: 0, warning: 0, info: 5 })
    expect(q.filter((i) => i.reason.startsWith('request waiting'))).toHaveLength(4)
    expect(q.at(-1)!.key).toBe('done') // the summary sorts last (ageDays -1)
    expect(q.at(-1)!.title).toBe('9 handoffs already consumed')
  })

  it('ranks critical → warning → info, then age desc; a card appears once at its top severity', () => {
    const overdue = card({ id: 'overdue', to: 'b', ageDays: 6, kind: 'delivery' })
    const olderCrit = card({ id: 'older', to: 'b', ageDays: 9, kind: 'delivery' })
    const expired = card({ id: 'snz', to: 'b', status: 'snoozed', expired: true, ageDays: 3 })
    // a request that is ALSO overdue must land critical, not info (single row)
    const oldReq = card({ id: 'oldreq', to: 'b', kind: 'request', ageDays: 7 })
    const staleBriefState = { ...dash.states[0]!, briefPath: 'x.md', notesNewerThanBrief: 4 }
    const q = attentionQueue([overdue, olderCrit, expired, oldReq], [staleBriefState])
    const sevSeq = q.map((i) => i.severity)
    // severities are grouped in rank order
    expect(sevSeq).toEqual([...sevSeq].sort((a, b) => rank(a) - rank(b)))
    // three criticals (all ≥5d), oldest first (ageDays desc: 9, 7, 6)
    const crit = q.filter((i) => i.severity === 'critical')
    expect(crit.map((i) => i.cardId)).toEqual(['older', 'oldreq', 'overdue'])
    // the overdue request is NOT also an info row
    expect(q.filter((i) => i.cardId === 'oldreq')).toHaveLength(1)
    // warnings: the expired snooze + the stale brief
    const warn = q.filter((i) => i.severity === 'warning')
    expect(warn).toHaveLength(2)
    expect(warn.map((w) => w.action.kind).sort()).toEqual(['recurate', 'reopen'])
  })

  it('expired snoozes are warnings with a Reopen action', () => {
    const expired = card({ id: 'snz', status: 'snoozed', expired: true, ageDays: 2 })
    const q = attentionQueue([expired], [])
    expect(q).toHaveLength(1)
    expect(q[0]!).toMatchObject({ severity: 'warning', action: { kind: 'reopen' } })
  })
})

describe('per-project health (utilization = open / total handoffs)', () => {
  it('folds the fixture: busiest-flow first, real open/total ratios', () => {
    const rows = projectHealth(dash.states, cards)
    expect(rows[0]!.project).toBe('nimbus-backend')
    const backend = rows.find((r) => r.project === 'nimbus-backend')!
    expect(backend.openTotal).toBe(10)
    expect(backend.total).toBe(19)
    expect(backend.utilization).toBeCloseTo(10 / 19)
    const ai = rows.find((r) => r.project === 'nimbus-ai-engine')!
    expect(ai.openTotal).toBe(1)
    expect(ai.total).toBe(5)
    expect(ai.utilization).toBeCloseTo(0.2)
  })

  it('a project with no handoffs has zero utilization, never NaN', () => {
    const lonely = { ...dash.states[0]!, project: 'ghost' }
    const row = projectHealth([lonely], [])[0]!
    expect(row.total).toBe(0)
    expect(row.utilization).toBe(0)
  })
})

describe('relations strip (who hands off to whom)', () => {
  it('ranks the dashboard edges busiest-first and caps the strip', () => {
    const rel = topRelations(dash.edges)
    expect(rel).toHaveLength(6) // 7 edges → capped at 6
    expect(rel[0]).toEqual({ from: 'nimbus-frontend', to: 'nimbus-backend', count: 9 })
    expect(rel[1]).toEqual({ from: 'nimbus-mobile', to: 'nimbus-backend', count: 7 })
    const counts = rel.map((r) => r.count)
    expect([...counts].sort((a, b) => b - a)).toEqual(counts)
  })

  it('drops zero-count edges and respects the limit', () => {
    const edges = [
      { from: 'a', to: 'b', count: 3 },
      { from: 'c', to: 'd', count: 0 },
      { from: 'e', to: 'f', count: 5 },
    ]
    expect(topRelations(edges, 1)).toEqual([{ from: 'e', to: 'f', count: 5 }])
    expect(topRelations(edges).map((r) => r.count)).toEqual([5, 3])
  })
})

describe('recent activity rail', () => {
  it('returns newest-first, capped at the limit', () => {
    const r = recentActivity(activity, 3)
    expect(r).toHaveLength(3)
    expect(r[0]!.at).toBe('2026-07-10T15:56:43+03:00')
    // strictly non-increasing timestamps
    for (let i = 1; i < r.length; i++) expect(r[i]!.at <= r[i - 1]!.at).toBe(true)
  })
})

function rank(s: AttentionItem['severity']): number {
  return s === 'critical' ? 0 : s === 'warning' ? 1 : 2
}
