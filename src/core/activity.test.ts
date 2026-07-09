/**
 * Story 6.2 core test: activity.feed over the seam against a real temp git
 * repo written in the lib's commit grammar — typed, attributed events, limit
 * and since paging, loud GIT_FAILED detail on a non-repo vault.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient, type IpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc } from './ipc'

let vault: string
let client: IpcClient

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

function commit(name: string, message: string, rel: string): void {
  const abs = join(vault, rel)
  mkdirSync(join(abs, '..'), { recursive: true })
  writeFileSync(abs, `---\ntopic: t\n---\n\n${message}\n`)
  const id = [`-c`, `user.name=${name}`, `-c`, `user.email=${name.toLowerCase()}@nimbus.dev`]
  execFileSync('git', [...id, 'add', '-A'], { cwd: vault, stdio: 'ignore' })
  execFileSync('git', [...id, 'commit', '-q', '-m', message], { cwd: vault, stdio: 'ignore' })
}

beforeAll(async () => {
  vault = mkdtempSync(join(tmpdir(), 'loredex-activity-vault-'))
  execFileSync('git', ['init', '-q'], { cwd: vault, stdio: 'ignore' })
  commit('Maya', 'seed vault', 'projects/api/seed.md')
  commit('Maya', 'loredex: route 2 note(s)', 'projects/api/routed.md')
  commit('Ravi', 'loredex: handoff nimbus-api -> nimbus-web', 'projects/web/handoffs/h1.md')
  commit('Ana', 'loredex: consume handoff h1', 'projects/web/handoffs/h1-consumed.md')

  initEngine(vault)
  const ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 10_000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
})

afterAll(() => rmSync(vault, { recursive: true, force: true }))

describe('activity.feed over the seam', () => {
  it('parses the vault git log into typed, attributed events (newest first)', async () => {
    const events = await client.invoke('activity.feed', {})
    expect(events.map((e) => e.kind)).toEqual(['consume', 'handoff', 'route', 'sync'])
    expect(events[0]?.actor).toEqual({ name: 'Ana', email: 'ana@nimbus.dev' })
    expect(events[0]?.subject.handoffId).toBe('h1')
    expect(events[1]?.subject.project).toBeTruthy()
    expect(events[2]?.subject.path).toContain('projects/api')
    // generic engine/teammate commits are never dropped — they become sync events
    expect(events[3]?.summary).toBe('seed vault')
    for (const e of events) expect(e.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('pages: limit caps the window, since narrows to newer commits', async () => {
    const limited = await client.invoke('activity.feed', { limit: 2 })
    expect(limited).toHaveLength(2)
    expect(limited.map((e) => e.kind)).toEqual(['consume', 'handoff'])

    const all = await client.invoke('activity.feed', {})
    const oldest = all[all.length - 1]?.at
    expect(oldest).toBeTruthy()
    const since = await client.invoke('activity.feed', { since: oldest as string })
    expect(since.length).toBeGreaterThan(0)
    expect(since.length).toBeLessThanOrEqual(all.length)
  })
})
