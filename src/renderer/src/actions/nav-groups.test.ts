import { describe, expect, it } from 'vitest'
import { useDex } from '../stores/dex'
import { VIEW_ORDER, visibleViews } from './registry'

describe('VIEW_ORDER nav groups', () => {
  it('every entry has a group', () => {
    expect(VIEW_ORDER.every((e) => typeof e.group === 'string' && e.group.length > 0)).toBe(true)
  })

  it('groups are contiguous — no group appears in two separate runs', () => {
    const runs: string[] = []
    for (const e of VIEW_ORDER) if (runs[runs.length - 1] !== e.group) runs.push(e.group)
    expect(runs.length).toBe(new Set(runs).size)
  })

  it('research dexes see 9 views (⌘1-9 fully bound); agent-ops adds Clients', () => {
    useDex.setState({ type: 'research' })
    expect(visibleViews()).toHaveLength(9)
    expect(visibleViews().some((e) => e.view === 'clients')).toBe(false)
    useDex.setState({ type: 'agent-ops' })
    expect(visibleViews()).toHaveLength(10)
    expect(visibleViews().some((e) => e.view === 'clients')).toBe(true)
    useDex.setState({ type: null })
  })

  it('orders groups Workspace, Collaborate, Knowledge, System', () => {
    const seen = [...new Set(VIEW_ORDER.map((e) => e.group))]
    expect(seen).toEqual(['Workspace', 'Collaborate', 'Knowledge', 'System'])
  })
})
