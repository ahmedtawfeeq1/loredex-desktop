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
    expect(s.recuratingProject).toBeNull()
    useDashboardData.setState({ recuratingProject: 'x' })
    s.reset() // reset clears the busy flag too
    expect(useDashboardData.getState().dash).toBeNull()
    expect(useDashboardData.getState().recuratingProject).toBeNull()
  })

  it('re-curate is single-flight — a second call while one runs is a no-op', async () => {
    // a curate holds a vault lock; overlapping runs would corrupt it. With one
    // already in flight the guard returns before touching the bridge (window is
    // undefined under node, so reaching invoke would throw — it must not).
    useDashboardData.setState({ recuratingProject: 'alpha' })
    await expect(useDashboardData.getState().recurate('beta')).resolves.toBeUndefined()
    expect(useDashboardData.getState().recuratingProject).toBe('alpha')
    useDashboardData.setState({ recuratingProject: null })
  })
})
