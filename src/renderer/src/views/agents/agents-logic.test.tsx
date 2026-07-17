// @vitest-environment jsdom
/** Agents roster derivation (story 26.5): pure git-attribution fold. */
import { describe, expect, it } from 'vitest'
import type { ActivityEvent } from '../../../../shared/types'
import { LIVE_WINDOW_MS, rosterFrom } from './AgentsView'

const ev = (name: string, at: string, kind: ActivityEvent['kind'] = 'route'): ActivityEvent =>
  ({ kind, actor: { name, email: `${name}@x` }, at, subject: { path: `p/${name}.md` }, summary: `${kind} by ${name}`, sha: name + at }) as ActivityEvent

describe('rosterFrom', () => {
  it('one row per identity (newest write wins), live inside the window, sync skipped', () => {
    const now = Date.parse('2026-07-16T12:00:00Z')
    const rows = rosterFrom(
      [
        ev('claude', '2026-07-16T11:55:00Z'),
        ev('claude', '2026-07-16T09:00:00Z'),
        ev('codex', '2026-07-16T08:00:00Z'),
        ev('bot', '2026-07-16T11:59:00Z', 'sync'),
      ],
      now,
    )
    expect(rows.map((r) => r.name)).toEqual(['claude', 'codex'])
    expect(rows[0]?.live).toBe(true)
    expect(rows[1]?.live).toBe(false)
    expect(now - Date.parse(rows[0]?.lastAt ?? '')).toBeLessThan(LIVE_WINDOW_MS)
  })
})

import type { McpLogEntry } from '../../../../shared/types'
import { doingNow, sessionLines } from './AgentsView'

const mcpE = (at: string, name: string, agent?: string): McpLogEntry =>
  ({ at, kind: 'tool', name, ...(agent ? { agent } : {}) }) as McpLogEntry

describe('doingNow (slice G)', () => {
  const now = Date.parse('2026-07-16T12:00:00Z')
  const row = { name: 'claude', email: 'c@x', lastAt: '2026-07-16T11:55:00Z', lastSummary: 'filed finding', live: true }
  it('live + attributed MCP call → the call name', () => {
    expect(doingNow(row, [mcpE('2026-07-16T11:58:00Z', 'vault_search', 'claude')], now).text).toBe('vault_search')
  })
  it('live without MCP attribution → last git write', () => {
    expect(doingNow(row, [], now).text).toBe('filed finding')
  })
  it('idle → idle · last seen', () => {
    const idle = { ...row, live: false, lastAt: '2026-07-16T09:00:00Z' }
    expect(doingNow(idle, [], now).text).toMatch(/^idle · last seen/)
  })
})

describe('sessionLines (slice G)', () => {
  it('merges [MCP]+[GIT] chronologically; watch filters by agent', () => {
    const feed = [ev('claude', '2026-07-16T11:57:00Z'), ev('codex', '2026-07-16T11:56:00Z')]
    const log = [mcpE('2026-07-16T11:58:00Z', 'vault_search', 'claude')]
    const all = sessionLines(log, feed, null)
    expect(all.map((l) => l.src)).toEqual(['GIT', 'GIT', 'MCP'])
    const watched = sessionLines(log, feed, 'claude')
    expect(watched).toHaveLength(2)
    expect(watched.every((l) => l.text.includes('claude') || l.src === 'MCP')).toBe(true)
  })
})
