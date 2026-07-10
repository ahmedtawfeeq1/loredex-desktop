/**
 * Perf pass on a 1,200-note synthetic vault (story 15.2).
 *
 * The generator (scripts/generate-perf-vault.mjs, committed) builds a
 * deterministic loredex-shaped vault into a mkdtemp sandbox; the core host is
 * wired exactly like production (engine + handlers + IPC dispatch, same
 * pattern as tests/m2-e2e-drive.test.ts) and every budget is asserted on the
 * seam the renderer actually waits on. Budgets are generous but real —
 * headroom for parallel-suite load noise, tight enough that an added O(n²)
 * still trips. Measured numbers are logged as evidence.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generatePerfVault } from '../scripts/generate-perf-vault.mjs'
import { invalidateAtlas } from '../src/core/atlas'
import { initAppDb, getPollCursor, setPollCursor, vaultId, type AppDb } from '../src/core/db/index'
import * as engine from '../src/core/engine'
import { gitAsync } from '../src/core/git'
import { registerCoreHandlers } from '../src/core/handlers'
import { createCoreIpc, type CoreIpc } from '../src/core/ipc'
import { createPoller, type Poller } from '../src/core/poller'
import { initSettings } from '../src/core/settings'
import { walkVault } from '../src/core/tree'
import { writeLock } from '../src/core/write-lock'
import { createIpcClient, type IpcClient } from '../src/shared/ipc-client'
import type { PortLike } from '../src/shared/ipc-contract'

// The six recorded numbers (AC2/AC3) and their budgets, in one place.
const BUDGET_MS = {
  'cold vault open': 2000,
  'tree build': 250,
  'search latency': 300,
  'atlas graph build (cold)': 2000,
  'atlas projection (warm)': 300,
  // subprocess-bound (4 git spawns): ~410 ms solo, but spawn scheduling under
  // the full parallel suite is noisy — min-of-3 + headroom. A real regression
  // (per-file `git show` in the no-change path) costs 30 s+, still trips.
  'poller tick (no changes)': 3000,
} as const
type Metric = keyof typeof BUDGET_MS

const measured = new Map<Metric, number>()
function record(metric: Metric, ms: number): void {
  measured.set(metric, ms)
  expect(ms, `${metric} blew its ${BUDGET_MS[metric]} ms budget`).toBeLessThan(BUDGET_MS[metric])
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

describe('perf pass — 1,200-note synthetic vault (story 15.2)', () => {
  let sandbox: string
  let vault: string
  let db: AppDb
  let vid: string
  let ipc: CoreIpc
  let client: IpcClient
  let poller: Poller

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'loredex-perf-'))
    vault = join(sandbox, 'vault')
    mkdirSync(vault)
    const counts = generatePerfVault(vault)
    expect(counts.files).toBeGreaterThanOrEqual(1200)
    expect(counts.handoffs).toBeGreaterThanOrEqual(100)

    // a real git vault with a local bare origin — the poller needs a remote
    git(vault, 'init', '-q', '-b', 'main')
    git(vault, 'config', 'user.name', 'Perf Bot')
    git(vault, 'config', 'user.email', 'perf@nimbus.dev')
    git(vault, 'add', '-A')
    git(vault, 'commit', '-q', '-m', 'chore: synthetic perf vault')
    git(sandbox, 'clone', '--bare', '--quiet', vault, join(sandbox, 'origin.git'))
    git(vault, 'remote', 'add', 'origin', join(sandbox, 'origin.git'))

    const configDir = join(sandbox, 'config')
    mkdirSync(configDir)
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ vaultPath: vault, sync: 'git', projects: {} }),
    )
    process.env.LOREDEX_CONFIG_DIR = configDir

    const userData = join(sandbox, 'userData')
    mkdirSync(userData)
    engine.initEngine(vault)
    const opened = initAppDb(userData)
    if (!opened) throw new Error('app.db failed to open')
    db = opened
    initSettings(userData)
    vid = vaultId(vault, engine.identity().remote)

    // production-shaped IPC pair (invoke crosses the dispatcher, like the app)
    ipc = createCoreIpc()
    client = createIpcClient({ timeoutMs: 60_000 })
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
  }, 120_000)

  afterAll(() => {
    poller?.stop()
    const rows = [...measured.entries()].map(
      ([metric, ms]) => `  ${metric.padEnd(28)} ${ms.toFixed(1).padStart(8)} ms   (budget ${BUDGET_MS[metric]} ms)`,
    )
    console.log(`[perf 15.2] 1,200-note vault measurements:\n${rows.join('\n')}`)
  })

  it('generator is deterministic — same seed, byte-identical vault (AC1)', () => {
    const digest = (dir: string): string => {
      const h = createHash('sha256')
      const visit = (rel: string): void => {
        for (const e of readdirSync(join(dir, rel), { withFileTypes: true }).sort((a, b) =>
          a.name.localeCompare(b.name),
        )) {
          const p = rel ? `${rel}/${e.name}` : e.name
          if (e.isDirectory()) visit(p)
          else {
            h.update(p)
            h.update(readFileSync(join(dir, p)))
          }
        }
      }
      visit('')
      return h.digest('hex')
    }
    const a = join(sandbox, 'det-a')
    const b = join(sandbox, 'det-b')
    mkdirSync(a)
    mkdirSync(b)
    generatePerfVault(a, { notes: 60 })
    generatePerfVault(b, { notes: 60 })
    expect(digest(a)).toBe(digest(b))
  }, 30_000)

  it('cold vault open — handlers + notifier + first tree + board < 2 s', async () => {
    const t0 = performance.now()
    const notifier = registerCoreHandlers(ipc)
    notifier.refresh()
    const tree = await client.invoke('vault.tree', undefined)
    const cards = await client.invoke('handoffs.list', { scope: 'all' })
    record('cold vault open', performance.now() - t0)
    expect(tree.length).toBeGreaterThan(0)
    expect(cards.length).toBeGreaterThanOrEqual(100) // the lib parses every synthetic card
  }, 60_000)

  it('tree build — walkVault over 1,200+ files < 250 ms', () => {
    const t0 = performance.now()
    const tree = walkVault(vault)
    record('tree build', performance.now() - t0)
    expect(tree.length).toBeGreaterThan(0)
  }, 30_000)

  it('search latency — facet-narrowed vault.search < 300 ms', async () => {
    const t0 = performance.now()
    const hits = await client.invoke('vault.search', {
      q: 'vault index latency',
      facets: { project: 'nimbus-web' },
    })
    record('search latency', performance.now() - t0)
    expect(Array.isArray(hits)).toBe(true)
  }, 30_000)

  it('atlas — cold base build < 2 s, warm drilled projection < 300 ms', async () => {
    invalidateAtlas() // guarantee a cold build (the tree fetch warmed it)
    const t0 = performance.now()
    const overview = await client.invoke('atlas.graph', { level: 'overview' })
    record('atlas graph build (cold)', performance.now() - t0)
    expect(overview.nodes.length).toBeGreaterThanOrEqual(8) // the 8 project clusters

    const t1 = performance.now()
    const deep = await client.invoke('atlas.graph', {
      level: 'deep',
      scope: { project: 'nimbus-api' },
    })
    record('atlas projection (warm)', performance.now() - t1)
    expect(deep.nodes.length).toBeGreaterThan(0)
  }, 60_000)

  it('poller tick — fetch + parse + gate with no remote changes < 3 s (min of 3)', async () => {
    poller = createPoller({
      vaultPath: vault,
      remote: 'origin',
      emit: (event) => ipc.emit(event),
      getCursor: () => getPollCursor(db, vid),
      setCursor: (cursor) => setPollCursor(db, vid, cursor),
      git: (args) => gitAsync(vault, args),
      readLocalMeta: (relPath) => {
        try {
          return engine.noteMeta(join(vault, relPath))
        } catch {
          return null
        }
      },
      parseRemoteMeta: (raw) => engine.parseMarkdown(raw).meta as Record<string, unknown>,
      tryLock: () => writeLock.tryAcquire(),
      pullAndReconcile: async () => {
        engine.pullPush()
        engine.rebuildVaultIndexes()
      },
      syncHealth: () => engine.syncHealth(),
    })
    await poller.tick() // first tick seeds the cursor (join discipline)
    expect(getPollCursor(db, vid)).not.toBeNull()

    // min of 3 steady-state ticks (fetch, same sha, behind 0): the tick is
    // subprocess-bound, and min is the load-noise-robust statistic
    let best = Number.POSITIVE_INFINITY
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now()
      await poller.tick()
      best = Math.min(best, performance.now() - t0)
    }
    record('poller tick (no changes)', best)
  }, 60_000)
})
