import { describe, expect, it } from 'vitest'
import { VIEW_ORDER } from './registry'

describe('VIEW_ORDER nav groups', () => {
  it('every entry has a group', () => {
    expect(VIEW_ORDER.every((e) => typeof e.group === 'string' && e.group.length > 0)).toBe(true)
  })

  it('groups are contiguous — no group appears in two separate runs', () => {
    const runs: string[] = []
    for (const e of VIEW_ORDER) if (runs[runs.length - 1] !== e.group) runs.push(e.group)
    expect(runs.length).toBe(new Set(runs).size)
  })

  it('keeps 9 views so ⌘1-9 stays fully bound', () => {
    expect(VIEW_ORDER).toHaveLength(9)
  })

  it('orders groups Workspace, Collaborate, Knowledge, System', () => {
    const seen = [...new Set(VIEW_ORDER.map((e) => e.group))]
    expect(seen).toEqual(['Workspace', 'Collaborate', 'Knowledge', 'System'])
  })
})
