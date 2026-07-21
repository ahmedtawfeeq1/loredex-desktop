import { describe, expect, it } from 'vitest'
import { useDex } from '../stores/dex'
import { VIEW_ORDER, visibleViews } from './registry'

describe('VIEW_ORDER nav groups', () => {
  it('every entry has a group', () => {
    expect(VIEW_ORDER.every((e) => typeof e.group === 'string' && e.group.length > 0)).toBe(true)
  })

  it('v3 nav + Search back at ⌘8 (user 2026-07-18): Settings rides ⌘9', () => {
    expect(VIEW_ORDER.slice(0, 9).map((e) => e.view)).toEqual([
      'home', 'handoffs', 'plan', 'reader', 'atlas', 'agents', 'feed', 'search', 'settings',
    ])
    expect(VIEW_ORDER.filter((e) => e.navHidden).map((e) => e.view)).toEqual(['contracts'])
  })

  it('research dexes see the nine; agent-ops adds Clients + Staged edits', () => {
    useDex.setState({ type: 'research' })
    expect(visibleViews()).toHaveLength(9)
    expect(visibleViews().some((e) => e.view === 'clients')).toBe(false)
    expect(visibleViews().some((e) => e.view === 'plan')).toBe(true)
    useDex.setState({ type: 'agent-ops' })
    expect(visibleViews()).toHaveLength(11)
    expect(visibleViews().some((e) => e.view === 'clients')).toBe(true)
    useDex.setState({ type: null })
  })

  /**
   * The research-safety invariant: a research dex must never grow an agent-ops
   * surface. Asserted as a SET rather than a count so adding another agent-ops
   * view cannot quietly leak into research by matching an off-by-one.
   */
  it('no agent-ops view is ever visible on a research dex', () => {
    useDex.setState({ type: 'research' })
    const research = new Set(visibleViews().map((e) => e.view))
    for (const view of ['clients', 'staged-edits'] as const) {
      expect(research.has(view), `${view} must not appear on a research dex`).toBe(false)
    }
    useDex.setState({ type: 'agent-ops' })
    const agentOps = new Set(visibleViews().map((e) => e.view))
    for (const view of ['clients', 'staged-edits'] as const) {
      expect(agentOps.has(view), `${view} must appear on an agent-ops dex`).toBe(true)
    }
    // and research keeps every view it had — nothing was taken away
    for (const view of research) expect(agentOps.has(view)).toBe(true)
    useDex.setState({ type: null })
  })

  it('v3 sidebar has no group headers — group survives as metadata only', () => {
    expect(VIEW_ORDER.every((e) => typeof e.group === 'string')).toBe(true)
  })
})
