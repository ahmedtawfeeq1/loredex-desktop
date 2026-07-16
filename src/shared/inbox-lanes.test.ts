import { describe, expect, it } from 'vitest'
import type { HandoffCard } from './types'
import { laneCards } from './handoff-lanes'

const card = (id: string, from: string, to: string): HandoffCard =>
  ({ id, from, to, name: id, objective: '', date: '', ageDays: 0, status: 'open', path: '', readingOrder: [], kind: 'delivery', expired: false }) as HandoffCard

const cards = [card('a', 'be', 'fe'), card('b', 'fe', 'be'), card('c', 'be', 'ai')]

describe('v3 Inbox lanes (story 26.3)', () => {
  it('For me = inbound to the scoped project', () => {
    expect(laneCards(cards, 'forme', 'fe').map((c) => c.id)).toEqual(['a'])
  })
  it('Created = outbound from the scoped project', () => {
    expect(laneCards(cards, 'created', 'be').map((c) => c.id)).toEqual(['a', 'c'])
  })
  it('All = both directions; all-projects scope passes everything', () => {
    expect(laneCards(cards, 'all', 'be').map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(laneCards(cards, 'forme', 'all')).toHaveLength(3)
  })
})
