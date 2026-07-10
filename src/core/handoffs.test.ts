/**
 * Story 3.2: handoffs.list serves lib HandoffCards over the seam and the
 * board's data assembly (lanes.ts) groups them correctly — against the repo
 * fixture vault, and against the real nimbus simulation vault when present.
 */
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  type BoardFilter,
  filterByDisplay,
  formatAge,
  groupByProject,
  hiddenCount,
  inDisplay,
  lanesFor,
  openCount,
  projectsOf,
  toVaultRelative,
} from '../shared/handoff-lanes'
import { createIpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'
import { handoffs, initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc } from './ipc'

const FIXTURE_VAULT = resolve(import.meta.dirname, '../../tests/fixtures/vault')
const NIMBUS_VAULT = resolve(
  import.meta.dirname,
  '../../../loredex-simulation/_machine2/nimbus-vault',
)

function fakePortPair(): [PortLike, PortLike] {
  const handlers: [Array<(d: unknown) => void>, Array<(d: unknown) => void>] = [[], []]
  const make = (mine: 0 | 1): PortLike => ({
    postMessage: (data) => {
      queueMicrotask(() => {
        for (const cb of handlers[mine === 0 ? 1 : 0]) cb(data)
      })
    },
    onMessage: (cb) => handlers[mine].push(cb),
  })
  return [make(0), make(1)]
}

beforeAll(() => {
  const configDir = mkdtempSync(join(tmpdir(), 'loredex-desktop-handoffs-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: FIXTURE_VAULT, sync: 'none', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
})

describe('handoffs.list over the seam (fixture vault)', () => {
  it('serves company-wide cards and maps scope + project to lib HandoffScope', async () => {
    const ipc = createCoreIpc()
    registerCoreHandlers(ipc)
    const client = createIpcClient({ timeoutMs: 2000 })
    const [a, b] = fakePortPair()
    ipc.attach(a)
    client.attach(b)

    const all = await client.invoke('handoffs.list', { scope: 'all' })
    expect(all.map((c) => c.id).sort()).toEqual([
      '2026-07-01-handoff-nimbus-web-error-codes',
      '2026-07-04-handoff-nimbus-web',
      '2026-07-06-handoff-nimbus-api',
    ])
    // open first, newest first (lib ordering preserved through the seam)
    expect(all.map((c) => c.status)).toEqual(['open', 'open', 'consumed'])

    const inbox = await client.invoke('handoffs.list', { scope: 'inbox', project: 'nimbus-web' })
    expect(inbox.every((c) => c.to === 'nimbus-web')).toBe(true)
    expect(inbox).toHaveLength(2)

    const outbox = await client.invoke('handoffs.list', { scope: 'outbox', project: 'nimbus-web' })
    expect(outbox.map((c) => c.id)).toEqual(['2026-07-06-handoff-nimbus-api'])
  })

  it('cards carry the board fields: from/to, objective, date, age, reading order', () => {
    const cards = handoffs({ direction: 'all' })
    const open = cards.find((c) => c.id === '2026-07-04-handoff-nimbus-web')
    expect(open).toMatchObject({
      from: 'nimbus-api',
      to: 'nimbus-web',
      status: 'open',
      date: '2026-07-04',
    })
    expect(open?.objective).toContain('X-RateLimit')
    expect(open?.readingOrder).toEqual([
      '2026-07-02 - nimbus-api - rate limiting research',
      '2026-07-03 - nimbus-web - dashboard layout decision',
    ])
    expect(open?.ageDays).toBeGreaterThan(0)
  })
})

describe('board data assembly (lanes.ts)', () => {
  it('groups lanes per project and aggregates company-wide', () => {
    const cards = handoffs({ direction: 'all' })
    expect(projectsOf(cards)).toEqual(['nimbus-api', 'nimbus-web'])

    const web = lanesFor(cards, 'nimbus-web')
    expect(web.inbound.map((c) => c.id)).toEqual([
      '2026-07-04-handoff-nimbus-web',
      '2026-07-01-handoff-nimbus-web-error-codes',
    ])
    expect(web.outbound.map((c) => c.id)).toEqual(['2026-07-06-handoff-nimbus-api'])

    const grouped = groupByProject(cards)
    expect(grouped.map((g) => g.project)).toEqual(['nimbus-api', 'nimbus-web'])
    // every card appears exactly once as inbound and once as outbound across groups
    expect(grouped.flatMap((g) => g.lanes.inbound)).toHaveLength(cards.length)
    expect(grouped.flatMap((g) => g.lanes.outbound)).toHaveLength(cards.length)

    expect(openCount(cards, 'all')).toBe(2)
    expect(openCount(cards, 'nimbus-web')).toBe(1)
    expect(openCount(cards, 'nimbus-api')).toBe(1)
  })

  it('formats age and vault-relative paths', () => {
    expect(formatAge(0)).toBe('today')
    expect(formatAge(1)).toBe('1d')
    expect(formatAge(12)).toBe('12d')
    expect(toVaultRelative('/v/projects/p/handoffs/x.md', '/v')).toBe('projects/p/handoffs/x.md')
    expect(toVaultRelative('elsewhere/x.md', '/v')).toBe('elsewhere/x.md')
  })
})

// The real simulated team vault (manual-verification target) — board assembly
// must hold against it, not just the minimal fixtures.
describe.skipIf(!existsSync(NIMBUS_VAULT))('board data assembly (nimbus simulation vault)', () => {
  it('assembles lanes for every nimbus project with open-first ordering', async () => {
    const { listHandoffs } = await import('loredex')
    const cards = listHandoffs(NIMBUS_VAULT, { direction: 'all' })
    expect(cards.length).toBeGreaterThanOrEqual(6)

    const projects = projectsOf(cards)
    expect(projects).toContain('nimbus-backend')
    expect(projects).toContain('nimbus-mobile')

    // the known open handoff to nimbus-mobile shows up in its inbox lane
    const mobile = lanesFor(cards, 'nimbus-mobile')
    expect(mobile.inbound.some((c) => c.from === 'nimbus-backend' && c.status === 'open')).toBe(
      true,
    )

    // lanes preserve the lib's open-first ordering
    for (const project of projects) {
      const { inbound } = lanesFor(cards, project)
      const firstConsumed = inbound.findIndex((c) => c.status !== 'open')
      if (firstConsumed !== -1) {
        expect(inbound.slice(firstConsumed).every((c) => c.status !== 'open')).toBe(true)
      }
    }
  })
})

// D1 amendment 6 — board display filter (default hides done)
describe('board display filter', () => {
  const mk = (status: string, expired = false) =>
    ({
      id: status,
      name: status,
      from: 'a',
      to: 'b',
      status,
      expired,
      readingOrder: [],
      ageDays: 0,
      date: '2026-07-10',
      kind: 'delivery',
      path: `/v/${status}.md`,
    }) as unknown as Parameters<typeof inDisplay>[0]
  const cards = [mk('open'), mk('accepted'), mk('snoozed'), mk('consumed'), mk('declined')]

  it('active (default) shows only open/accepted/snoozed', () => {
    const shown = filterByDisplay(cards, 'active')
    expect(shown.map((c) => c.status).sort()).toEqual(['accepted', 'open', 'snoozed'])
  })
  it('done shows only consumed/declined', () => {
    expect(filterByDisplay(cards, 'done').map((c) => c.status).sort()).toEqual([
      'consumed',
      'declined',
    ])
  })
  it('all shows everything', () => {
    expect(filterByDisplay(cards, 'all')).toHaveLength(5)
  })
  it('hiddenCount reports what active hides', () => {
    expect(hiddenCount(cards, 'active')).toBe(2)
    expect(hiddenCount(cards, 'all')).toBe(0)
  })
  it('active + done partition the whole set for these statuses', () => {
    const modes: BoardFilter[] = ['active', 'done']
    const total = modes.reduce((n, m) => n + filterByDisplay(cards, m).length, 0)
    expect(total).toBe(cards.length)
  })
})
