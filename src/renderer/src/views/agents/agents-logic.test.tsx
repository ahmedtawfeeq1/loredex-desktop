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
