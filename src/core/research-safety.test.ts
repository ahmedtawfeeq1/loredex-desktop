/**
 * Research-dex-safety invariant (the user's hard constraint): the agent-ops
 * write channels must REFUSE on a research dex — the core `requireAgentOps`
 * guard is the last line even if a stale renderer view reaches them. Drives the
 * channels over IPC against a git-init'd RESEARCH vault and asserts each throws
 * and writes nothing.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldVault } from 'loredex'
import { beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient, type IpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc, type CoreIpc } from './ipc'
import { initSettings } from './settings'

const dana = { name: 'Dana Reyes', email: 'dana@research.dev' }

let vault: string
let client: IpcClient
let ipc: CoreIpc

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: vault, encoding: 'utf8' })
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
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'loredex-research-safety-')))
  vault = join(sandbox, 'vault')
  scaffoldVault(vault, 'research') // the DEFAULT type — NOT agent-ops
  mkdirSync(join(vault, 'projects', 'some-project'), { recursive: true })
  writeFileSync(join(vault, 'projects', 'some-project', 'note.md'), '# a\n')
  git('init', '-b', 'main')
  git('add', '-A')
  git('-c', 'user.name=Seed', '-c', 'user.email=seed@research.dev', 'commit', '-m', 'seed')

  const configDir = mkdtempSync(join(tmpdir(), 'loredex-research-safety-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'git', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
  initSettings(mkdtempSync(join(tmpdir(), 'loredex-research-safety-userdata-')))

  ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 30000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
})

describe('agent-ops write channels refuse on a research dex', () => {
  const headSha = (): string => git('rev-parse', 'HEAD').trim()

  it('clients.normalize refuses (never scaffolds client structure onto research)', async () => {
    const before = headSha()
    await expect(
      client.invoke('clients.normalize', { identity: dana }),
    ).rejects.toBeTruthy()
    // no new files, no commit — the research project dir is untouched
    expect(readdirSync(join(vault, 'projects', 'some-project'))).toEqual(['note.md'])
    expect(headSha()).toBe(before)
  })

  it('clients.scaffold.pipeline / .agent / .stage refuse', async () => {
    for (const [channel, payload] of [
      ['clients.scaffold.pipeline', { client: 'some-project', name: 'x', identity: dana }],
      ['clients.scaffold.agent', { client: 'some-project', name: 'x', identity: dana }],
      ['clients.scaffold.stage', { client: 'some-project', pipeline: 'p', name: 'x', identity: dana }],
    ] as const) {
      await expect(client.invoke(channel, payload)).rejects.toBeTruthy()
    }
    expect(existsSync(join(vault, 'projects', 'some-project', 'pipelines'))).toBe(false)
  })

  it('clients.snapshot.create + clients.inbox.delete refuse', async () => {
    await expect(
      client.invoke('clients.snapshot.create', {
        client: 'some-project',
        unit: 'p',
        identity: dana,
      }),
    ).rejects.toBeTruthy()
    await expect(
      client.invoke('clients.inbox.delete', {
        client: 'some-project',
        name: 'note.md',
        identity: dana,
      }),
    ).rejects.toBeTruthy()
    expect(existsSync(join(vault, 'projects', 'some-project', '_versions'))).toBe(false)
  })
})
