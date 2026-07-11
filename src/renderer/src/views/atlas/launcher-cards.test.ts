/**
 * Atlas reframe WP2 — project-launcher card builder tests. Two layers: literal
 * rows pin the pure shaping (open = openTotal, in/out split, brief, ordering),
 * and a contract suite folds the real nimbus simulation vault (the same
 * checked-in fixture + pinned `today` the Home insights suite uses) so the
 * launcher's projects + counts match ground truth. The builder reuses
 * projectHealth, so this suite guards the atlas-facing projection, not the
 * per-project math (that is insights.test.ts).
 */
import { buildDashboard, listHandoffs } from 'loredex'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HandoffCard } from '../../../../shared/types'
import { buildLauncherCards } from './launcher-cards'
import type { ProjectStateRow } from '../home/insights'

const VAULT = join(import.meta.dirname, '../../../../../tests/fixtures/nimbus-vault')
const TODAY = '2026-07-10'

// ── literal-row units ────────────────────────────────────────────────────────

const state = (over: Partial<ProjectStateRow>): ProjectStateRow =>
  ({
    project: 'alpha',
    noteCount: 3,
    lastDate: '2026-07-05',
    briefPath: 'projects/alpha/start-here.md',
    notesNewerThanBrief: 0,
    activeTopics: ['streaming'],
    ...over,
  }) as ProjectStateRow

const card = (over: Partial<HandoffCard>): HandoffCard => ({
  id: over.id ?? 'h',
  name: over.id ?? 'h',
  from: 'beta',
  to: 'alpha',
  objective: 'x',
  date: '2026-07-08',
  ageDays: 2,
  status: 'open',
  path: 'projects/alpha/handoffs/h.md',
  readingOrder: [],
  kind: 'delivery',
  expired: false,
  ...over,
})

describe('buildLauncherCards (units)', () => {
  it('carries name/notes/brief/lastDate and splits open into total + in/out', () => {
    const cards = [
      card({ id: 'in1', to: 'alpha', from: 'beta', status: 'open' }),
      card({ id: 'in2', to: 'alpha', from: 'beta', status: 'open' }),
      card({ id: 'out1', from: 'alpha', to: 'beta', status: 'open' }),
      card({ id: 'done', to: 'alpha', from: 'beta', status: 'consumed' }),
    ]
    const [row] = buildLauncherCards([state({})], cards)
    expect(row).toMatchObject({
      project: 'alpha',
      noteCount: 3,
      openIn: 2,
      openOut: 1,
      open: 3, // total open touching the project (in + out), not the consumed one
      brief: 'fresh',
      lastDate: '2026-07-05',
    })
  })

  it('brief freshness follows the state (none / stale / fresh)', () => {
    expect(buildLauncherCards([state({ briefPath: null })], [])[0]?.brief).toBe('none')
    expect(
      buildLauncherCards([state({ notesNewerThanBrief: 2 })], [])[0]?.brief,
    ).toBe('stale')
    expect(buildLauncherCards([state({})], [])[0]?.brief).toBe('fresh')
  })

  it('ranks busiest open-flow first (top-left of the grid)', () => {
    const busy = state({ project: 'busy' })
    const quiet = state({ project: 'quiet' })
    const cards = [card({ id: 'b', to: 'busy', from: 'quiet', status: 'open' })]
    expect(buildLauncherCards([quiet, busy], cards).map((c) => c.project)).toEqual([
      'busy',
      'quiet',
    ])
  })

  it('empty vault degrades to no cards', () => {
    expect(buildLauncherCards([], [])).toEqual([])
  })
})

// ── contract suite against the real nimbus simulation vault ───────────────────

describe('buildLauncherCards (nimbus vault)', () => {
  const dash = buildDashboard(VAULT, TODAY)
  const cards = listHandoffs(VAULT, { direction: 'all' }, TODAY)
  const rows = buildLauncherCards(dash.states, cards)

  it('one card per project, the four nimbus projects present', () => {
    const names = rows.map((r) => r.project)
    expect(names).toContain('nimbus-backend')
    expect(names).toContain('nimbus-frontend')
    expect(names).toContain('nimbus-mobile')
    expect(names).toContain('nimbus-ai-engine')
    expect(new Set(names).size).toBe(names.length) // no dupes
  })

  it('busiest project (nimbus-backend) leads with its real open counts', () => {
    expect(rows[0]?.project).toBe('nimbus-backend')
    const backend = rows.find((r) => r.project === 'nimbus-backend')
    expect(backend).toMatchObject({ open: 10, openIn: 5, openOut: 5 })
    expect(backend?.noteCount).toBeGreaterThan(0)
  })

  it('a quiet project (nimbus-ai-engine) reports its lower open count', () => {
    const ai = rows.find((r) => r.project === 'nimbus-ai-engine')
    expect(ai?.open).toBe(1)
  })

  it('every card is Reader-ready: named project, dated, brief classified', () => {
    for (const r of rows) {
      expect(r.project.length).toBeGreaterThan(0)
      expect(typeof r.lastDate).toBe('string')
      expect(['fresh', 'stale', 'none']).toContain(r.brief)
    }
  })

  it('is deterministic across builds', () => {
    expect(buildLauncherCards(dash.states, cards)).toEqual(rows)
  })
})
