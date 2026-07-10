/**
 * Story 10.6 AC4: the shared blocking rule + the blocked-on side list —
 * oldest-first ordering, sentence derivation, and (DoD) the vault's real
 * open request asserted against the nimbus simulation vault.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blockedRows, isBlockingCard } from './blocked'
import type { HandoffCard } from './types'

const NIMBUS_VAULT = resolve(
  import.meta.dirname,
  '../../../loredex-simulation/_machine2/nimbus-vault',
)

const card = (id: string, extra: Partial<HandoffCard> = {}): HandoffCard => ({
  id,
  name: id,
  from: 'alpha',
  to: 'beta',
  objective: `do ${id}`,
  date: '2026-07-01',
  ageDays: 9,
  status: 'open',
  path: `/v/projects/beta/handoffs/${id}.md`,
  readingOrder: [],
  kind: 'request',
  expired: false,
  ...extra,
})

describe('isBlockingCard', () => {
  it('open/accepted requests block; expired snooze counts as open; nothing else', () => {
    expect(isBlockingCard(card('a'))).toBe(true)
    expect(isBlockingCard(card('b', { status: 'accepted' }))).toBe(true)
    expect(isBlockingCard(card('c', { status: 'snoozed', expired: true }))).toBe(true)
    expect(isBlockingCard(card('d', { status: 'snoozed' }))).toBe(false)
    expect(isBlockingCard(card('e', { status: 'declined' }))).toBe(false)
    expect(isBlockingCard(card('f', { status: 'consumed' }))).toBe(false)
    expect(isBlockingCard(card('g', { kind: 'delivery' }))).toBe(false)
  })
})

describe('blockedRows', () => {
  it('lists blocking handoffs OLDEST-FIRST with the who-blocks-whom sentence', () => {
    const rows = blockedRows(
      [
        card('newer', { date: '2026-07-08' }),
        card('oldest', { date: '2026-07-01', from: 'web', to: 'api' }),
        card('ignored', { date: '2026-06-01', status: 'consumed' }),
        card('mid', { date: '2026-07-04' }),
      ],
      '/v',
    )
    expect(rows.map((r) => r.id)).toEqual(['oldest', 'mid', 'newer'])
    expect(rows[0]?.sentence).toBe('api is blocked on web')
    expect(rows[0]?.relPath).toBe('projects/beta/handoffs/oldest.md')
  })

  it('ties on date break by id — deterministic', () => {
    const rows = blockedRows([card('b'), card('a')], '/v')
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

// ── DoD: the vault's REAL open request appears in the blocked list ──────────

describe.skipIf(!existsSync(NIMBUS_VAULT))('blockedRows (nimbus simulation vault)', () => {
  it('surfaces the real open streaming request, oldest first', async () => {
    const { listHandoffs } = await import('loredex')
    const rows = blockedRows(listHandoffs(NIMBUS_VAULT, { direction: 'all' }), NIMBUS_VAULT)
    expect(rows.length).toBeGreaterThanOrEqual(1)
    // the open request: backend asks frontend to render the streaming panel
    // (projects/nimbus-frontend/handoffs/2026-07-10-handoff-nimbus-backend.md)
    const real = rows.find(
      (r) => r.relPath === 'projects/nimbus-frontend/handoffs/2026-07-10-handoff-nimbus-backend.md',
    )
    expect(real).toBeDefined()
    expect(real?.sentence).toBe('nimbus-frontend is blocked on nimbus-backend')
    // ordering: dates ascend
    const dates = rows.map((r) => r.date)
    expect([...dates].sort()).toEqual(dates)
  })
})
