/**
 * WP-G: scaffold + inbox channels driven over IPC on a git-init'd agent-ops
 * sandbox. The lib scaffolders are tested in loredex; here we prove the desktop
 * wiring — attributed commits, stage renumbering, inbox list/consume/delete,
 * the containment refusal, and the identity guard.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldClient, scaffoldVault } from 'loredex'
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
const commitCount = (): number => Number(git('rev-list', '--count', 'HEAD').trim())

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
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'loredex-scaffold-')))
  vault = join(sandbox, 'vault')
  scaffoldVault(vault, 'agent-ops')
  scaffoldClient(vault, 'acme_dental')
  git('init', '-b', 'main')
  git('add', '-A')
  git('-c', 'user.name=Seed', '-c', 'user.email=seed@acme.dev', 'commit', '-m', 'seed')

  const configDir = mkdtempSync(join(tmpdir(), 'loredex-scaffold-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'git', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
  initSettings(mkdtempSync(join(tmpdir(), 'loredex-scaffold-userdata-')))

  ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 30000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
})

describe('clients.scaffold.* + clients.inbox.*', () => {
  it('scaffolds a pipeline, an agent, and stages — one commit each; insert renumbers', async () => {
    const c0 = commitCount()
    const pipe = await client.invoke('clients.scaffold.pipeline', {
      client: 'acme-dental',
      name: 'lead reactivation',
      identity: dana,
    })
    expect(pipe.dir).toContain('pipelines/lead-reactivation') // underscore-slug trap: hyphenated
    expect(existsSync(join(vault, pipe.dir, '_persona.md'))).toBe(true)
    expect(commitCount()).toBe(c0 + 1)

    await client.invoke('clients.scaffold.agent', {
      client: 'acme-dental',
      name: 'front desk',
      identity: dana,
    })

    await client.invoke('clients.scaffold.stage', {
      client: 'acme-dental',
      pipeline: 'lead-reactivation',
      name: 'qualify',
      identity: dana,
    })
    // insert BEFORE 01 → renumbers the existing stage to 02
    const inserted = await client.invoke('clients.scaffold.stage', {
      client: 'acme-dental',
      pipeline: 'lead-reactivation',
      name: 'greet',
      before: '01',
      identity: dana,
    })
    expect(inserted.renumbered.length).toBeGreaterThan(0)
    expect(git('log', '-1', '--format=%an').trim()).toBe('Dana Reyes')
  })

  it('lists, consumes-to-randoms, and deletes inbox items', async () => {
    writeFileSync(join(vault, 'projects', 'acme-dental', '_inbox', 'intake-1.md'), '# a\n')
    writeFileSync(join(vault, 'projects', 'acme-dental', '_inbox', 'intake-2.md'), '# b\n')
    let inbox = await client.invoke('clients.inbox.list', { client: 'acme-dental' })
    expect(inbox.map((i) => i.name).sort()).toEqual(['intake-1.md', 'intake-2.md'])

    const moved = await client.invoke('clients.inbox.toRandoms', {
      client: 'acme-dental',
      name: 'intake-1.md',
      identity: dana,
    })
    expect(moved.moved).toBe('intake-1.md')
    expect(existsSync(join(vault, 'projects', 'acme-dental', '_randoms', 'intake-1.md'))).toBe(true)
    expect(existsSync(join(vault, 'projects', 'acme-dental', '_inbox', 'intake-1.md'))).toBe(false)

    await client.invoke('clients.inbox.delete', {
      client: 'acme-dental',
      name: 'intake-2.md',
      identity: dana,
    })
    inbox = await client.invoke('clients.inbox.list', { client: 'acme-dental' })
    expect(inbox).toEqual([])
  })

  it('refuses a containment escape in the inbox item name', async () => {
    await expect(
      client.invoke('clients.inbox.delete', {
        client: 'acme-dental',
        name: '../workspace.yml',
        identity: dana,
      }),
    ).rejects.toBeTruthy()
    // the file it tried to escape to is untouched
    expect(existsSync(join(vault, 'projects', 'acme-dental', 'workspace.yml'))).toBe(true)
  })

  it('refuses a scaffold with a blank identity', async () => {
    await expect(
      client.invoke('clients.scaffold.pipeline', {
        client: 'acme-dental',
        name: 'x',
        identity: { name: '', email: '' },
      }),
    ).rejects.toBeTruthy()
  })
})
