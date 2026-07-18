/**
 * Terminal pty session manager (terminal-splits blueprint 2026-07-18):
 * ~8ms output batching, flush-before-exit ordering, cwd validation, id
 * lifecycle (idempotent kill, TERM_UNKNOWN), the 16-session cap, and the
 * quit hook — all against a MOCKED node-pty (terminals.ts loads it lazily,
 * so the native module never touches this test; no real shells spawn).
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIpcClient } from '../shared/ipc-client'
import type { CoreEvent, ErrEnvelope, PortLike } from '../shared/ipc-contract'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc } from './ipc'
import { killAllTerminals, termCreate, termInput, termKill, termResize } from './terminals'

interface FakePty {
  dataCb: ((d: string) => void) | null
  exitCb: ((e: { exitCode: number; signal?: number }) => void) | null
  killed: boolean
  writes: string[]
  resizes: Array<{ cols: number; rows: number }>
  onData(cb: (d: string) => void): { dispose(): void }
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): { dispose(): void }
  write(d: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

const fake = vi.hoisted(() => ({
  spawned: [] as unknown[],
  spawnArgs: [] as Array<{ file: string; args: string[]; opts: Record<string, unknown> }>,
}))

vi.mock('node-pty', () => ({
  spawn: (file: string, args: string[], opts: Record<string, unknown>) => {
    const p: FakePty = {
      dataCb: null,
      exitCb: null,
      killed: false,
      writes: [],
      resizes: [],
      onData(cb) {
        p.dataCb = cb
        return { dispose: () => {} }
      },
      onExit(cb) {
        p.exitCb = cb
        return { dispose: () => {} }
      },
      write(d) {
        p.writes.push(d)
      },
      resize(cols, rows) {
        p.resizes.push({ cols, rows })
      },
      kill() {
        p.killed = true
      },
    }
    fake.spawned.push(p)
    fake.spawnArgs.push({ file, args, opts })
    return p
  },
}))

const dir = mkdtempSync(join(tmpdir(), 'loredex-terminals-'))
const filePath = join(dir, 'not-a-dir.txt')
writeFileSync(filePath, 'x')

const events: CoreEvent[] = []
const emit = (e: CoreEvent): void => {
  events.push(e)
}

const lastPty = (): FakePty => fake.spawned[fake.spawned.length - 1] as FakePty

async function createOne(): Promise<{ id: string; pty: FakePty }> {
  const { id } = await termCreate(emit, { cwd: dir, cols: 80, rows: 24 })
  return { id, pty: lastPty() }
}

async function caught(p: Promise<unknown>): Promise<ErrEnvelope> {
  return (await p.then(
    () => {
      throw new Error('expected rejection')
    },
    (e: unknown) => e,
  )) as ErrEnvelope
}

beforeEach(() => {
  fake.spawned.length = 0
  fake.spawnArgs.length = 0
  events.length = 0
})

afterEach(() => {
  killAllTerminals()
  vi.useRealTimers()
})

describe('termCreate', () => {
  it('spawns an xterm-256color pty at the given cwd and grid', async () => {
    const { id } = await createOne()
    expect(id).toBeTruthy()
    expect(fake.spawnArgs[0]!.opts).toMatchObject({
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: dir,
    })
  })

  it('rejects a FILE cwd with TERM_CWD_INVALID — the path never rides the message', async () => {
    const err = await caught(termCreate(emit, { cwd: filePath, cols: 80, rows: 24 }))
    expect(err).toMatchObject({ code: 'TERM_CWD_INVALID' })
    expect(err.message).not.toContain(filePath)
    expect(fake.spawned).toHaveLength(0) // validation happens before any spawn
  })

  it('rejects a MISSING path with the same envelope', async () => {
    const err = await caught(
      termCreate(emit, { cwd: join(dir, 'no-such-dir'), cols: 80, rows: 24 }),
    )
    expect(err).toMatchObject({ code: 'TERM_CWD_INVALID' })
  })

  it('enforces the 16-terminal cap', async () => {
    for (let i = 0; i < 16; i++) await createOne()
    const err = await caught(termCreate(emit, { cwd: dir, cols: 80, rows: 24 }))
    expect(err).toMatchObject({ code: 'INTERNAL' })
    expect(err.message).toContain('terminal limit')
    expect(fake.spawned).toHaveLength(16)
  })
})

describe('output batching (~8ms window)', () => {
  beforeEach(() => vi.useFakeTimers())

  it('coalesces chunks inside the window into ONE term.data emit', async () => {
    const { id, pty } = await createOne()
    pty.dataCb!('hel')
    pty.dataCb!('lo')
    expect(events).toHaveLength(0) // nothing until the flush timer fires
    vi.advanceTimersByTime(8)
    expect(events).toEqual([{ kind: 'term.data', id, data: 'hello' }])
  })

  it('a chunk after a flush starts a new batch (second emit)', async () => {
    const { id, pty } = await createOne()
    pty.dataCb!('first')
    vi.advanceTimersByTime(8)
    pty.dataCb!('second')
    vi.advanceTimersByTime(8)
    expect(events).toEqual([
      { kind: 'term.data', id, data: 'first' },
      { kind: 'term.data', id, data: 'second' },
    ])
  })

  it('exit flushes pending output BEFORE term.exit and removes the session', async () => {
    const { id, pty } = await createOne()
    pty.dataCb!('tail')
    pty.exitCb!({ exitCode: 3 })
    expect(events).toEqual([
      { kind: 'term.data', id, data: 'tail' }, // pending buffer lands first
      { kind: 'term.exit', id, code: 3 },
    ])
    vi.advanceTimersByTime(20) // the batching timer was cleared — no ghost emit
    expect(events).toHaveLength(2)
    expect(() => termInput(id, 'x')).toThrowError() // session gone
  })
})

describe('input / resize / kill lifecycle', () => {
  it('termInput and termResize forward to the pty', async () => {
    const { id, pty } = await createOne()
    termInput(id, 'ls\n')
    termResize(id, 120, 40)
    expect(pty.writes).toEqual(['ls\n'])
    expect(pty.resizes).toEqual([{ cols: 120, rows: 40 }])
  })

  it('unknown ids throw TERM_UNKNOWN; termKill on an unknown id is a no-op', () => {
    let inputErr: unknown
    let resizeErr: unknown
    try {
      termInput('nope', 'x')
    } catch (e) {
      inputErr = e
    }
    try {
      termResize('nope', 80, 24)
    } catch (e) {
      resizeErr = e
    }
    expect(inputErr).toMatchObject({ code: 'TERM_UNKNOWN' })
    expect(resizeErr).toMatchObject({ code: 'TERM_UNKNOWN' })
    expect(() => termKill('nope')).not.toThrow() // close-pane can race the exit
  })

  it('termKill kills the pty, clears the pending flush, removes the session', async () => {
    vi.useFakeTimers()
    const { id, pty } = await createOne()
    pty.dataCb!('pending output')
    termKill(id)
    expect(pty.killed).toBe(true)
    vi.advanceTimersByTime(20)
    expect(events).toHaveLength(0) // no post-mortem term.data
    let err: unknown
    try {
      termInput(id, 'x')
    } catch (e) {
      err = e
    }
    expect(err).toMatchObject({ code: 'TERM_UNKNOWN' })
  })

  it('killAllTerminals (quit hook) kills every session and clears timers', async () => {
    vi.useFakeTimers()
    const one = await createOne()
    const two = await createOne()
    one.pty.dataCb!('a')
    two.pty.dataCb!('b')
    killAllTerminals()
    expect(one.pty.killed).toBe(true)
    expect(two.pty.killed).toBe(true)
    vi.advanceTimersByTime(20)
    expect(events).toHaveLength(0)
  })
})

// ── Registration smoke: bare core host (no engine init, no app db) ──────────

/** In-memory MessageChannel fake — ipc.test.ts pattern. */
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

describe('registration smoke over the seam', () => {
  it('settings.terminal.get degrades to closed/280 with no vault/db open', async () => {
    const ipc = createCoreIpc()
    registerCoreHandlers(ipc)
    const client = createIpcClient({ timeoutMs: 5000 })
    const [a, b] = fakePortPair()
    ipc.attach(a)
    client.attach(b)
    await expect(client.invoke('settings.terminal.get', undefined)).resolves.toEqual({
      open: false,
      height: 280,
    })
    // explicit bad cwd travels the seam as a typed envelope (no engine needed)
    await expect(
      client.invoke('term.create', { cwd: filePath, cols: 80, rows: 24 }),
    ).rejects.toMatchObject({ code: 'TERM_CWD_INVALID' })
  })
})
