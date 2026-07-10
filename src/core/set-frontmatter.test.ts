/**
 * Epic20 channel drive: note.setFrontmatter over the seam against a git-init'd
 * sandbox of the fixture vault — body preservation, the managed-key refusal
 * (agents own frontmatter), traversal rejection, the set/remove commit grammar
 * with the payload identity, and the identity refusal.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient, type IpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'
import { parseDoc } from 'loredex'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc, type CoreIpc } from './ipc'
import { initSettings } from './settings'

const FIXTURE_VAULT = resolve(import.meta.dirname, '../../tests/fixtures/vault')
const dana = { name: 'Dana Reyes', email: 'dana@nimbus.dev' }
const NOTE = 'projects/nimbus-api/2026-07-02 - nimbus-api - rate limiting research.md'

let vault: string
let client: IpcClient
let ipc: CoreIpc
const events: Array<Record<string, unknown>> = []

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

function bodyOf(rel: string): string {
  return parseDoc(readFileSync(join(vault, rel), 'utf8')).body
}

beforeAll(() => {
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'loredex-set-fm-')))
  vault = join(sandbox, 'vault')
  cpSync(FIXTURE_VAULT, vault, { recursive: true })
  git('init', '-b', 'main')
  git('add', '-A')
  git('-c', 'user.name=Seed', '-c', 'user.email=seed@nimbus.dev', 'commit', '-m', 'seed')
  const configDir = mkdtempSync(join(tmpdir(), 'loredex-set-fm-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'git', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
  initSettings(mkdtempSync(join(tmpdir(), 'loredex-set-fm-userdata-')))

  ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 30000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
  client.onEvent((e) => events.push(e as unknown as Record<string, unknown>))
})

describe('note.setFrontmatter — body preserved, user fields written', () => {
  it('sets a user key, preserves the body byte-for-byte, commits the set grammar', async () => {
    const bodyBefore = bodyOf(NOTE)

    const out = await client.invoke('note.setFrontmatter', {
      path: NOTE,
      key: 'status',
      value: 'reviewed',
      identity: dana,
    })
    expect(out.path).toBe(NOTE)

    // body unchanged; the new key landed in frontmatter
    expect(bodyOf(NOTE)).toBe(bodyBefore)
    const doc = await client.invoke('vault.readNote', { path: NOTE })
    expect(doc.meta).toMatchObject({ status: 'reviewed' })

    expect(git('log', '-1', '--pretty=%s|%an|%ae').trim()).toBe(
      'loredex: set property status on 2026-07-02 - nimbus-api - rate limiting research|Dana Reyes|dana@nimbus.dev',
    )
    expect(events).toContainEqual({ kind: 'vault.changed', paths: [NOTE] })
  })

  it('adds and then removes a fresh user property (remove grammar)', async () => {
    const bodyBefore = bodyOf(NOTE)
    await client.invoke('note.setFrontmatter', {
      path: NOTE,
      key: 'tags',
      value: ['api', 'throttle'],
      identity: dana,
    })
    expect((await client.invoke('vault.readNote', { path: NOTE })).meta).toMatchObject({
      tags: ['api', 'throttle'],
    })

    await client.invoke('note.setFrontmatter', {
      path: NOTE,
      key: 'tags',
      remove: true,
      identity: dana,
    })
    const doc = await client.invoke('vault.readNote', { path: NOTE })
    expect('tags' in doc.meta).toBe(false)
    expect(bodyOf(NOTE)).toBe(bodyBefore) // body still intact across both writes
    expect(git('log', '-1', '--pretty=%s').trim()).toBe(
      'loredex: remove property tags on 2026-07-02 - nimbus-api - rate limiting research',
    )
  })
})

describe('note.setFrontmatter — refusals (agents own frontmatter)', () => {
  it('rejects managed keys and never writes them', async () => {
    for (const key of ['loredex', 'source_path', 'source_project', 'loredex_schema', 'consumed_by']) {
      await expect(
        client.invoke('note.setFrontmatter', { path: NOTE, key, value: 'hacked', identity: dana }),
      ).rejects.toMatchObject({ code: 'INTERNAL', message: expect.stringContaining('managed') })
    }
  })

  it('rejects a blank key', async () => {
    await expect(
      client.invoke('note.setFrontmatter', { path: NOTE, key: '  ', value: 'x', identity: dana }),
    ).rejects.toMatchObject({ code: 'INTERNAL' })
  })

  it('rejects traversal and outside-vault paths with VAULT_OUTSIDE_PATH', async () => {
    for (const path of ['../evil.md', '/etc/hosts.md', 'projects/../../evil.md']) {
      await expect(
        client.invoke('note.setFrontmatter', { path, key: 'status', value: 'x', identity: dana }),
      ).rejects.toMatchObject({ code: 'VAULT_OUTSIDE_PATH' })
    }
  })

  it('refuses without a usable identity', async () => {
    await expect(
      client.invoke('note.setFrontmatter', {
        path: NOTE,
        key: 'status',
        value: 'x',
        identity: { name: '', email: 'bad' },
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL', message: expect.stringContaining('identity') })
  })
})
