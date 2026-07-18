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

  it('research dexes see the nine; agent-ops adds Clients; Plan flag retired', () => {
    useDex.setState({ type: 'research' })
    expect(visibleViews()).toHaveLength(9)
    expect(visibleViews().some((e) => e.view === 'clients')).toBe(false)
    expect(visibleViews().some((e) => e.view === 'plan')).toBe(true)
    useDex.setState({ type: 'agent-ops' })
    expect(visibleViews()).toHaveLength(10)
    expect(visibleViews().some((e) => e.view === 'clients')).toBe(true)
    useDex.setState({ type: null })
  })

  it('v3 sidebar has no group headers — group survives as metadata only', () => {
    expect(VIEW_ORDER.every((e) => typeof e.group === 'string')).toBe(true)
  })
})
