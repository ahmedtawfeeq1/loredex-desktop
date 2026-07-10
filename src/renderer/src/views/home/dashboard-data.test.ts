/**
 * Live-recompute wiring (story 15.5 AC6): which renderer events schedule the
 * debounced dashboard re-pull. The store module is bridge-guarded, so it
 * imports cleanly under node like the other store tests.
 */
import { describe, expect, it } from 'vitest'
import type { CoreEvent } from '../../../../shared/ipc-contract'
import { isRecomputeEvent, RECOMPUTE_DEBOUNCE_MS, useDashboardData } from './dashboard-data'

describe('dashboard live recompute', () => {
  it('recomputes on every event that can change a dashboard number', () => {
    const yes: Array<CoreEvent['kind']> = [
      'vault.changed',
      'sync.changed',
      'contract.changed',
      'handoff.new',
      'handoff.created',
      'handoff.stateChanged',
      'snooze.expired',
    ]
    for (const kind of yes) expect(isRecomputeEvent(kind), kind).toBe(true)
  })

  it('stays quiet on events that cannot move a number', () => {
    const no: Array<CoreEvent['kind']> = [
      'wizard.progress',
      'git.warning',
      'suggest.statusChange',
      'route.completed', // route writes land as vault.changed right after
    ]
    for (const kind of no) expect(isRecomputeEvent(kind), kind).toBe(false)
  })

  it('debounce is the resolved 500 ms; the store starts empty (skeleton)', () => {
    expect(RECOMPUTE_DEBOUNCE_MS).toBe(500)
    const s = useDashboardData.getState()
    expect(s.dash).toBeNull()
    expect(s.changes).toBeNull()
    expect(s.rootsCount).toBeNull()
    s.reset() // idempotent on the empty store
    expect(useDashboardData.getState().dash).toBeNull()
  })
})
