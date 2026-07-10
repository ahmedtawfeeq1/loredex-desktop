/**
 * QA M2 end-to-end module drive (no UI) — the full loop over the core host:
 *
 *   compose request → reply → accept → fulfilling delivery → thread rail →
 *   poller sees a second-clone push (handoff.new + gated integrate) →
 *   atlas edges update → contract timeline reads the REAL nimbus-backend
 *   openapi/postman git history.
 *
 * Runs only where the local nimbus simulation exists (skipped elsewhere).
 * Everything git-mutating happens in sandboxed clones of a sandboxed bare
 * remote — the simulation vault and its remote are never written; the
 * nimbus-backend repo is read via `git log`/`git show` only.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient, type IpcClient } from '../src/shared/ipc-client'
import type { PortLike } from '../src/shared/ipc-contract'
import { invalidateAtlas } from '../src/core/atlas'
import { getPollCursor, initAppDb, setPollCursor, vaultId, type AppDb } from '../src/core/db/index'
import * as engine from '../src/core/engine'
import { clearFacetCache } from '../src/core/facets'
import { gitAsync } from '../src/core/git'
import { registerCoreHandlers } from '../src/core/handlers'
import { createCoreIpc, type CoreIpc } from '../src/core/ipc'
import { invalidateLinkIndex } from '../src/core/links'
import { createPoller, type Poller } from '../src/core/poller'
import { initSettings } from '../src/core/settings'
import { writeLock } from '../src/core/write-lock'

const SIM = resolve(import.meta.dirname, '../../loredex-simulation')
const hasSim = existsSync(join(SIM, 'vault-remote.git')) && existsSync(join(SIM, 'nimbus-backend'))

const dana = { name: 'Dana Reyes', email: 'dana@nimbus.dev' }
const omar = { name: 'Omar Farouk', email: 'omar@nimbus.dev' }

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

describe.skipIf(!hasSim)('M2 end-to-end module drive (sandboxed nimbus clones)', () => {
  let sandbox: string
  let origin: string
  let machineA: string // the app's vault
  let machineB: string // the teammate's clone
  let db: AppDb
  let vid: string
  let client: IpcClient
  let ipc: CoreIpc
  let poller: Poller
  const events: Array<Record<string, unknown>> = []

  let requestId: string // compose result (lands in nimbus-frontend/handoffs)
  let deliveryId: string // fulfilling delivery (lands in nimbus-backend/handoffs)

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'loredex-m2-drive-'))
    origin = join(sandbox, 'origin.git')
    machineA = join(sandbox, 'machineA')
    machineB = join(sandbox, 'machineB')
    // sandboxed bare remote — the simulation's remote is cloned, never touched
    git(sandbox, 'clone', '--bare', '--quiet', join(SIM, 'vault-remote.git'), origin)
    git(sandbox, 'clone', '--quiet', origin, machineA)
    git(sandbox, 'clone', '--quiet', origin, machineB)
    for (const clone of [machineA, machineB]) {
      git(clone, 'config', 'user.name', clone === machineA ? dana.name : omar.name)
      git(clone, 'config', 'user.email', clone === machineA ? dana.email : omar.email)
    }

    const configDir = join(sandbox, 'config')
    mkdirSync(configDir)
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ vaultPath: machineA, sync: 'git', projects: {} }),
    )
    process.env.LOREDEX_CONFIG_DIR = configDir

    const userData = join(sandbox, 'userData')
    mkdirSync(userData)
    const config = engine.initEngine(machineA)
    expect(config?.vaultPath).toBe(machineA)
    const opened = initAppDb(userData)
    if (!opened) throw new Error('app.db failed to open')
    db = opened
    initSettings(userData)
    vid = vaultId(machineA, engine.identity().remote)

    ipc = createCoreIpc()
    const notifier = registerCoreHandlers(ipc)
    notifier.refresh()
    client = createIpcClient({ timeoutMs: 30000 })
    const handlers: [Array<(d: unknown) => void>, Array<(d: unknown) => void>] = [[], []]
    const make = (mine: 0 | 1): PortLike => ({
      postMessage: (data) => {
        queueMicrotask(() => {
          for (const cb of handlers[mine === 0 ? 1 : 0]) cb(data)
        })
      },
      onMessage: (cb) => handlers[mine].push(cb),
    })
    ipc.attach(make(0))
    client.attach(make(1))
    client.onEvent((e) => events.push(e as unknown as Record<string, unknown>))

    // poller wired exactly like src/core/index.ts (fetch outside the lock,
    // tryAcquire, pull+reconcile under it), against the sandbox remote
    const reconcile = (): void => {
      invalidateLinkIndex()
      clearFacetCache()
      invalidateAtlas()
      notifier.refresh()
    }
    poller = createPoller({
      vaultPath: machineA,
      remote: 'origin',
      emit: (event) => ipc.emit(event),
      getCursor: () => getPollCursor(db, vid),
      setCursor: (cursor) => setPollCursor(db, vid, cursor),
      git: (args) => gitAsync(machineA, args),
      readLocalMeta: (relPath) => {
        try {
          return engine.noteMeta(join(machineA, relPath))
        } catch {
          return null
        }
      },
      parseRemoteMeta: (raw) => engine.parseMarkdown(raw).meta as Record<string, unknown>,
      tryLock: () => writeLock.tryAcquire(),
      pullAndReconcile: async () => {
        engine.pullPush()
        engine.rebuildVaultIndexes()
        reconcile()
      },
      syncHealth: () => engine.syncHealth(),
    })
  }, 120_000)

  it('composes a request handoff and pushes it to the shared remote', async () => {
    const res = await client.invoke('handoffs.create', {
      input: {
        fromProject: 'nimbus-backend',
        toProject: 'nimbus-frontend',
        objective: 'QA drive: need a client for the v2 agent-config endpoint',
        kind: 'request',
        notes: [],
      },
      identity: dana,
    })
    requestId = res.id
    expect(res.pushed).toBe(true)
    expect(res.path).toContain('projects/nimbus-frontend/handoffs/')
    // the note is schema v2 on disk
    const raw = readFileSync(join(machineA, res.path.replace(`${machineA}/`, '')), 'utf8')
    expect(raw).toContain('loredex_schema: 2')
    expect(raw).toContain('kind: request')
    // …and genuinely on the remote (push happened)
    const remoteLog = git(origin, 'log', '-1', '--name-only')
    expect(remoteLog).toContain(`projects/nimbus-frontend/handoffs/${requestId}.md`)
    expect(events.some((e) => e.kind === 'handoff.created')).toBe(true)
  }, 60_000)

  it('replies from the recipient project (route inverted, replies_to set)', async () => {
    const res = await client.invoke('handoffs.reply', {
      parentId: `nimbus-frontend/${requestId}`,
      input: { objective: 'QA drive: questions before I accept', kind: 'delivery', notes: [] },
      identity: omar,
    })
    expect(res.path).toContain('projects/nimbus-backend/handoffs/') // inverted route
    const rel = res.path.startsWith('/') ? res.path.replace(`${machineA}/`, '') : res.path
    const raw = readFileSync(join(machineA, rel), 'utf8')
    expect(raw).toContain(`replies_to: ${requestId}`)
  }, 60_000)

  it('accepts the request via the v2 state machine and receipts it', async () => {
    const receipt = await client.invoke('handoffs.setStatus', {
      id: `nimbus-frontend/${requestId}`,
      transition: { to: 'accepted' },
      identity: omar,
    })
    expect(receipt.before.status ?? 'open').toBe('open')
    expect(receipt.after.status).toBe('accepted')
    expect(
      events.some((e) => e.kind === 'handoff.stateChanged' && e.to === 'accepted'),
    ).toBe(true)
    // illegal transition is refused with a typed envelope, not silence
    await expect(
      client.invoke('handoffs.setStatus', {
        id: `nimbus-frontend/${requestId}`,
        transition: { to: 'open' }, // reopen from accepted is illegal
        identity: omar,
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/accepted|transition/i) })
  }, 60_000)

  it('fulfills the request with a delivery and the thread rail sees the loop', async () => {
    const res = await client.invoke('handoffs.create', {
      input: {
        fromProject: 'nimbus-frontend',
        toProject: 'nimbus-backend',
        objective: 'QA drive: v2 agent-config client shipped',
        kind: 'delivery',
        notes: [],
        fulfills: requestId,
      },
      identity: omar,
    })
    deliveryId = res.id
    const thread = await client.invoke('handoffs.thread', { id: `nimbus-frontend/${requestId}` })
    // reply rides the rail; the fulfilling delivery closes the loop (8.2 + 8.3)
    expect(thread.replies.length).toBeGreaterThanOrEqual(1)
    expect(thread.fulfilledBy.map((c) => c.id)).toContain(deliveryId)
    const deliveryThread = await client.invoke('handoffs.thread', {
      id: `nimbus-backend/${deliveryId}`,
    })
    expect(deliveryThread.fulfills?.id).toBe(requestId)
  }, 60_000)

  it('poller: seeds quietly, then sees a second-clone push and integrates it', async () => {
    // tick #1 — fresh cursor seeds to origin/<branch>, emits nothing (AC3).
    // (the board notifier legitimately emitted handoff.new for the composed
    // cards above — scope the storm check to events produced by this tick)
    const beforeSeed = events.length
    await poller.tick()
    const seeded = getPollCursor(db, vid)
    expect(seeded?.lastSeenSha).toBeTruthy()
    expect(events.slice(beforeSeed).some((e) => e.kind === 'handoff.new')).toBe(false)
    const beforePush = events.length

    // the teammate pushes a brand-new handoff from the second clone
    git(machineB, 'pull', '--quiet')
    const relPath = 'projects/nimbus-mobile/handoffs/2026-07-10-handoff-qa-drive.md'
    writeFileSync(
      join(machineB, relPath),
      [
        '---',
        'project: nimbus-mobile',
        'topic: handoffs',
        'type: handoff',
        "date: '2026-07-10'",
        'from_project: nimbus-backend',
        'to_project: nimbus-mobile',
        'objective: QA drive — second-clone push the poller must notice',
        'status: open',
        'kind: request',
        'loredex_schema: 2',
        '---',
        '# Handoff — nimbus-backend → nimbus-mobile',
        '',
        '**Objective:** QA drive — second-clone push the poller must notice',
      ].join('\n'),
    )
    git(machineB, 'add', relPath)
    git(machineB, 'commit', '--quiet', '-m', 'loredex: handoff nimbus-backend -> nimbus-mobile')
    git(machineB, 'push', '--quiet')

    // tick #2 — fetch-only parse emits handoff.new, then the gated pull lands it
    await poller.tick()
    const pushed = events
      .slice(beforePush)
      .filter((e) => e.kind === 'handoff.new')
      .map((e) => (e.handoff as { id: string }).id)
    expect(pushed).toContain('2026-07-10-handoff-qa-drive')
    expect(existsSync(join(machineA, relPath))).toBe(true) // integrated
    const cursor = getPollCursor(db, vid)
    expect(cursor?.lastSeenSha).not.toBe(seeded?.lastSeenSha) // cursor advanced
  }, 120_000)

  it('atlas graph carries the new nodes and thread/route edges after the drive', async () => {
    const graph = await client.invoke('atlas.graph', { level: 'deep' })
    const ids = graph.nodes.map((n) => n.id)
    expect(ids.some((id) => id.includes(requestId))).toBe(true)
    expect(ids.some((id) => id.includes(deliveryId))).toBe(true)
    expect(ids.some((id) => id.includes('2026-07-10-handoff-qa-drive'))).toBe(true) // poller-pulled
    const threadEdges = graph.edges.filter((e) => e.category === 'thread')
    expect(threadEdges.some((e) => e.field === 'fulfills')).toBe(true)
    expect(threadEdges.some((e) => e.field === 'replies_to')).toBe(true)
    expect(graph.edges.some((e) => e.category === 'route')).toBe(true)
  }, 60_000)

  it('contract timeline reads the real nimbus-backend openapi history', async () => {
    await client.invoke('settings.projectRoots.set', {
      roots: { [join(SIM, 'nimbus-backend')]: { name: 'nimbus-backend' } },
    })
    const timeline = await client.invoke('contracts.timeline', {})
    const files = new Set(timeline.map((c) => c.file))
    expect(files.has('openapi.yaml')).toBe(true)
    // the real simulated history: agent-config v2 landed in 97d4b73
    const v2 = timeline.find((c) => c.sha.startsWith('97d4b73'))
    expect(v2).toBeTruthy()
    expect(v2?.project).toBe('nimbus-backend')
    // diff for that change opens pinned to the commit
    const diff = await client.invoke('contracts.diff', {
      repoRoot: join(SIM, 'nimbus-backend'),
      file: 'openapi.yaml',
      sha: timeline.find((c) => c.sha.startsWith('97d4b73'))?.sha ?? '',
    })
    expect(diff.truncated).toBe(false)
    expect(diff.unified).toContain('escalation_rules')
  }, 60_000)
})
