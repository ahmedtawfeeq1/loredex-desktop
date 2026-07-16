// @vitest-environment jsdom
/** Plan column mapping (story 26.4): pure 8.1-state → column derivation. */
import { describe, expect, it } from 'vitest'
import type { HandoffCard } from '../../../../shared/types'
import { boardColumns, columnOf } from './PlanView'

const card = (id: string, status: string, expired = false, ageDays = 0): HandoffCard =>
  ({ id, from: 'a', to: 'b', name: id, objective: '', date: '', ageDays, status, path: '', readingOrder: [], kind: 'delivery', expired }) as HandoffCard

describe('columnOf', () => {
  it('maps the 8.1 machine onto board columns', () => {
    expect(columnOf(card('x', 'open'))).toBe('triage')
    expect(columnOf(card('x', 'snoozed', true))).toBe('triage') // expired sorts with open
    expect(columnOf(card('x', 'snoozed'))).toBe('parked')
    expect(columnOf(card('x', 'accepted'))).toBe('doing')
    expect(columnOf(card('x', 'consumed'))).toBe('done')
    expect(columnOf(card('x', 'declined'))).toBe('done')
  })
})

describe('boardColumns', () => {
  it('buckets every card once; triage oldest-first', () => {
    const cols = boardColumns([card('new', 'open', false, 1), card('old', 'open', false, 7), card('p', 'snoozed'), card('d', 'consumed')])
    expect(cols.triage.map((c) => c.id)).toEqual(['old', 'new'])
    expect(cols.parked.map((c) => c.id)).toEqual(['p'])
    expect(cols.done.map((c) => c.id)).toEqual(['d'])
    expect(cols.doing).toEqual([])
  })
})
