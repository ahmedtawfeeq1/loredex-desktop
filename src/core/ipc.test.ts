import { describe, expect, it } from 'vitest'
import { createIpcClient } from '../shared/ipc-client'
import type { Config, CoreEvent, ErrEnvelope, PortLike } from '../shared/ipc-contract'
import { createCoreIpc } from './ipc'

/** In-memory MessageChannel fake: two linked PortLike ends, async delivery. */
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

const fakeConfig: Config = { vaultPath: '/tmp/vault', sync: 'none', projects: {} }

function wiredPair() {
  const server = createCoreIpc()
  const client = createIpcClient({ timeoutMs: 200 })
  const [a, b] = fakePortPair()
  server.attach(a)
  client.attach(b)
  return { server, client }
}

describe('typed IPC seam', () => {
  it('round-trips a request/response', async () => {
    const { server, client } = wiredPair()
    server.register('config.get', () => fakeConfig)
    await expect(client.invoke('config.get', undefined)).resolves.toEqual(fakeConfig)
  })

  it('rejects unknown channels with NOT_IMPLEMENTED', async () => {
    const { client } = wiredPair()
    await expect(client.invoke('sync.run', undefined)).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    })
  })

  it('wraps handler throws in a typed envelope (never crashes)', async () => {
    const { server, client } = wiredPair()
    server.register('config.get', () => {
      throw new Error('boom')
    })
    server.register('vault.readNote', () => {
      throw { code: 'VAULT_OUTSIDE_PATH', message: 'outside' } satisfies ErrEnvelope
    })
    await expect(client.invoke('config.get', undefined)).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'boom',
    })
    await expect(client.invoke('vault.readNote', { path: '/etc/passwd' })).rejects.toMatchObject({
      code: 'VAULT_OUTSIDE_PATH',
    })
  })

  it('ignores malformed wire payloads and keeps serving', async () => {
    const server = createCoreIpc()
    const client = createIpcClient({ timeoutMs: 200 })
    const [a, b] = fakePortPair()
    server.attach(a)
    client.attach(b)
    server.register('config.get', () => fakeConfig)
    b.postMessage({ garbage: true })
    b.postMessage(42)
    b.postMessage({ t: 'req', ch: 'config.get' }) // missing id
    await expect(client.invoke('config.get', undefined)).resolves.toEqual(fakeConfig)
  })

  it('fans events out to multiple listeners; unsubscribe works', async () => {
    const { server, client } = wiredPair()
    const seen: CoreEvent[][] = [[], []]
    const un1 = client.onEvent((e) => seen[0]!.push(e))
    client.onEvent((e) => seen[1]!.push(e))
    server.emit({ kind: 'git.warning', text: 'w1' })
    await new Promise((r) => setTimeout(r, 10))
    un1()
    server.emit({ kind: 'vault.changed', paths: ['a.md'] })
    await new Promise((r) => setTimeout(r, 10))
    expect(seen[0]).toHaveLength(1)
    expect(seen[1]).toHaveLength(2)
    expect(seen[1]![1]).toEqual({ kind: 'vault.changed', paths: ['a.md'] })
  })

  it('times out an unanswered invoke with a TIMEOUT envelope', async () => {
    const client = createIpcClient({ timeoutMs: 20 })
    const [, b] = fakePortPair() // no server attached
    client.attach(b)
    await expect(client.invoke('config.get', undefined)).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
  })

  it('survives a port swap: pending rejected retryable, new port serves', async () => {
    const server = createCoreIpc()
    const client = createIpcClient({ timeoutMs: 500 })
    const [a, b] = fakePortPair()
    server.attach(a)
    client.attach(b)
    server.register('config.get', () => new Promise(() => {})) // never answers
    const stuck = client.invoke('config.get', undefined)

    // respawned core host: fresh server, fresh brokered pair
    const server2 = createCoreIpc()
    server2.register('config.get', () => fakeConfig)
    const [a2, b2] = fakePortPair()
    server2.attach(a2)
    const events: CoreEvent[] = []
    client.onEvent((e) => events.push(e))
    client.attach(b2)

    await expect(stuck).rejects.toMatchObject({
      code: 'PORT_SWAPPED',
      detail: { retryable: true },
    })
    await expect(client.invoke('config.get', undefined)).resolves.toEqual(fakeConfig)
    server2.emit({ kind: 'git.warning', text: 'after swap' })
    await new Promise((r) => setTimeout(r, 10))
    expect(events).toContainEqual({ kind: 'git.warning', text: 'after swap' })
  })
})
