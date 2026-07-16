// @vitest-environment jsdom
/** Today's pure derivations (story 26.3): queue ranking + feed strips. */
import { describe, expect, it } from 'vitest'
import type { ActivityEvent, HandoffCard } from '../../../../shared/types'
import { latestByActor, needsYou, newKnowledge } from './TodayView'

const card = (id: string, status: string, ageDays: number, expired = false): HandoffCard =>
  ({ id, from: 'a', to: 'b', name: id, objective: '', date: '', ageDays, status, path: '', readingOrder: [], kind: 'delivery', expired }) as HandoffCard

const ev = (kind: ActivityEvent['kind'], name: string, path?: string): ActivityEvent =>
  ({ kind, actor: { name, email: '' }, at: '2026-07-16T10:00:00Z', subject: path ? { path } : {}, summary: `${kind} by ${name}`, sha: Math.random().toString(16).slice(2) }) as ActivityEvent

describe('needsYou', () => {
  it('due-now only (open or expired snooze), oldest first', () => {
    const q = needsYou([card('fresh', 'open', 1), card('old', 'open', 6), card('done', 'consumed', 9), card('exp', 'snoozed', 3, true), card('snz', 'snoozed', 8)])
    expect(q.map((c) => c.id)).toEqual(['old', 'exp', 'fresh'])
  })
})

describe('latestByActor', () => {
  it('one row per actor, newest first, sync events skipped', () => {
    const rows = latestByActor([ev('sync', 'bot'), ev('route', 'claude'), ev('handoff', 'claude'), ev('consume', 'codex')], 4)
    expect(rows.map((r) => r.actor.name)).toEqual(['claude', 'codex'])
    expect(rows[0]?.kind).toBe('route')
  })
})

describe('newKnowledge', () => {
  it('route events with paths, deduped by path, capped', () => {
    const rows = newKnowledge([ev('route', 'x', 'p/one.md'), ev('route', 'y', 'p/one.md'), ev('consume', 'x', 'p/two.md'), ev('route', 'z', 'p/three.md')], 5)
    expect(rows.map((r) => r.subject.path)).toEqual(['p/one.md', 'p/three.md'])
  })
})
