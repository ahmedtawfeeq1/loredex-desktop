/**
 * WP-C: snapshot IPC drive on a git-init'd agent-ops sandbox. The lib copy +
 * manifest are tested in loredex's snapshot.test.ts; here we prove the desktop
 * wiring — clients.snapshot.create writes _versions/<unit>/<stamp>/ with one
 * attributed commit, and clients.snapshot.list reads it back newest-first.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldClient, scaffoldPipeline, scaffoldStage, scaffoldVault } from 'loredex'
import { beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient, type IpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc, type CoreIpc } from './ipc'
import { initSettings } from './settings'

const dana = { name: 'Dana Reyes', email: 'dana@acme.dev' }

let vault: string
let client: IpcClient
let ipc: CoreIpc

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: vault, encoding: 'utf8' })
}

function commitCount(): number {
  return Number(git('rev-list', '--count', 'HEAD').trim())
}

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
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'loredex-snap-handlers-')))
  vault = join(sandbox, 'vault')
  scaffoldVault(vault, 'agent-ops')
  scaffoldClient(vault, 'acme_dental')
  scaffoldPipeline(vault, 'acme_dental', 'intake')
  scaffoldStage(vault, 'acme_dental', 'intake', 'qualify')
  git('init', '-b', 'main')
  git('add', '-A')
  git('-c', 'user.name=Seed', '-c', 'user.email=seed@acme.dev', 'commit', '-m', 'seed')

  const configDir = mkdtempSync(join(tmpdir(), 'loredex-snap-handlers-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'git', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
  initSettings(mkdtempSync(join(tmpdir(), 'loredex-snap-handlers-userdata-')))

  ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 30000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
})

describe('clients.snapshot.* — the Snapshot button end-to-end', () => {
  it('versions a pipeline into _versions/<unit>/<stamp>/ in one attributed commit', async () => {
    const before = commitCount()
    const result = await client.invoke('clients.snapshot.create', {
      client: 'acme-dental',
      unit: 'intake',
      note: 'baseline',
      identity: dana,
    })
    expect(result.unit).toBe('intake')
    expect(result.kind).toBe('pipeline')
    // the four unit files + the stage's four files were copied
    expect(result.files).toContain('_persona.md')
    expect(result.files.some((f) => f.startsWith('stages/'))).toBe(true)
    expect(existsSync(join(vault, result.dir, 'manifest.json'))).toBe(true)
    // exactly one commit, attributed to the identity
    expect(commitCount()).toBe(before + 1)
    expect(git('log', '-1', '--format=%an').trim()).toBe('Dana Reyes')
  })

  it('lists the snapshot newest-first with its note', async () => {
    const rows = await client.invoke('clients.snapshot.list', { client: 'acme-dental' })
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0]).toMatchObject({ unit: 'intake', note: 'baseline' })
    expect(rows[0].fileCount).toBeGreaterThan(0)
  })

  it('refuses an unknown unit without crashing the seam', async () => {
    await expect(
      client.invoke('clients.snapshot.create', {
        client: 'acme-dental',
        unit: 'does-not-exist',
        identity: dana,
      }),
    ).rejects.toBeTruthy()
  })
})
