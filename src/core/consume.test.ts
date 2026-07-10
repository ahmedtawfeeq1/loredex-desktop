/**
 * Story 3.4 integration: consume over the seam flips status and stamps
 * who/when + loredex_schema in vault frontmatter — via the lib export only —
 * and the settings channels persist the identity profile app-side.
 */
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient, type IpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'
import { getAppDb, initAppDb, metaGet } from './db/index'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc, type CoreIpc } from './ipc'
import { initSettings } from './settings'

const FIXTURE_VAULT = resolve(import.meta.dirname, '../../tests/fixtures/vault')
const OPEN_HANDOFF = '2026-07-04-handoff-nimbus-web'
const dana = { name: 'Dana Reyes', email: 'dana@nimbus.dev' }

let vault: string
let userData: string
let client: IpcClient
let ipc: CoreIpc
const events: unknown[] = []

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
  // consume mutates the vault — run against a throwaway copy of the fixtures
  vault = join(mkdtempSync(join(tmpdir(), 'loredex-consume-')), 'vault')
  cpSync(FIXTURE_VAULT, vault, { recursive: true })
  const configDir = mkdtempSync(join(tmpdir(), 'loredex-consume-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'none', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
  userData = mkdtempSync(join(tmpdir(), 'loredex-consume-userdata-'))
  initAppDb(userData) // story 9.2: settings persist in app.db meta
  initSettings(userData)

  ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 5000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
  client.onEvent((e) => events.push(e))
})

describe('settings.identity channels (app-side profile, never the vault)', () => {
  it('round-trips the profile through app.db and offers an ambient default', async () => {
    const empty = await client.invoke('settings.identity.get', undefined)
    expect(empty.profile).toBeNull()
    expect(empty.ambient).toHaveProperty('name') // git config or 'unknown'

    await client.invoke('settings.identity.set', dana)
    const loaded = await client.invoke('settings.identity.get', undefined)
    expect(loaded.profile).toEqual(dana)

    // persisted in app.db under main's userData dir, NOT inside the vault (9.2)
    const db = getAppDb()
    expect(db).not.toBeNull()
    expect(JSON.parse(metaGet(db!, 'settings:identity') ?? 'null')).toEqual(dana)
  })

  it('rejects an unusable identity', async () => {
    await expect(
      client.invoke('settings.identity.set', { name: '', email: 'not-an-email' }),
    ).rejects.toMatchObject({ code: 'INTERNAL' })
  })
})

describe('handoffs.consume over the seam', () => {
  it('flips status, stamps who/when + loredex_schema, and reports honestly on push', async () => {
    const receipt = await client.invoke('handoffs.consume', { id: OPEN_HANDOFF, identity: dana })

    expect(receipt.handoffId).toBe(OPEN_HANDOFF)
    expect(receipt.by).toEqual(dana)
    expect(receipt.before.status).toBe('open')
    expect(receipt.after.status).toBe('consumed')
    expect(receipt.after.consumed_by).toBe('Dana Reyes <dana@nimbus.dev>')
    expect(receipt.after.consumed_at).toBe(receipt.at)
    expect(typeof receipt.after.loredex_schema).toBe('number')
    expect(receipt.pushed).toBe(false) // sync: none — no fake success

    // vault truth (via the seam's readNote → lib parseDoc): frontmatter was written
    const doc = await client.invoke('vault.readNote', {
      path: `projects/nimbus-web/handoffs/${OPEN_HANDOFF}.md`,
    })
    expect(doc.meta.status).toBe('consumed')
    expect(doc.meta.consumed_by).toBe('Dana Reyes <dana@nimbus.dev>')
    expect(doc.meta.loredex_schema).toBe(receipt.after.loredex_schema)

    // the board's refetch signals (AC5)
    expect(events).toContainEqual({
      kind: 'handoff.stateChanged',
      id: OPEN_HANDOFF,
      from: 'open',
      to: 'consumed',
      by: dana,
    })
    expect(events).toContainEqual({
      kind: 'vault.changed',
      paths: [`projects/nimbus-web/handoffs/${OPEN_HANDOFF}.md`],
    })

    // and the card now lists as consumed
    const cards = await client.invoke('handoffs.list', { scope: 'all' })
    expect(cards.find((c) => c.id === OPEN_HANDOFF)?.status).toBe('consumed')
  })

  it('rejects a consume without a usable identity', async () => {
    await expect(
      client.invoke('handoffs.consume', {
        id: OPEN_HANDOFF,
        identity: { name: 'unknown', email: 'unknown' },
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL', message: expect.stringContaining('identity') })
  })
})
