/**
 * Story 8.1 integration: handoffs.setStatus over the seam — the lib's one
 * non-consume transition writer. Frontmatter fields per the writer-semantics
 * table and nothing else; attribution never erased (except snooze fields on
 * reopen); illegal transitions map to typed envelopes; the stateChanged event
 * carries reason/until.
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient, type IpcClient } from '../shared/ipc-client'
import { isErrEnvelope, type PortLike } from '../shared/ipc-contract'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc, type CoreIpc } from './ipc'
import { initSettings } from './settings'

const FIXTURE_VAULT = resolve(import.meta.dirname, '../../tests/fixtures/vault')
const dana = { name: 'Dana Reyes', email: 'dana@nimbus.dev' }
// the two OPEN fixture handoffs (error-codes is the consumed one)
const H1 = 'nimbus-web/2026-07-04-handoff-nimbus-web'
const H2 = 'nimbus-api/2026-07-06-handoff-nimbus-api'

let vault: string
let client: IpcClient
let ipc: CoreIpc
const events: Array<Record<string, unknown>> = []

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

async function meta(rel: string): Promise<Record<string, unknown>> {
  const { parseDoc } = await import('loredex')
  return parseDoc(readFileSync(join(vault, rel), 'utf8')).meta as Record<string, unknown>
}

const H1_REL = 'projects/nimbus-web/handoffs/2026-07-04-handoff-nimbus-web.md'
const H2_REL = 'projects/nimbus-api/handoffs/2026-07-06-handoff-nimbus-api.md'

beforeAll(() => {
  const sandbox = mkdtempSync(join(tmpdir(), 'loredex-status-'))
  vault = join(sandbox, 'vault')
  cpSync(FIXTURE_VAULT, vault, { recursive: true })
  const configDir = mkdtempSync(join(tmpdir(), 'loredex-status-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'none', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
  initSettings(mkdtempSync(join(tmpdir(), 'loredex-status-userdata-')))

  ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 30000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
  client.onEvent((e) => events.push(e as unknown as Record<string, unknown>))
})

describe('handoffs.setStatus over the seam (story 8.1)', () => {
  it('accept writes status + accepted_by/at + schema stamp and nothing else', async () => {
    const before = await meta(H1_REL)
    const receipt = await client.invoke('handoffs.setStatus', {
      id: H1,
      transition: { to: 'accepted' },
      identity: dana,
    })
    expect(receipt.before.status).toBe('open')
    expect(receipt.after.status).toBe('accepted')
    expect(receipt.pushed).toBe(false) // sync: none — honest

    const after = await meta(H1_REL)
    expect(after.status).toBe('accepted')
    expect(after.accepted_by).toBe('Dana Reyes <dana@nimbus.dev>')
    expect(typeof after.accepted_at).toBe('string')
    expect(after.loredex_schema).toBe(2)
    // nothing else changed: only the transition's own fields were touched
    const changed = Object.keys(after).filter(
      (k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]),
    )
    expect(changed.sort()).toEqual(['accepted_at', 'accepted_by', 'loredex_schema', 'status'])

    // the board event announces the transition (no reason/until on accept)
    const evt = events.find((e) => e.kind === 'handoff.stateChanged' && e.to === 'accepted')
    expect(evt).toMatchObject({ id: H1, from: 'open', by: dana })
    expect(evt?.reason).toBeUndefined()
    expect(evt?.until).toBeUndefined()
  })

  it('accepted → consume (existing writer) keeps the accept attribution', async () => {
    await client.invoke('handoffs.consume', { id: H1, identity: dana })
    const after = await meta(H1_REL)
    expect(after.status).toBe('consumed')
    expect(after.accepted_by).toBe('Dana Reyes <dana@nimbus.dev>') // history kept
    expect(after.consumed_by).toBe('Dana Reyes <dana@nimbus.dev>')
  })

  it('decline requires a reason and stamps declined_by/at/reason', async () => {
    const receipt = await client.invoke('handoffs.setStatus', {
      id: H2,
      transition: { to: 'declined', reason: 'superseded by the July API revision' },
      identity: dana,
    })
    expect(receipt.after.status).toBe('declined')
    const after = await meta(H2_REL)
    expect(after.declined_reason).toBe('superseded by the July API revision')
    expect(after.declined_by).toBe('Dana Reyes <dana@nimbus.dev>')
    expect(typeof after.declined_at).toBe('string')

    // stateChanged carries the reason (contract evolution, AC5)
    expect(
      events.some((e) => e.reason === 'superseded by the July API revision'),
    ).toBe(true)
  })

  it('reopen from declined keeps decline attribution (history, not erasure)', async () => {
    await client.invoke('handoffs.setStatus', {
      id: H2,
      transition: { to: 'open' },
      identity: dana,
    })
    const after = await meta(H2_REL)
    expect(after.status).toBe('open')
    expect(after.declined_by).toBe('Dana Reyes <dana@nimbus.dev>') // kept
    expect(after.declined_reason).toBe('superseded by the July API revision')
  })

  it('snooze stamps snoozed_by/at/until; readers derive expired, never a write-back', async () => {
    await client.invoke('handoffs.setStatus', {
      id: H2,
      transition: { to: 'snoozed', until: '2026-07-20' },
      identity: dana,
    })
    const after = await meta(H2_REL)
    expect(after.status).toBe('snoozed')
    expect(String(after.snoozed_until).slice(0, 10)).toBe('2026-07-20')
    expect(after.snoozed_by).toBe('Dana Reyes <dana@nimbus.dev>')
    expect(events.some((e) => e.until === '2026-07-20')).toBe(true)

    // expired is DERIVED per reading day (AC4 boundary: before / on / after)
    const { listHandoffs } = await import('loredex')
    const on = (today: string): boolean =>
      listHandoffs(vault, { direction: 'all' }, today).find((c) => c.id === '2026-07-06-handoff-nimbus-api')
        ?.expired as boolean
    expect(on('2026-07-19')).toBe(false)
    expect(on('2026-07-20')).toBe(false) // until the day itself it still sleeps
    expect(on('2026-07-21')).toBe(true)
    // expired sorts with open cards (lib ordering — the board keeps it)
    const cards = listHandoffs(vault, { direction: 'all' }, '2026-07-21')
    const idx = cards.findIndex((c) => c.id === '2026-07-06-handoff-nimbus-api')
    const firstClosed = cards.findIndex((c) => c.status === 'consumed')
    expect(idx).toBeLessThan(firstClosed)

    // frontmatter unchanged by reading it (no auto-write)
    expect((await meta(H2_REL)).status).toBe('snoozed')
  })

  it('reopen from snoozed removes the snooze fields (the one sanctioned erasure)', async () => {
    await client.invoke('handoffs.setStatus', {
      id: H2,
      transition: { to: 'open' },
      identity: dana,
    })
    const after = await meta(H2_REL)
    expect(after.status).toBe('open')
    expect(after.snoozed_until).toBeUndefined()
    expect(after.snoozed_by).toBeUndefined()
    expect(after.declined_by).toBe('Dana Reyes <dana@nimbus.dev>') // older history still kept
  })

  it('illegal transitions surface as typed envelopes, never silent', async () => {
    // H1 is consumed (terminal)
    await expect(
      client.invoke('handoffs.setStatus', { id: H1, transition: { to: 'accepted' }, identity: dana }),
    ).rejects.toSatisfy((e: unknown) => isErrEnvelope(e) && e.code === 'ILLEGAL_TRANSITION')
    await expect(
      client.invoke('handoffs.setStatus', {
        id: 'nimbus-web/no-such-handoff',
        transition: { to: 'accepted' },
        identity: dana,
      }),
    ).rejects.toSatisfy((e: unknown) => isErrEnvelope(e) && e.code === 'UNKNOWN_HANDOFF')
    // identity is required — same guard as every write channel
    await expect(
      client.invoke('handoffs.setStatus', {
        id: H2,
        transition: { to: 'accepted' },
        identity: { name: '', email: '' },
      }),
    ).rejects.toSatisfy((e: unknown) => isErrEnvelope(e) && e.code === 'INTERNAL')
  })
})
