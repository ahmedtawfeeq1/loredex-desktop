/** Story 6.2: day grouping, day labels, avatar determinism, navigation mapping. */
import { describe, expect, it } from 'vitest'
import type { ActivityEvent } from '../../../../shared/types'
import { dayLabel, groupByDay, initials, targetOf } from './feed-logic'

const event = (over: Partial<ActivityEvent>): ActivityEvent => ({
  kind: 'sync',
  actor: { name: 'Maya Chen', email: 'maya@nimbus.dev' },
  at: '2026-07-09T10:00:00+02:00',
  subject: {},
  summary: 'sync',
  sha: Math.random().toString(16).slice(2),
  ...over,
})

describe('groupByDay', () => {
  it('splits on the ISO day key across midnight, keeping input order', () => {
    const events = [
      event({ at: '2026-07-09T23:59:00+02:00', summary: 'late' }),
      event({ at: '2026-07-09T00:01:00+02:00', summary: 'early' }),
      event({ at: '2026-07-08T23:58:00+02:00', summary: 'prev' }),
    ]
    const groups = groupByDay(events)
    expect(groups.map((g) => g.day)).toEqual(['2026-07-09', '2026-07-08'])
    expect(groups[0]?.events.map((e) => e.summary)).toEqual(['late', 'early'])
  })
  it('groups by the author-local day encoded in the ISO string (lib contract)', () => {
    // 2026-07-09T01:00+09:00 is still keyed 2026-07-09 — slice(0,10), no TZ re-math
    expect(groupByDay([event({ at: '2026-07-09T01:00:00+09:00' })])[0]?.day).toBe('2026-07-09')
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

describe('initials', () => {
  it('is deterministic: first + last word initials, uppercased', () => {
    expect(initials('Maya Chen')).toBe('MC')
    expect(initials('maya chen')).toBe('MC')
    expect(initials('Maya de la Chen')).toBe('MC')
    expect(initials('maya')).toBe('M')
    expect(initials('  ')).toBe('?')
  })
})

describe('targetOf', () => {
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
