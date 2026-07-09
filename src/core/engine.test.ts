/**
 * Story 1.3: the core host embeds the pinned loredex lib and serves
 * config/read/search over the typed IPC seam. Runs in plain node against
 * tests/fixtures/vault (no Electron).
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'
import { getConfig, initEngine, readNote, search } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc } from './ipc'

const FIXTURE_VAULT = resolve(import.meta.dirname, '../../tests/fixtures/vault')

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
  // Point loredex's loadConfig at a throwaway config dir naming the fixture vault,
  // so initEngine exercises the real config resolution path.
  const configDir = mkdtempSync(join(tmpdir(), 'loredex-desktop-test-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: FIXTURE_VAULT, sync: 'none', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
})

describe('engine facade (sole loredex import site)', () => {
  it('resolves config exactly once — a second init throws', () => {
    expect(getConfig().vaultPath).toBe(FIXTURE_VAULT)
    expect(() => initEngine()).toThrow(/exactly once/)
  })

  it('readNote parses a vault-relative note via resolveNoteInsideVault + parseDoc', () => {
    const doc = readNote('projects/nimbus-api/2026-07-02 - nimbus-api - rate limiting research.md')
    expect(doc.meta.project).toBe('nimbus-api')
    expect(doc.meta.topic).toBe('rate limiting')
    expect(doc.body).toContain('Token bucket')
  })

  it('rejects paths outside the vault (traversal + absolute escapes)', () => {
    for (const bad of ['../../../etc/passwd', '/etc/passwd', 'projects/../../outside.md']) {
      expect(() => readNote(bad)).toThrow()
      try {
        readNote(bad)
      } catch (e) {
        expect(e).toMatchObject({ code: 'VAULT_OUTSIDE_PATH' })
      }
    }
  })

  it('search returns hits from the fixture vault', () => {
    const hits = search('rate limiting')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.project).toBe('nimbus-api')
    expect(search('dashboard').some((h) => h.project === 'nimbus-web')).toBe(true)
  })
})

describe('core host answers over the typed IPC contract shape', () => {
  it('serves config.get (engine info), vault.readNote and vault.search end-to-end', async () => {
    const ipc = createCoreIpc()
    registerCoreHandlers(ipc)
    const client = createIpcClient({ timeoutMs: 2000 })
    const [a, b] = fakePortPair()
    ipc.attach(a)
    client.attach(b)

    const config = await client.invoke('config.get', undefined)
    expect(config.vaultPath).toBe(FIXTURE_VAULT)

    const doc = await client.invoke('vault.readNote', {
      path: 'projects/nimbus-web/2026-07-03 - nimbus-web - dashboard layout decision.md',
    })
    expect(doc.meta.type).toBe('decision')

    const hits = await client.invoke('vault.search', { q: 'rate limiting' })
    expect(hits.some((h) => h.kind === 'handoff')).toBe(true)

    await expect(client.invoke('vault.readNote', { path: '/etc/passwd' })).rejects.toMatchObject({
      code: 'VAULT_OUTSIDE_PATH',
    })
    // channel not implemented until its lib-PR story lands
    await expect(client.invoke('sync.status', undefined)).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    })
  })
})
