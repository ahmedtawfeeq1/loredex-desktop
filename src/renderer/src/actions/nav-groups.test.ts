import { describe, expect, it } from 'vitest'
import { useDex } from '../stores/dex'
import { VIEW_ORDER, visibleViews } from './registry'

describe('VIEW_ORDER nav groups', () => {
  it('every entry has a group', () => {
    expect(VIEW_ORDER.every((e) => typeof e.group === 'string' && e.group.length > 0)).toBe(true)
  })

  it('v3 nav: the prototype eight in ⌘1-8 order, absorbed views navHidden', () => {
    expect(VIEW_ORDER.slice(0, 8).map((e) => e.view)).toEqual([
      'home', 'handoffs', 'plan', 'reader', 'atlas', 'agents', 'feed', 'settings',
    ])
    expect(VIEW_ORDER.filter((e) => e.navHidden).map((e) => e.view)).toEqual([
      'search', 'contracts',
    ])
  })

  it('research dexes see the eight; agent-ops adds Clients; Plan flag retired', () => {
    useDex.setState({ type: 'research' })
    expect(visibleViews()).toHaveLength(8)
    expect(visibleViews().some((e) => e.view === 'clients')).toBe(false)
    expect(visibleViews().some((e) => e.view === 'plan')).toBe(true)
    useDex.setState({ type: 'agent-ops' })
    expect(visibleViews()).toHaveLength(9)
    expect(visibleViews().some((e) => e.view === 'clients')).toBe(true)
    useDex.setState({ type: null })
  })

  it('v3 sidebar has no group headers — group survives as metadata only', () => {
    expect(VIEW_ORDER.every((e) => typeof e.group === 'string')).toBe(true)
  })
})
