/**
 * E2E Nimbus suite (story 6.3) — the executable M1+M2 Definition of Done and
 * the release gate. Extends tests/m2-e2e-drive.test.ts into the full loop:
 *
 *   vault open → tree/read/wikilink → search facets → compose → reply →
 *   accept/decline/snooze → fulfill → consume with identity → poller
 *   integration (second clone pushes) → atlas graph/tours/blocked-on/path →
 *   contract timeline + pinned diff → activity grammar → sync loudness (F8) →
 *   create/join wizards (module level).
 *
 * Deterministic and self-contained: the Nimbus vault is a committed fixture
 * (tests/fixtures/nimbus-vault — a snapshot of the simulation vault's working
 * tree), seeded into a sandboxed local bare remote and cloned twice. The
 * contract repo history is seeded locally too. No LLM, no network, no
 * Electron — runs anywhere `npm run test:e2e` runs, CI included.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient, type IpcClient } from '../../src/shared/ipc-client'
import type { PortLike } from '../../src/shared/ipc-contract'
import { blockedRows } from '../../src/shared/blocked'
import { invalidateAtlas } from '../../src/core/atlas'
import { getPollCursor, initAppDb, setPollCursor, vaultId, type AppDb } from '../../src/core/db/index'
import * as engine from '../../src/core/engine'
import { clearFacetCache } from '../../src/core/facets'
import { gitAsync } from '../../src/core/git'
import { registerCoreHandlers } from '../../src/core/handlers'
import { createCoreIpc, type CoreIpc } from '../../src/core/ipc'
import { invalidateLinkIndex } from '../../src/core/links'
import { createPoller, type Poller } from '../../src/core/poller'
import { initSettings } from '../../src/core/settings'
import { writeLock } from '../../src/core/write-lock'

const FIXTURE = resolve(import.meta.dirname, '../fixtures/nimbus-vault')

const dana = { name: 'Dana Reyes', email: 'dana@nimbus.dev' }
const omar = { name: 'Omar Farouk', email: 'omar@nimbus.dev' }

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

const OPENAPI_V1 = [
  'openapi: 3.1.0',
  'info: { title: Nimbus API, version: 1.0.0 }',
  'paths:',
  '  /agents/config:',
  '    get: { summary: Read agent config }',
  '',
].join('\n')

const OPENAPI_V2 = [
  'openapi: 3.1.0',
  'info: { title: Nimbus API, version: 2.0.0 }',
  'paths:',
  '  /agents/config:',
  '    get: { summary: Read agent config }',
  '    put: { summary: Write agent config v2 }',
  'components:',
  '  schemas:',
  '    AgentConfigV2:',
  '      type: object',
  '      properties:',
  '        escalation_rules: { type: array }',
  '',
].join('\n')

describe('E2E Nimbus suite (sandboxed fixture clones, module level)', () => {
  let sandbox: string
  let origin: string // sandboxed bare "remote" of the Nimbus vault
  let machineA: string // the app's vault (Dana)
  let machineB: string // the teammate's clone (Omar)
  let contractRepo: string // seeded nimbus-backend contract history
  let contractV2Sha: string
  let db: AppDb
  let vid: string
  let client: IpcClient
  let ipc: CoreIpc
  let poller: Poller
  const events: Array<Record<string, unknown>> = []

  // Handoff basenames are only unique per handoffs/ dir — ids legally collide
  // across projects (the fixture has such collisions on purpose). The drive
  // therefore composes each lane from a DISTINCT from-project (request from
  // backend, reply/delivery from frontend, decline/snooze from ai-engine) so
  // its own thread names stay vault-unique on any calendar date, and negative
  // assertions below use vault-relative PATHS, never bare ids.
  let requestId: string // composed request (lands in nimbus-frontend/handoffs)
  let declinedId: string // request that gets declined
  let declinedRel = '' // …and its vault-relative path
  let snoozedId: string // request that gets snoozed
  let snoozedRel = ''
  let deliveryId: string // fulfilling delivery (lands in nimbus-backend/handoffs)
  let deliveryRel = ''

  beforeAll(async () => {
    sandbox = mkdtempSync(join(tmpdir(), 'loredex-e2e-nimbus-'))
    origin = join(sandbox, 'origin.git')
    machineA = join(sandbox, 'machineA')
    machineB = join(sandbox, 'machineB')

    // seed the committed fixture into a local bare remote, then clone twice —
    // the exact two-machine topology of the simulation, fully sandboxed
    git(sandbox, 'init', '--bare', '--quiet', '-b', 'main', origin)
    git(sandbox, 'clone', '--quiet', origin, machineA)
    cpSync(FIXTURE, machineA, { recursive: true })
    git(machineA, 'add', '-A')
    git(machineA, '-c', `user.name=${dana.name}`, '-c', `user.email=${dana.email}`,
      'commit', '--quiet', '-m', 'seed: nimbus vault fixture')
    git(machineA, 'push', '--quiet', '-u', 'origin', 'main')
    git(sandbox, 'clone', '--quiet', origin, machineB)
    for (const clone of [machineA, machineB]) {
      git(clone, 'config', 'user.name', clone === machineA ? dana.name : omar.name)
      git(clone, 'config', 'user.email', clone === machineA ? dana.email : omar.email)
    }

    // seeded contract history: openapi v1 → v2 (escalation_rules) → postman
    contractRepo = join(sandbox, 'nimbus-backend')
    mkdirSync(contractRepo)
    git(sandbox, 'init', '--quiet', '-b', 'main', contractRepo)
    git(contractRepo, 'config', 'user.name', dana.name)
    git(contractRepo, 'config', 'user.email', dana.email)
    writeFileSync(join(contractRepo, 'openapi.yaml'), OPENAPI_V1)
    git(contractRepo, 'add', '-A')
    git(contractRepo, 'commit', '--quiet', '-m', 'api: initial agent-config contract')
    writeFileSync(join(contractRepo, 'openapi.yaml'), OPENAPI_V2)
    git(contractRepo, 'add', '-A')
    git(contractRepo, 'commit', '--quiet', '-m', 'api: agent-config v2 adds escalation_rules')
    contractV2Sha = git(contractRepo, 'rev-parse', 'HEAD').trim()
    writeFileSync(join(contractRepo, 'postman_collection.json'), '{"info":{"name":"nimbus"}}\n')
    git(contractRepo, 'add', '-A')
    git(contractRepo, 'commit', '--quiet', '-m', 'api: postman collection')

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

    // core host wired exactly like src/core/index.ts, minus Electron
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

  // ── 1 · vault open ─────────────────────────────────────────────────────────

  it('opens the vault: config, identity badge, schema handshake', async () => {
    const config = await client.invoke('config.get', undefined)
    expect(config.vaultPath).toBe(machineA)
    const id = await client.invoke('app.identity', undefined)
    expect(id.vaultPath).toBe(machineA)
    expect(id.remote).toContain('origin.git')
    expect(id.engineVersion).toMatch(/^\d+\.\d+\.\d+/)
    const handshake = await client.invoke('sync.handshake', undefined)
    expect(handshake.ok).toBe(true)
    expect(handshake.schemaSupported).toBeGreaterThanOrEqual(2)
  }, 30_000)

  // ── 2 · tree / read / wikilink ─────────────────────────────────────────────

  it('walks the tree, reads a note, resolves wikilinks (unique, ambiguous, broken)', async () => {
    const tree = await client.invoke('vault.tree', undefined)
    const projects = tree.find((n) => n.path === 'projects')
    expect(projects?.children?.map((c) => c.name).sort()).toEqual([
      'nimbus-ai-engine',
      'nimbus-backend',
      'nimbus-frontend',
      'nimbus-mobile',
    ])

    const notePath = 'projects/nimbus-backend/handoffs/2026-07-09-handoff-nimbus-ai-engine.md'
    const doc = await client.invoke('vault.readNote', { path: notePath })
    expect(doc.meta.type).toBe('handoff')
    expect(doc.body).toContain('## Reading order')

    // unique wikilink → resolved to the one note (F9: no filesystem archaeology)
    const unique = await client.invoke('vault.resolveLink', {
      link: '2026-07-09-streaming-design',
      from: notePath,
    })
    expect(unique.status).toBe('resolved')
    expect(unique.target).toBe('projects/nimbus-ai-engine/streaming/2026-07-09-streaming-design.md')

    // colliding basename → ambiguous WITH candidates (the picker's data)
    const ambiguous = await client.invoke('vault.resolveLink', {
      link: '2026-07-09-findings',
      from: notePath,
    })
    expect(ambiguous.status).toBe('ambiguous')
    expect((ambiguous.candidates ?? []).length).toBeGreaterThanOrEqual(2)

    // dangling link → honest broken, never a crash
    const broken = await client.invoke('vault.resolveLink', {
      link: 'no-such-note-anywhere',
      from: notePath,
    })
    expect(broken.status).toBe('broken')
  }, 30_000)

  // ── 3 · search + facets ────────────────────────────────────────────────────

  it('searches full-text and narrows by frontmatter facets', async () => {
    const facets = await client.invoke('vault.facets', undefined)
    expect(facets.projects).toEqual(
      expect.arrayContaining(['nimbus-ai-engine', 'nimbus-backend', 'nimbus-frontend', 'nimbus-mobile']),
    )
    expect(facets.types).toContain('handoff')

    const all = await client.invoke('vault.search', { q: 'streaming' })
    expect(all.length).toBeGreaterThan(0)
    const narrowed = await client.invoke('vault.search', {
      q: 'streaming',
      facets: { project: 'nimbus-ai-engine' },
    })
    expect(narrowed.length).toBeGreaterThan(0)
    expect(narrowed.length).toBeLessThan(all.length)
    expect(narrowed.every((h) => h.project === 'nimbus-ai-engine')).toBe(true)
  }, 30_000)

  // ── 4 · compose ────────────────────────────────────────────────────────────

  it('composes a request handoff, pushes it, and the recipient inbox shows it', async () => {
    const res = await client.invoke('handoffs.create', {
      input: {
        fromProject: 'nimbus-backend',
        toProject: 'nimbus-frontend',
        objective: 'E2E: need a client for the v2 agent-config endpoint',
        kind: 'request',
        notes: [],
      },
      identity: dana,
    })
    requestId = res.id
    expect(res.pushed).toBe(true)
    expect(res.path).toContain('projects/nimbus-frontend/handoffs/')
    const raw = readFileSync(join(machineA, res.path.replace(`${machineA}/`, '')), 'utf8')
    expect(raw).toContain('loredex_schema: 2')
    expect(raw).toContain('kind: request')
    // genuinely on the remote — the second machine can see it
    const remoteLog = git(origin, 'log', '-1', '--name-only')
    expect(remoteLog).toContain(`projects/nimbus-frontend/handoffs/${requestId}.md`)
    expect(events.some((e) => e.kind === 'handoff.created')).toBe(true)
    // the board sees it in the recipient's inbox
    const inbox = await client.invoke('handoffs.list', { scope: 'inbox', project: 'nimbus-frontend' })
    expect(inbox.map((c) => c.id)).toContain(requestId)
  }, 60_000)

  // ── 5 · reply ──────────────────────────────────────────────────────────────

  it('replies from the recipient project (route inverted, replies_to set on disk)', async () => {
    const res = await client.invoke('handoffs.reply', {
      parentId: `nimbus-frontend/${requestId}`,
      input: { objective: 'E2E: questions before I accept', kind: 'delivery', notes: [] },
      identity: omar,
    })
    expect(res.path).toContain('projects/nimbus-backend/handoffs/') // inverted route
    const rel = res.path.startsWith('/') ? res.path.replace(`${machineA}/`, '') : res.path
    expect(readFileSync(join(machineA, rel), 'utf8')).toContain(`replies_to: ${requestId}`)
  }, 60_000)

  // ── 6 · accept / decline / snooze ──────────────────────────────────────────

  it('accepts via the v2 state machine and refuses an illegal transition loudly', async () => {
    const receipt = await client.invoke('handoffs.setStatus', {
      id: `nimbus-frontend/${requestId}`,
      transition: { to: 'accepted' },
      identity: omar,
    })
    expect(receipt.before.status ?? 'open').toBe('open')
    expect(receipt.after.status).toBe('accepted')
    expect(events.some((e) => e.kind === 'handoff.stateChanged' && e.to === 'accepted')).toBe(true)
    await expect(
      client.invoke('handoffs.setStatus', {
        id: `nimbus-frontend/${requestId}`,
        transition: { to: 'open' }, // reopen from accepted is illegal
        identity: omar,
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/accepted|transition/i) })
  }, 60_000)

  it('declines with a reason and snoozes with a date — both attributed and evented', async () => {
    const decline = await client.invoke('handoffs.create', {
      input: {
        fromProject: 'nimbus-ai-engine',
        toProject: 'nimbus-mobile',
        objective: 'E2E: request that will be declined',
        kind: 'request',
        notes: [],
      },
      identity: dana,
    })
    declinedId = decline.id
    declinedRel = decline.path.replace(`${machineA}/`, '')
    const declined = await client.invoke('handoffs.setStatus', {
      id: `nimbus-mobile/${declinedId}`,
      transition: { to: 'declined', reason: 'superseded by the v2 rollout plan' },
      identity: omar,
    })
    expect(declined.after.status).toBe('declined')
    expect(
      events.some(
        (e) =>
          e.kind === 'handoff.stateChanged' &&
          e.to === 'declined' &&
          e.reason === 'superseded by the v2 rollout plan',
      ),
    ).toBe(true)

    const snooze = await client.invoke('handoffs.create', {
      input: {
        fromProject: 'nimbus-ai-engine',
        toProject: 'nimbus-mobile',
        objective: 'E2E: request that will be snoozed',
        kind: 'request',
        notes: [],
      },
      identity: dana,
    })
    snoozedId = snooze.id
    snoozedRel = snooze.path.replace(`${machineA}/`, '')
    // far-future date: the suite must stay green regardless of the calendar
    const snoozed = await client.invoke('handoffs.setStatus', {
      id: `nimbus-mobile/${snoozedId}`,
      transition: { to: 'snoozed', until: '2126-01-01' },
      identity: omar,
    })
    expect(snoozed.after.status).toBe('snoozed')
    expect(String(snoozed.after.snoozed_until)).toBe('2126-01-01')
    expect(
      events.some((e) => e.kind === 'handoff.stateChanged' && e.to === 'snoozed' && e.until === '2126-01-01'),
    ).toBe(true)
  }, 60_000)

  // ── 7 · fulfill ────────────────────────────────────────────────────────────

  it('fulfills the request with a delivery and the thread rail closes the loop', async () => {
    const res = await client.invoke('handoffs.create', {
      input: {
        fromProject: 'nimbus-frontend',
        toProject: 'nimbus-backend',
        objective: 'E2E: v2 agent-config client shipped',
        kind: 'delivery',
        notes: [],
        fulfills: requestId,
      },
      identity: omar,
    })
    deliveryId = res.id
    deliveryRel = res.path.replace(`${machineA}/`, '')
    const thread = await client.invoke('handoffs.thread', { id: `nimbus-frontend/${requestId}` })
    expect(thread.replies.length).toBeGreaterThanOrEqual(1)
    expect(thread.fulfilledBy.map((c) => c.id)).toContain(deliveryId)
    const deliveryThread = await client.invoke('handoffs.thread', { id: `nimbus-backend/${deliveryId}` })
    expect(deliveryThread.fulfills?.id).toBe(requestId)
  }, 60_000)

  // ── 8 · consume with identity ──────────────────────────────────────────────

  it('consumes the delivery with identity — attributed on disk, receipted, board updated', async () => {
    const receipt = await client.invoke('handoffs.consume', {
      id: `nimbus-backend/${deliveryId}`,
      identity: dana,
    })
    expect(receipt.after.status).toBe('consumed')
    expect(receipt.after.consumed_by).toContain(dana.email) // F1: sender is never blind
    expect(receipt.pushed).toBe(true)
    expect(
      events.some((e) => e.kind === 'handoff.stateChanged' && e.to === 'consumed'),
    ).toBe(true)
    const all = await client.invoke('handoffs.list', { scope: 'all' })
    expect(all.find((c) => c.id === deliveryId)?.status).toBe('consumed')
  }, 60_000)

  // ── 9 · poller integration (second clone pushes) ───────────────────────────

  it('poller: seeds quietly, then a second-clone push produces handoff.new + integrate', async () => {
    const beforeSeed = events.length
    await poller.tick()
    const seeded = getPollCursor(db, vid)
    expect(seeded?.lastSeenSha).toBeTruthy()
    expect(events.slice(beforeSeed).some((e) => e.kind === 'handoff.new')).toBe(false)
    const beforePush = events.length

    // Omar pushes a brand-new open request from the second clone
    git(machineB, 'pull', '--quiet')
    const relPath = 'projects/nimbus-mobile/handoffs/2026-07-10-handoff-e2e-drive.md'
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
        'objective: E2E — second-clone push the poller must notice',
        'status: open',
        'kind: request',
        'loredex_schema: 2',
        '---',
        '# Handoff — nimbus-backend → nimbus-mobile',
        '',
        '**Objective:** E2E — second-clone push the poller must notice',
      ].join('\n'),
    )
    git(machineB, 'add', relPath)
    git(machineB, 'commit', '--quiet', '-m', 'loredex: handoff nimbus-backend -> nimbus-mobile')
    git(machineB, 'push', '--quiet')

    await poller.tick()
    const pushed = events
      .slice(beforePush)
      .filter((e) => e.kind === 'handoff.new')
      .map((e) => (e.handoff as { id: string }).id)
    expect(pushed).toContain('2026-07-10-handoff-e2e-drive')
    expect(existsSync(join(machineA, relPath))).toBe(true) // gated integrate landed it
    expect(getPollCursor(db, vid)?.lastSeenSha).not.toBe(seeded?.lastSeenSha) // cursor advanced
  }, 120_000)

  // ── 10 · atlas: graph / tours / blocked-on / path ──────────────────────────

  it('atlas graph carries the drive: nodes, thread + route edges, clusters', async () => {
    const graph = await client.invoke('atlas.graph', { level: 'deep' })
    const ids = graph.nodes.map((n) => n.id)
    expect(ids.some((id) => id.includes(requestId))).toBe(true)
    expect(ids.some((id) => id.includes(deliveryId))).toBe(true)
    expect(ids.some((id) => id.includes('2026-07-10-handoff-e2e-drive'))).toBe(true) // poller-pulled
    const threadEdges = graph.edges.filter((e) => e.category === 'thread')
    expect(threadEdges.some((e) => e.field === 'fulfills')).toBe(true)
    expect(threadEdges.some((e) => e.field === 'replies_to')).toBe(true)
    expect(graph.edges.some((e) => e.category === 'route')).toBe(true)
    expect(graph.clusters.map((c) => c.project)).toEqual(
      expect.arrayContaining(['nimbus-backend', 'nimbus-frontend', 'nimbus-mobile', 'nimbus-ai-engine']),
    )
  }, 60_000)

  it('atlas tours extract from reading orders and threads; path tracing connects the loop', async () => {
    const tours = await client.invoke('atlas.tours', {})
    expect(tours.some((t) => t.kind === 'reading-order' && !t.heuristic && t.steps.length > 0)).toBe(true)
    expect(tours.some((t) => t.kind === 'thread')).toBe(true)

    // BFS path between the request and its fulfilling delivery rides the edges
    const graph = await client.invoke('atlas.graph', { level: 'deep' })
    const reqNode = graph.nodes.find((n) => n.id.includes(requestId))
    const delNode = graph.nodes.find((n) => n.id.includes(deliveryId))
    expect(reqNode && delNode).toBeTruthy()
    const path = await client.invoke('atlas.path', {
      from: (reqNode as { id: string }).id,
      to: (delNode as { id: string }).id,
    })
    expect(path?.nodeIds.length).toBeGreaterThanOrEqual(2)
  }, 60_000)

  it('blocked-on derives from the one blocking rule: open requests block their route', async () => {
    const cards = await client.invoke('handoffs.list', { scope: 'all' })
    const rows = blockedRows(cards, machineA)
    const drive = rows.find((r) => r.id === '2026-07-10-handoff-e2e-drive')
    expect(drive?.sentence).toBe('nimbus-mobile is blocked on nimbus-backend')
    // declined + consumed never block; snoozed (not yet expired) doesn't
    // either — asserted by path (bare ids collide across projects by design)
    const paths = rows.map((r) => r.relPath)
    expect(paths).not.toContain(declinedRel)
    expect(paths).not.toContain(snoozedRel)
    expect(paths).not.toContain(deliveryRel)
  }, 30_000)

  // ── 11 · contract timeline + diff ──────────────────────────────────────────

  it('contract timeline scans the seeded repo history and serves the pinned diff', async () => {
    await client.invoke('settings.projectRoots.set', {
      roots: { [contractRepo]: { name: 'nimbus-backend' } },
    })
    const timeline = await client.invoke('contracts.timeline', {})
    const files = new Set(timeline.map((c) => c.file))
    expect(files.has('openapi.yaml')).toBe(true)
    expect(files.has('postman_collection.json')).toBe(true)
    const v2 = timeline.find((c) => c.sha === contractV2Sha)
    expect(v2).toBeTruthy()
    expect(v2?.project).toBe('nimbus-backend')
    const diff = await client.invoke('contracts.diff', {
      repoRoot: contractRepo,
      file: 'openapi.yaml',
      sha: contractV2Sha,
    })
    expect(diff.truncated).toBe(false)
    expect(diff.unified).toContain('escalation_rules')
  }, 60_000)

  // ── 12 · activity grammar ──────────────────────────────────────────────────

  it('activity feed types every drive commit through the grammar, identity-attributed', async () => {
    const feed = await client.invoke('activity.feed', {})
    // the four composes + the reply + the second clone's push → handoff events
    const handoffEvents = feed.filter((e) => e.kind === 'handoff')
    expect(handoffEvents.length).toBeGreaterThanOrEqual(5)
    // lifecycle transitions → status events carrying the handoff id
    const statusEvents = feed.filter((e) => e.kind === 'status')
    expect(statusEvents.length).toBeGreaterThanOrEqual(3) // accepted, declined, snoozed
    expect(statusEvents.every((e) => Boolean(e.subject.handoffId))).toBe(true)
    // the consume is attributed to Dana and names the handoff
    const consume = feed.find((e) => e.kind === 'consume')
    expect(consume?.actor.email).toBe(dana.email)
    expect(consume?.subject.handoffId).toBe(deliveryId)
    // the seed commit is generic sync — never dropped silently
    expect(feed.some((e) => e.kind === 'sync')).toBe(true)
    // newest first (non-increasing author dates)
    const dates = feed.map((e) => e.at)
    expect(dates.every((d, i) => i === 0 || d <= (dates[i - 1] as string))).toBe(true)
  }, 30_000)

  // ── 13 · sync health loudness (F8) ─────────────────────────────────────────

  it('F8: corrupted gitattributes pattern warns LOUDLY in sync health, then repairs', async () => {
    const gitDir = git(machineA, 'rev-parse', '--absolute-git-dir').trim()
    const attributesPath = join(gitDir, 'info', 'attributes')
    // the exact historical F8 corruption: backslash-escaped spaces (invalid in
    // gitattributes) replacing the quoted rule
    writeFileSync(attributesPath, 'Start\\ Here\\ -\\ Product.md merge=loredex-generated\n')
    const broken = await client.invoke('sync.status', undefined)
    expect(broken.gitattributesValid).toBe(false)
    expect(broken.warnings.some((w) => /merge driver/.test(w))).toBe(true) // never silent
    engine.ensureMergeDriverAt(machineA) // the repair path
    const repaired = await client.invoke('sync.status', undefined)
    expect(repaired.mergeDriverInstalled).toBe(true)
    expect(repaired.gitattributesValid).toBe(true)
  }, 30_000)

  // ── 14 · wizards (module level) ────────────────────────────────────────────

  it('create-vault wizard: preflight validates, scaffold pushes, cursor seeds', async () => {
    await client.invoke('settings.identity.set', dana) // wizard commits are attributed

    // preflight: unreachable is a typed, disk-untouched failure
    const bad = await client.invoke('wizard.validateRemote', { url: join(sandbox, 'nope.git') })
    expect(bad.reachable).toBe(false)

    const wizardRemote = join(sandbox, 'wizard-remote.git')
    git(sandbox, 'init', '--bare', '--quiet', '-b', 'main', wizardRemote)
    const check = await client.invoke('wizard.validateRemote', { url: wizardRemote })
    expect(check).toMatchObject({ reachable: true, empty: true })

    const dir = join(sandbox, 'wizard-machine1', 'vault')
    const result = await client.invoke('wizard.createVault', { dir, remoteUrl: wizardRemote })
    expect(result).toEqual({ vaultPath: dir, remoteWired: true })
    for (const p of ['projects', '_index/Home.md', '.loredex/engine.json']) {
      expect(existsSync(join(dir, p)), p).toBe(true)
    }
    const refs = git(sandbox, 'ls-remote', wizardRemote, 'refs/heads/*')
    expect(refs).toContain('refs/heads/main')
    // step progress streamed for the modal
    expect(events.some((e) => e.kind === 'wizard.progress' && e.flow === 'create' && e.status === 'done')).toBe(true)
  }, 60_000)

  it('join-vault wizard: second machine clones the created vault, board-ready, no storm', async () => {
    const wizardRemote = join(sandbox, 'wizard-remote.git')
    const dest = join(sandbox, 'wizard-machine2', 'vault')
    const beforeJoin = events.length
    const result = await client.invoke('wizard.joinVault', { url: wizardRemote, dest })
    expect(result).toEqual({ vaultPath: dest, schemaOk: true })
    expect(existsSync(join(dest, '_index/Home.md'))).toBe(true)
    // merge driver wired in the clone (F8 never happens on a wizard join)
    expect(readFileSync(join(dest, '.git', 'info', 'attributes'), 'utf8')).toContain(
      '_index/** merge=loredex-generated',
    )
    // the join emitted ONLY wizard.progress — a quiet cursor seed, no handoff storm
    const joinEvents = events.slice(beforeJoin)
    expect(joinEvents.length).toBeGreaterThan(0)
    expect(joinEvents.every((e) => e.kind === 'wizard.progress')).toBe(true)
    expect(joinEvents.some((e) => e.step === 'clone' && e.status === 'done')).toBe(true)
  }, 60_000)
})
