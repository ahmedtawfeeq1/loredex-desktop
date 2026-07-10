/**
 * Story 5.2 core tests over the seam against a real temp git vault:
 * sync.status truth grid, the executable F8 regression (broken gitattributes
 * → merge-driver FAIL + warning), handshake mismatch matrix (ok / newer-vault
 * / pre-versioning), and sync.run's report + emitted events.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient, type IpcClient } from '../shared/ipc-client'
import type { CoreEvent, PortLike } from '../shared/ipc-contract'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc } from './ipc'

let vault: string
let client: IpcClient
const events: CoreEvent[] = []

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

const git = (...args: string[]): void => {
  execFileSync('git', args, { cwd: vault, stdio: 'ignore' })
}

const VALID_ATTRIBUTES = `_index/** merge=loredex-generated\n"Start Here - Product.md" merge=loredex-generated\n`
const BROKEN_ATTRIBUTES = `Start\\ Here\\ -\\ Product.md merge=loredex-generated\n`

const note = (rel: string, frontmatter: string): void => {
  const abs = join(vault, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, `---\n${frontmatter}\n---\n\nbody\n`)
}

beforeAll(async () => {
  vault = mkdtempSync(join(tmpdir(), 'loredex-sync-vault-'))
  note('projects/api/2026-07-01 - a.md', 'topic: auth\nloredex_schema: 1')
  git('init', '-q')
  git('-c', 'user.name=Test', '-c', 'user.email=t@e.st', 'add', '-A')
  git('-c', 'user.name=Test', '-c', 'user.email=t@e.st', 'commit', '-q', '-m', 'seed')
  git('config', 'merge.loredex-generated.driver', 'true')
  mkdirSync(join(vault, '.git', 'info'), { recursive: true })
  writeFileSync(join(vault, '.git', 'info', 'attributes'), VALID_ATTRIBUTES)

  initEngine(vault)
  const ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 15_000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
  client.onEvent((e) => events.push(e))
})

afterAll(() => rmSync(vault, { recursive: true, force: true }))

describe('sync.status (lib syncStatus over the seam)', () => {
  it('reports the full truth grid for a healthy local-only repo', async () => {
    const health = await client.invoke('sync.status', undefined)
    expect(health.state).toBe('ok')
    expect(health.branch).toBeTruthy()
    expect(health.remote).toBeNull() // local-only fixture
    expect(health.mergeDriverInstalled).toBe(true)
    expect(health.gitattributesValid).toBe(true)
    expect(health.warnings.join(' ')).toContain('no git remote')
  })

  it('F8 regression: broken gitattributes pattern → INVALID + loud warning', async () => {
    writeFileSync(join(vault, '.git', 'info', 'attributes'), BROKEN_ATTRIBUTES)
    const health = await client.invoke('sync.status', undefined)
    expect(health.gitattributesValid).toBe(false)
    expect(health.warnings.join(' ')).toContain('merge driver')
    writeFileSync(join(vault, '.git', 'info', 'attributes'), VALID_ATTRIBUTES) // repair
  })
})

describe('sync.handshake mismatch matrix (NFR8)', () => {
  it('vault at the supported schema → ok, no warning event', async () => {
    events.length = 0
    const handshake = await client.invoke('sync.handshake', undefined)
    expect(handshake.ok).toBe(true)
    expect(handshake.schemaDeclared).toBe(1)
    expect(handshake.engineVersion).toMatch(/^\d+\./)
    expect(events.filter((e) => e.kind === 'git.warning')).toHaveLength(0)
  })

  it('vault written by a NEWER engine → not ok + prominent git.warning', async () => {
    note('projects/api/2026-07-09 - future.md', 'topic: auth\nloredex_schema: 99')
    events.length = 0
    const handshake = await client.invoke('sync.handshake', undefined)
    expect(handshake.ok).toBe(false)
    expect(handshake.schemaDeclared).toBe(99)
    const warnings = events.filter((e) => e.kind === 'git.warning')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.kind === 'git.warning' && warnings[0].text).toContain('schema 99')
    rmSync(join(vault, 'projects/api/2026-07-09 - future.md'))
  })

  it('pre-versioning vault (no stamps) → ok with declared null', async () => {
    note('projects/web/plain.md', 'topic: layout')
    rmSync(join(vault, 'projects/api/2026-07-01 - a.md'))
    const handshake = await client.invoke('sync.handshake', undefined)
    expect(handshake).toMatchObject({ ok: true, schemaDeclared: null })
  })
})

describe('sync.run (write op under the lock)', () => {
  it('returns a structured SyncReport and emits sync.changed + git.warning events', async () => {
    events.length = 0
    const report = await client.invoke('sync.run', undefined)
    // no remote: nothing pulled or pushed; health warnings ride the report
    expect(report.pulled).toBe(0)
    expect(report.pushed).toBe(false)
    expect(report.warnings.join(' ')).toContain('no git remote')
    await new Promise((r) => setTimeout(r, 10)) // event fan-out is microtasked
    expect(events.some((e) => e.kind === 'sync.changed')).toBe(true)
    // F8: every report warning was ALSO emitted as a git.warning event
    const emitted = events.filter((e) => e.kind === 'git.warning').map((e) => e.kind === 'git.warning' && e.text)
    for (const w of report.warnings) expect(emitted).toContain(w)
  }, 30_000) // parallel-suite contention: git ops under full-suite load exceed the 5s default
})
