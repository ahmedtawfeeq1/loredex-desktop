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
  attentionRows,
  changesInWindow,
  churnByFile,
  isDueNow,
  oldestOpen,
  openInbound,
  pulseRows,
  requestsWaiting,
  staleBriefs,
  startOfTodayIso,
  syncTile,
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
