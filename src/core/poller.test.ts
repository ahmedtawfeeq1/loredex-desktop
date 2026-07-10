/**
 * Story 9.1: remote-event poller — parse fixtures, cursor discipline, gating
 * truth table (fake git), and a two-clone fixture-remote integration: a push
 * from a second clone surfaces as handoff.new within ONE poll tick, without a
 * merge; integrate then pulls and reconciles.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CoreEvent } from '../shared/ipc-contract'
import type { SyncHealth } from '../shared/types'
import type { PollCursor } from './db/index'
import { gitAsync } from './git'
import {
  createPoller,
  deriveRemoteEvent,
  parseAttribution,
  type PollerDeps,
  touchedHandoffPaths,
} from './poller'

// ── pure parse fixtures ──────────────────────────────────────────────────────

describe('touchedHandoffPaths', () => {
  it('keeps handoff notes, follows renames, skips deletions and out-of-scope files', () => {
    const log = [
      'abc123',
      '',
      'A\tprojects/alpha/handoffs/2026-07-10-handoff-beta.md',
      'M\tprojects/alpha/handoffs/2026-07-01-handoff-beta.md',
      'D\tprojects/alpha/handoffs/gone.md',
      'R100\tprojects/alpha/handoffs/old.md\tprojects/alpha/handoffs/new.md',
      'M\tprojects/alpha/notes/not-a-handoff.md',
      'M\tStart Here - Product.md',
      'A\tprojects/alpha/handoffs/nested/too-deep.md',
    ].join('\n')
    expect(touchedHandoffPaths(log)).toEqual([
      'projects/alpha/handoffs/2026-07-10-handoff-beta.md',
      'projects/alpha/handoffs/2026-07-01-handoff-beta.md',
      'projects/alpha/handoffs/new.md',
    ])
  })

  it('dedupes a file touched by several commits in the window', () => {
    const log =
      'sha1\n\nM\tprojects/a/handoffs/x.md\nsha2\n\nA\tprojects/a/handoffs/x.md'
    expect(touchedHandoffPaths(log)).toEqual(['projects/a/handoffs/x.md'])
  })
})

describe('parseAttribution', () => {
  it('parses "Name <email>" and degrades honestly', () => {
    expect(parseAttribution('Dana Reyes <dana@nimbus.dev>')).toEqual({
      name: 'Dana Reyes',
      email: 'dana@nimbus.dev',
    })
    expect(parseAttribution('just-a-name')).toEqual({ name: 'just-a-name', email: 'unknown' })
    expect(parseAttribution(undefined)).toEqual({ name: 'unknown', email: 'unknown' })
  })
})

describe('deriveRemoteEvent', () => {
  const relPath = 'projects/alpha/handoffs/2026-07-10-handoff-beta.md'
  const remoteMeta = {
    status: 'open',
    from_project: 'beta',
    to_project: 'alpha',
    objective: 'Ship the poller',
    date: '2026-07-10',
    kind: 'request',
  }

  it('remote-only file → handoff.new with a board card', () => {
    const event = deriveRemoteEvent({
      vaultPath: '/v',
      relPath,
      remoteMeta,
      localMeta: null,
      today: '2026-07-10',
    })
    expect(event).toMatchObject({
      kind: 'handoff.new',
      handoff: {
        id: '2026-07-10-handoff-beta',
        from: 'beta',
        to: 'alpha',
        status: 'open',
        kind: 'request',
        path: '/v/projects/alpha/handoffs/2026-07-10-handoff-beta.md',
        expired: false,
      },
    })
  })

  it('status drift → handoff.stateChanged with attribution + detail payload', () => {
    const event = deriveRemoteEvent({
      vaultPath: '/v',
      relPath,
      remoteMeta: {
        ...remoteMeta,
        status: 'declined',
        declined_by: 'Kai Ora <kai@nimbus.dev>',
        declined_reason: 'superseded by the v2 spec',
      },
      localMeta: { ...remoteMeta },
    })
    expect(event).toEqual({
      kind: 'handoff.stateChanged',
      id: '2026-07-10-handoff-beta',
      from: 'open',
      to: 'declined',
      by: { name: 'Kai Ora', email: 'kai@nimbus.dev' },
      reason: 'superseded by the v2 spec',
    })
  })

  it('snooze carries until; same status and non-handoffs are silent', () => {
    const snoozed = deriveRemoteEvent({
      vaultPath: '/v',
      relPath,
      remoteMeta: {
        ...remoteMeta,
        status: 'snoozed',
        snoozed_by: 'Kai Ora <kai@nimbus.dev>',
        snoozed_until: '2026-07-20',
      },
      localMeta: { ...remoteMeta },
    })
    expect(snoozed).toMatchObject({ kind: 'handoff.stateChanged', until: '2026-07-20' })
    expect(
      deriveRemoteEvent({ vaultPath: '/v', relPath, remoteMeta, localMeta: { ...remoteMeta } }),
    ).toBeNull()
    expect(
      deriveRemoteEvent({
        vaultPath: '/v',
        relPath,
        remoteMeta: { type: 'comment', replies_to: 'x' }, // no status/from_project
        localMeta: null,
      }),
    ).toBeNull()
  })
})

// ── tick semantics against a scripted fake git ───────────────────────────────

interface FakeWorld {
  remoteSha: string
  behind: number
  dirty: boolean
  log: string
  show: Record<string, string>
  calls: string[]
}

function makeDeps(world: FakeWorld): {
  deps: PollerDeps
  events: CoreEvent[]
  cursorRef: { current: PollCursor | null }
  locked: { current: boolean }
  pulled: { current: number }
} {
  const events: CoreEvent[] = []
  const cursorRef = { current: null as PollCursor | null }
  const locked = { current: false }
  const pulled = { current: 0 }
  const health = { state: 'behind' } as SyncHealth
  const deps: PollerDeps = {
    vaultPath: '/v',
    remote: 'origin',
    emit: (event) => events.push(event),
    getCursor: () => cursorRef.current,
    setCursor: (cursor) => {
      world.calls.push(`cursor:${cursor.lastSeenSha}`)
      cursorRef.current = cursor
    },
    git: (args) => {
      world.calls.push(args.join(' '))
      const [cmd] = args
      if (cmd === 'rev-parse' && args[1] === '--abbrev-ref') return Promise.resolve('main\n')
      if (cmd === 'rev-parse') return Promise.resolve(`${world.remoteSha}\n`)
      if (cmd === 'fetch') return Promise.resolve('')
      if (cmd === 'log') return Promise.resolve(world.log)
      if (cmd === 'show') {
        const path = (args[1] as string).split(':')[1] as string
        const raw = world.show[path]
        return raw === undefined ? Promise.reject(new Error('gone')) : Promise.resolve(raw)
      }
      if (cmd === 'rev-list') return Promise.resolve(`${world.behind}\n`)
      if (cmd === 'status') return Promise.resolve(world.dirty ? ' M dirty.md\n' : '')
      return Promise.reject(new Error(`unexpected git ${args.join(' ')}`))
    },
    readLocalMeta: () => null,
    parseRemoteMeta: (raw) => JSON.parse(raw) as Record<string, unknown>,
    tryLock: () => {
      if (locked.current) return null
      return () => {}
    },
    pullAndReconcile: () => {
      pulled.current += 1
      world.behind = 0
      return Promise.resolve()
    },
    syncHealth: () => health,
  }
  return { deps, events, cursorRef, locked, pulled }
}

const openNote = JSON.stringify({
  status: 'open',
  from_project: 'beta',
  to_project: 'alpha',
  objective: 'x',
  date: '2026-07-10',
})

describe('poller tick', () => {
  it('fresh cursor seeds to origin/<branch> and emits nothing (no join storm)', async () => {
    const world: FakeWorld = {
      remoteSha: 'sha-1',
      behind: 0,
      dirty: false,
      log: 'A\tprojects/alpha/handoffs/x.md',
      show: { 'projects/alpha/handoffs/x.md': openNote },
      calls: [],
    }
    const { deps, events, cursorRef } = makeDeps(world)
    await createPoller(deps).tick()
    expect(events).toEqual([])
    expect(cursorRef.current).toMatchObject({ branch: 'main', lastSeenSha: 'sha-1' })
    expect(world.calls.some((c) => c.startsWith('log'))).toBe(false) // seed = no parse
  })

  it('new remote commits → events emitted BEFORE the cursor advances', async () => {
    const world: FakeWorld = {
      remoteSha: 'sha-2',
      behind: 0,
      dirty: false,
      log: 'sha-2\n\nA\tprojects/alpha/handoffs/x.md',
      show: { 'projects/alpha/handoffs/x.md': openNote },
      calls: [],
    }
    const { deps, events, cursorRef } = makeDeps(world)
    cursorRef.current = { branch: 'main', lastSeenSha: 'sha-1', lastFetchAt: null }
    const emitted: string[] = []
    const emitOrig = deps.emit
    deps.emit = (event) => {
      emitted.push(event.kind)
      world.calls.push(`emit:${event.kind}`)
      emitOrig(event)
    }
    await createPoller(deps).tick()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'handoff.new' })
    expect(cursorRef.current?.lastSeenSha).toBe('sha-2')
    // exactly-once discipline: emit strictly precedes the cursor write
    expect(world.calls.indexOf('emit:handoff.new')).toBeLessThan(
      world.calls.indexOf('cursor:sha-2'),
    )
  })

  it('unchanged remote sha refreshes lastFetchAt only', async () => {
    const world: FakeWorld = {
      remoteSha: 'sha-1',
      behind: 0,
      dirty: false,
      log: '',
      show: {},
      calls: [],
    }
    const { deps, events, cursorRef } = makeDeps(world)
    cursorRef.current = { branch: 'main', lastSeenSha: 'sha-1', lastFetchAt: null }
    await createPoller(deps).tick()
    expect(events).toEqual([])
    expect(cursorRef.current?.lastFetchAt).not.toBeNull()
  })

  it('gating truth table: pulls only when behind AND lock free AND clean', async () => {
    const cases: Array<{ behind: number; lock: boolean; dirty: boolean; pulls: number }> = [
      { behind: 0, lock: false, dirty: false, pulls: 0 }, // nothing to integrate
      { behind: 2, lock: true, dirty: false, pulls: 0 }, // busy → user work wins
      { behind: 2, lock: false, dirty: true, pulls: 0 }, // dirty tree → defer
      { behind: 2, lock: false, dirty: false, pulls: 1 }, // safe → integrate
    ]
    for (const c of cases) {
      const world: FakeWorld = {
        remoteSha: 'sha-1',
        behind: c.behind,
        dirty: c.dirty,
        log: '',
        show: {},
        calls: [],
      }
      const { deps, events, cursorRef, locked, pulled } = makeDeps(world)
      cursorRef.current = { branch: 'main', lastSeenSha: 'sha-1', lastFetchAt: null }
      locked.current = c.lock
      await createPoller(deps).tick()
      expect(pulled.current, JSON.stringify(c)).toBe(c.pulls)
      if (c.pulls > 0) {
        // after a pull: full-refetch signal + fresh health (F4)
        expect(events.map((e) => e.kind)).toEqual(['vault.changed', 'sync.changed'])
      } else if (c.behind > 0) {
        // deferred: sync health still says "behind N, integrating…"
        expect(events.map((e) => e.kind)).toEqual(['sync.changed'])
      }
    }
  })

  it('a failing fetch warns once, not once per tick (F8 without spam)', async () => {
    const world: FakeWorld = {
      remoteSha: 'sha-1',
      behind: 0,
      dirty: false,
      log: '',
      show: {},
      calls: [],
    }
    const { deps, events } = makeDeps(world)
    const gitOrig = deps.git
    deps.git = (args) =>
      args[0] === 'fetch' ? Promise.reject(new Error('remote hung up')) : gitOrig(args)
    const poller = createPoller(deps)
    await poller.tick()
    await poller.tick()
    expect(events.filter((e) => e.kind === 'git.warning')).toHaveLength(1)
  })
})

// ── two-clone fixture-remote integration (definition of done) ────────────────

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@nimbus.dev', ...args],
    { cwd, encoding: 'utf8' },
  )
}

const NOTE = `---
project: alpha
type: handoff
date: 2026-07-10
status: open
from_project: beta
to_project: alpha
objective: Ship the remote poller
loredex_schema: 2
---

## Objective

Ship the remote poller.
`

describe('two-clone fixture remote (integration)', () => {
  it('push from clone A → handoff.new in clone B within one tick, then integrate', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loredex-poller-'))
    const bare = join(root, 'origin.git')
    const cloneA = join(root, 'a')
    const cloneB = join(root, 'b')
    git(root, 'init', '--bare', '-b', 'main', bare)
    git(root, 'clone', bare, cloneA)
    mkdirSync(join(cloneA, 'projects/alpha/handoffs'), { recursive: true })
    writeFileSync(join(cloneA, 'README.md'), '# fixture vault\n')
    git(cloneA, 'add', '.')
    git(cloneA, 'commit', '-m', 'chore: scaffold')
    git(cloneA, 'push', '-u', 'origin', 'main')
    git(root, 'clone', bare, cloneB)

    const events: CoreEvent[] = []
    let cursor: PollCursor | null = null
    let reconciled = 0
    const deps: PollerDeps = {
      vaultPath: cloneB,
      remote: 'origin',
      emit: (event) => events.push(event),
      getCursor: () => cursor,
      setCursor: (next) => {
        cursor = next
      },
      git: (args) => gitAsync(cloneB, args),
      readLocalMeta: (relPath) => {
        const abs = join(cloneB, relPath)
        if (!existsSync(abs)) return null
        const meta: Record<string, unknown> = {}
        const fm = /^---\n([\s\S]*?)\n---/.exec(readFileSync(abs, 'utf8'))?.[1] ?? ''
        for (const line of fm.split('\n')) {
          const idx = line.indexOf(':')
          if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
        }
        return meta
      },
      parseRemoteMeta(raw) {
        const meta: Record<string, unknown> = {}
        const fm = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? ''
        for (const line of fm.split('\n')) {
          const idx = line.indexOf(':')
          if (idx > 0) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
        }
        return meta
      },
      tryLock: () => () => {},
      pullAndReconcile: async () => {
        await gitAsync(cloneB, ['pull', '--no-rebase', 'origin', 'main'])
        reconciled += 1
      },
      syncHealth: () => ({ state: 'behind' }) as SyncHealth,
    }
    const poller = createPoller(deps)

    // tick 1: fresh cursor seeds — no storm
    await poller.tick()
    expect(events).toEqual([])
    expect(cursor).not.toBeNull()

    // a teammate pushes a handoff from the second clone
    const rel = 'projects/alpha/handoffs/2026-07-10-handoff-beta.md'
    writeFileSync(join(cloneA, rel), NOTE)
    git(cloneA, 'add', '.')
    git(cloneA, 'commit', '-m', 'handoff: beta -> alpha')
    git(cloneA, 'push')

    // tick 2: the event lands within ONE poll tick, without merging first
    await poller.tick()
    const kinds = events.map((e) => e.kind)
    expect(kinds).toContain('handoff.new')
    const created = events.find((e) => e.kind === 'handoff.new')
    expect(created).toMatchObject({
      handoff: { id: '2026-07-10-handoff-beta', from: 'beta', to: 'alpha', status: 'open' },
    })
    // and the gated integrate pulled + reconciled: the note is on disk now
    expect(reconciled).toBe(1)
    expect(existsSync(join(cloneB, rel))).toBe(true)
    expect(kinds).toContain('vault.changed')
    expect((cursor as PollCursor | null)?.lastSeenSha).toBe(
      git(cloneB, 'rev-parse', 'origin/main').trim(),
    )
  }, 30_000)
})
