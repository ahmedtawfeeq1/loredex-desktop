/** Story 6.2: day grouping, day labels, navigation mapping.
 *  Story 14.2: dedupe-by-commit-hash pin.
 *  Story 16.6 (D1 "Activity cards"): status-churn collapse on the REAL nimbus
 *  fixture, per-kind action descriptors, card text helpers. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ActivityEvent } from '../../../../shared/types'
import {
  actorTallies,
  collapseChurn,
  dayLabel,
  dedupeBySha,
  feedActions,
  filterEvents,
  flipLabel,
  groupItemsByDay,
  itemAt,
  kindCounts,
  middleTruncate,
  relativeTime,
  summaryQuotesObjective,
  targetOf,
} from './feed-logic'

const event = (over: Partial<ActivityEvent>): ActivityEvent => ({
  kind: 'sync',
  actor: { name: 'Maya Chen', email: 'maya@nimbus.dev' },
  at: '2026-07-09T10:00:00+02:00',
  subject: {},
  summary: 'sync',
  sha: Math.random().toString(16).slice(2),
  ...over,
})

/** A status flip in the lib's commit grammar. */
const flip = ({
  id,
  move,
  ...over
}: Partial<ActivityEvent> & { id: string; move: string }): ActivityEvent =>
  event({
    kind: 'status',
    subject: { handoffId: id, path: `projects/x/handoffs/${id}.md` },
    summary: `loredex: handoff ${id} ${move}`,
    ...over,
  })

/* ── churn collapse on the REAL vault history (D1 fixture requirement) ──── */

// The parsed activity of the nimbus simulation vault's git log (same capture
// home insights runs on) — it contains the user-reported churn sequence.
const nimbus = JSON.parse(
  readFileSync(join(import.meta.dirname, '../home/fixtures/nimbus-activity.json'), 'utf8'),
) as ActivityEvent[]

describe('collapseChurn on the real nimbus git log', () => {
  const items = collapseChurn(nimbus)
  const churns = items.filter((i) => i.type === 'churn')

  it('collapses the reported 5-flip run on …-frontend-4 into ONE ×5 card', () => {
    const run = churns.find((c) => c.handoffId === '2026-07-10-handoff-nimbus-frontend-4')
    expect(run).toBeDefined()
    expect(run?.events).toHaveLength(5)
    expect(run?.actor.name).toBe('Rae Ito')
    // newest-first, exactly the vault's commit sequence 06:42:23 → 06:42:37
    expect(run?.events.map((e) => e.sha.slice(0, 7))).toEqual([
      '5297541', // open -> accepted
      '75c9231', // declined -> open
      '08eea69', // open -> declined
      'a9c7b78', // snoozed -> open
      'ee0337e', // open -> snoozed
    ])
  })

  it('collapses the ai-engine-2 snooze/unsnooze pair; exactly two churn cards total', () => {
    const pair = churns.find((c) => c.handoffId === '2026-07-10-handoff-nimbus-ai-engine-2')
    expect(pair?.events.map((e) => e.sha.slice(0, 7))).toEqual(['f6e4683', '4980333'])
    expect(churns).toHaveLength(2)
  })

  it('lone flips stay ordinary cards (frontend-3 accept, ai-engine accept)', () => {
    const singleShas = items
      .filter((i) => i.type === 'single' && i.event.kind === 'status')
      .map((i) => (i.type === 'single' ? i.event.sha.slice(0, 7) : ''))
    expect(singleShas).toContain('9d4d230') // neighbours are handoff creates
    expect(singleShas).toContain('5961d16') // separated by non-status commits
  })

  it('keeps every event exactly once, feed order preserved', () => {
    const flattened = items.flatMap((i) => (i.type === 'single' ? [i.event] : i.events))
    expect(flattened.map((e) => e.sha)).toEqual(nimbus.map((e) => e.sha))
    // 61 events, two runs (5 + 2) → 61 - 4 - 1 items
    expect(items).toHaveLength(nimbus.length - 5)
  })
})

describe('collapseChurn edges (synthetic)', () => {
  it('a gap over 10 minutes splits the run', () => {
    const events = [
      flip({ id: 'h1', move: 'snoozed -> open', at: '2026-07-10T10:20:01+02:00' }),
      flip({ id: 'h1', move: 'open -> snoozed', at: '2026-07-10T10:09:00+02:00' }),
    ]
    expect(collapseChurn(events).map((i) => i.type)).toEqual(['single', 'single'])
  })

  it('a gap of exactly 10 minutes still collapses', () => {
    const events = [
      flip({ id: 'h1', move: 'snoozed -> open', at: '2026-07-10T10:19:00+02:00' }),
      flip({ id: 'h1', move: 'open -> snoozed', at: '2026-07-10T10:09:00+02:00' }),
    ]
    expect(collapseChurn(events).map((i) => i.type)).toEqual(['churn'])
  })

  it('a different actor or handoff splits the run', () => {
    const events = [
      flip({ id: 'h1', move: 'open -> declined', at: '2026-07-10T10:02:00+02:00' }),
      flip({
        id: 'h1',
        move: 'open -> snoozed',
        at: '2026-07-10T10:01:00+02:00',
        actor: { name: 'Rae Ito', email: 'rae@nimbus.dev' },
      }),
      flip({ id: 'h2', move: 'open -> accepted', at: '2026-07-10T10:00:00+02:00' }),
    ]
    expect(collapseChurn(events).map((i) => i.type)).toEqual(['single', 'single', 'single'])
  })

  it('any other event kind breaks the run (consecutive means consecutive)', () => {
    const events = [
      flip({ id: 'h1', move: 'snoozed -> open', at: '2026-07-10T10:02:00+02:00' }),
      event({ kind: 'route', at: '2026-07-10T10:01:30+02:00', subject: { path: 'projects/x/n.md' } }),
      flip({ id: 'h1', move: 'open -> snoozed', at: '2026-07-10T10:01:00+02:00' }),
    ]
    expect(collapseChurn(events).map((i) => i.type)).toEqual(['single', 'single', 'single'])
  })
})

/* ── per-kind actions (D1 table + wiring targets, AC4/AC5) ──────────────── */

describe('feedActions — the D1 per-kind table, descriptors carry the target', () => {
  it('route → Open note on the routed path', () => {
    const e = event({ kind: 'route', subject: { path: 'projects/api/notes/x.md' } })
    expect(feedActions(e)).toEqual([
      { id: 'open-note', label: 'Open note', path: 'projects/api/notes/x.md' },
    ])
  })

  it('handoff → View card; plus Consume when the board card is open inbound', () => {
    const e = event({ kind: 'handoff', subject: { handoffId: 'h1', path: 'p/h/h1.md' } })
    expect(feedActions(e)).toEqual([{ id: 'view-card', label: 'View card', handoffId: 'h1' }])
    expect(feedActions(e, { consumable: true })).toEqual([
      { id: 'view-card', label: 'View card', handoffId: 'h1' },
      { id: 'consume', label: 'Consume', handoffId: 'h1' },
    ])
  })

  it('consume and status → View card', () => {
    for (const kind of ['consume', 'status'] as const) {
      const e = event({ kind, subject: { handoffId: 'h1' } })
      expect(feedActions(e)).toEqual([{ id: 'view-card', label: 'View card', handoffId: 'h1' }])
    }
  })

  it('sync → Open Sync', () => {
    expect(feedActions(event({ kind: 'sync' }))).toEqual([{ id: 'open-sync', label: 'Open Sync' }])
  })

  it('contract-linked → View diff on the linked change, capped at 2 pills', () => {
    const status = event({ kind: 'status', subject: { handoffId: 'h1' } })
    expect(feedActions(status, { diffSha: 'abc1234' })).toEqual([
      { id: 'view-card', label: 'View card', handoffId: 'h1' },
      { id: 'view-diff', label: 'View diff', sha: 'abc1234' },
    ])
    // an open inbound handoff already offers 2 — the cap drops View diff
    const handoff = event({ kind: 'handoff', subject: { handoffId: 'h1' } })
    const capped = feedActions(handoff, { consumable: true, diffSha: 'abc1234' })
    expect(capped).toHaveLength(2)
    expect(capped.map((a) => a.id)).toEqual(['view-card', 'consume'])
  })
})

/* ── card text helpers (D1 anatomy) ─────────────────────────────────────── */

describe('relativeTime (absolute rides the hover title)', () => {
  const now = Date.parse('2026-07-10T12:00:00Z')
  it('minutes, hours, days', () => {
    expect(relativeTime('2026-07-10T11:59:40Z', now)).toBe('just now')
    expect(relativeTime('2026-07-10T11:45:00Z', now)).toBe('15m ago')
    expect(relativeTime('2026-07-10T09:00:00Z', now)).toBe('3h ago')
    expect(relativeTime('2026-07-07T12:00:00Z', now)).toBe('3d ago')
  })
})

describe('middleTruncate (mono paths: head…tail, tail-biased)', () => {
  it('short paths pass through untouched', () => {
    expect(middleTruncate('projects/x/n.md')).toBe('projects/x/n.md')
  })
  it('long paths keep the basename end and honor the budget', () => {
    const long = 'projects/nimbus-backend/handoffs/2026-07-10-handoff-nimbus-frontend-4.md'
    const cut = middleTruncate(long)
    expect(cut.length).toBeLessThanOrEqual(48)
    expect(cut).toContain('…')
    expect(cut.endsWith('handoff-nimbus-frontend-4.md')).toBe(true)
    expect(cut.startsWith('projects/')).toBe(true)
  })
})

describe('flipLabel (expanded churn rows)', () => {
  it('extracts from → to out of the status grammar', () => {
    expect(flipLabel('loredex: handoff h-4 open -> snoozed')).toBe('open → snoozed')
  })
  it('falls back to the raw summary when nothing matches', () => {
    expect(flipLabel('seed vault')).toBe('seed vault')
  })
})

describe('summaryQuotesObjective (serif only when quoting)', () => {
  it('quotes → serif; plain grammar lines → sans', () => {
    expect(summaryQuotesObjective('handoff "ship the API v2 contract"')).toBe(true)
    expect(summaryQuotesObjective('loredex: route 2 note(s)')).toBe(false)
  })
})

/* ── day grouping over feed items ───────────────────────────────────────── */

describe('groupItemsByDay', () => {
  it('splits on the ISO day key across midnight, keeping input order', () => {
    const items = collapseChurn([
      event({ at: '2026-07-09T23:59:00+02:00', summary: 'late' }),
      event({ at: '2026-07-09T00:01:00+02:00', summary: 'early' }),
      event({ at: '2026-07-08T23:58:00+02:00', summary: 'prev' }),
    ])
    const groups = groupItemsByDay(items)
    expect(groups.map((g) => g.day)).toEqual(['2026-07-09', '2026-07-08'])
    expect(groups[0]?.items).toHaveLength(2)
  })
  it('a churn card sits on its newest flip’s day (author-local key, lib contract)', () => {
    const items = collapseChurn([
      flip({ id: 'h1', move: 'snoozed -> open', at: '2026-07-09T00:04:00+09:00' }),
      flip({ id: 'h1', move: 'open -> snoozed', at: '2026-07-08T23:58:00+09:00' }),
    ])
    expect(items[0]?.type).toBe('churn')
    expect(items[0] && itemAt(items[0])).toBe('2026-07-09T00:04:00+09:00')
    expect(groupItemsByDay(items).map((g) => g.day)).toEqual(['2026-07-09'])
  })
})

describe('dayLabel', () => {
  it('labels today/yesterday relative to the given today, dates otherwise', () => {
    expect(dayLabel('2026-07-09', '2026-07-09')).toBe('Today')
    expect(dayLabel('2026-07-08', '2026-07-09')).toBe('Yesterday')
    expect(dayLabel('2026-07-01', '2026-07-09')).toBe('2026-07-01')
    // month boundary
    expect(dayLabel('2026-06-30', '2026-07-01')).toBe('Yesterday')
  })
})

/* ── pins kept from 6.2 / 14.2 ──────────────────────────────────────────── */

describe('dedupeBySha (defect 14.2-2: one commit = one event row)', () => {
  it('collapses 3 raw events for the same commit into 1 row, keeping the first', () => {
    const events = [
      event({ sha: 'abc1234', summary: 'first pass' }),
      event({ sha: 'abc1234', summary: 'second pass' }),
      event({ sha: 'abc1234', summary: 'third pass' }),
    ]
    const rows = dedupeBySha(events)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.summary).toBe('first pass')
  })
  it('keeps distinct commits in input order', () => {
    const events = [
      event({ sha: 'aaa', summary: 'a' }),
      event({ sha: 'bbb', summary: 'b' }),
      event({ sha: 'aaa', summary: 'a again' }),
      event({ sha: 'ccc', summary: 'c' }),
    ]
    expect(dedupeBySha(events).map((e) => e.sha)).toEqual(['aaa', 'bbb', 'ccc'])
  })
  it('passes an already-unique feed through untouched', () => {
    const events = [event({ sha: 'a' }), event({ sha: 'b' })]
    expect(dedupeBySha(events)).toEqual(events)
  })
})

describe('targetOf (card click)', () => {
  it('handoff subjects → board, note paths → reader, bare sync → sync panel', () => {
    expect(targetOf(event({ subject: { handoffId: 'h-1', path: 'projects/x/h.md' } }))).toEqual({
      kind: 'board',
    })
    expect(targetOf(event({ subject: { path: 'projects/x/note.md' } }))).toEqual({
      kind: 'note',
      path: 'projects/x/note.md',
    })
    expect(targetOf(event({ subject: {} }))).toEqual({ kind: 'sync' })
  })
})

describe('filtering (Activity manage-it)', () => {
  const evs = [
    event({ kind: 'handoff', actor: { name: 'Maya Chen', email: 'maya@nimbus.dev' } }),
    event({ kind: 'route', actor: { name: 'Rae Ito', email: 'rae@nimbus.dev' } }),
    event({ kind: 'route', actor: { name: 'Maya Chen', email: 'maya@nimbus.dev' } }),
    event({ kind: 'sync', actor: { name: 'Maya Chen', email: 'maya@nimbus.dev' } }),
  ]
  it('counts per kind', () => {
    expect(kindCounts(evs)).toEqual({ handoff: 1, route: 2, status: 0, consume: 0, sync: 1 })
  })
  it('tallies actors most-active first', () => {
    const t = actorTallies(evs)
    expect(t.map((a) => [a.name, a.count])).toEqual([
      ['Maya Chen', 3],
      ['Rae Ito', 1],
    ])
  })
  it('filters by kind and by actor, and "all" passes everything', () => {
    expect(filterEvents(evs, 'route', 'all')).toHaveLength(2)
    expect(filterEvents(evs, 'all', 'maya@nimbus.dev')).toHaveLength(3)
    expect(filterEvents(evs, 'route', 'maya@nimbus.dev')).toHaveLength(1)
    expect(filterEvents(evs, 'all', 'all')).toHaveLength(4)
  })
})
