/**
 * Story 8.1 unit tests: action-gating matrix (all five states, both lanes),
 * snooze-date boundaries, and the attribution history lines.
 */
import { describe, expect, it } from 'vitest'
import { actionsFor } from '../../../../shared/handoff-lanes'
import { TRANSITION_TITLE, transitionProblem } from '../../stores/handoffs'
import {
  addDays,
  attributionLines,
  localDay,
  minSnoozeDate,
  snoozeProblem,
  snoozeQuickOptions,
} from './lifecycle'

describe('action gating (AC1: state-legal actions only, recipient lanes only)', () => {
  it('matches the v2 state machine for every state', () => {
    expect(actionsFor({ status: 'open' }, true)).toEqual(['accept', 'decline', 'snooze'])
    expect(actionsFor({ status: 'accepted' }, true)).toEqual(['consume'])
    expect(actionsFor({ status: 'declined' }, true)).toEqual(['reopen'])
    expect(actionsFor({ status: 'snoozed' }, true)).toEqual(['reopen'])
    expect(actionsFor({ status: 'consumed' }, true)).toEqual([]) // terminal
  })

  it('offers nothing on outbound lanes (lifecycle verbs are the recipient’s)', () => {
    for (const status of ['open', 'accepted', 'declined', 'snoozed', 'consumed']) {
      expect(actionsFor({ status }, false)).toEqual([])
    }
  })

  it('degrades unknown statuses (newer schema) to no actions, never a crash', () => {
    expect(actionsFor({ status: 'escalated' }, true)).toEqual([])
  })
})

describe('snooze dates (AC2: YYYY-MM-DD, min tomorrow)', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-07-09', 7)).toBe('2026-07-16')
  })

  it('rejects today and yesterday, accepts tomorrow', () => {
    const today = '2026-07-10'
    expect(minSnoozeDate(today)).toBe('2026-07-11')
    expect(snoozeProblem('2026-07-09', today)).not.toBeNull()
    expect(snoozeProblem('2026-07-10', today)).not.toBeNull()
    expect(snoozeProblem('2026-07-11', today)).toBeNull()
    expect(snoozeProblem('not-a-date', today)).toBe('Pick a date (YYYY-MM-DD).')
  })

  it('quick options are tomorrow and next week', () => {
    expect(snoozeQuickOptions('2026-07-10')).toEqual([
      { label: 'Tomorrow', until: '2026-07-11' },
      { label: 'Next week', until: '2026-07-17' },
    ])
  })

  it('localDay formats a real date', () => {
    expect(localDay(new Date(2026, 6, 10))).toBe('2026-07-10')
  })
})

describe('receipt toast vocabulary (AC5)', () => {
  it('titles every transition', () => {
    expect(TRANSITION_TITLE.accepted).toBe('Handoff accepted')
    expect(TRANSITION_TITLE.declined).toBe('Handoff declined')
    expect(TRANSITION_TITLE.snoozed).toBe('Handoff snoozed')
    expect(TRANSITION_TITLE.open).toBe('Handoff reopened')
  })

  it('renders illegal-transition envelopes actionably', () => {
    expect(transitionProblem('ILLEGAL_TRANSITION', 'cannot accept a consumed handoff')).toContain(
      'transitioned it first',
    )
    expect(transitionProblem('UNKNOWN_HANDOFF', 'no such note')).toContain('refresh the board')
    expect(transitionProblem('GIT_FAILED', 'push rejected')).toBe('GIT_FAILED: push rejected')
  })
})

describe('attribution history (reopen keeps decline/accept fields)', () => {
  it('renders lifecycle order with the decline reason quoted', () => {
    const lines = attributionLines({
      accepted_by: 'Ana <a@x.dev>',
      accepted_at: '2026-07-08T10:00:00Z',
      declined_by: 'Ana <a@x.dev>',
      declined_at: '2026-07-09T10:00:00Z',
      declined_reason: 'superseded',
      status: 'open',
    })
    expect(lines).toEqual([
      'accepted by Ana <a@x.dev> · 2026-07-08',
      'declined by Ana <a@x.dev> · 2026-07-09 — “superseded”',
    ])
  })

  it('is empty for a plain open handoff', () => {
    expect(attributionLines({ status: 'open' })).toEqual([])
  })
})
