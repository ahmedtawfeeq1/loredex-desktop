/**
 * Story 8.2: thread graph — pure edge-model tests (chains, comments, missing
 * refs, cross-project resolution, cycle guard) + the handoffs.thread channel
 * against a real request → delivery → comment chain written by the lib.
 */
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient, type IpcClient } from '../shared/ipc-client'
import { isErrEnvelope, type PortLike } from '../shared/ipc-contract'
import type { HandoffCard } from '../shared/types'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc, type CoreIpc } from './ipc'
import { initSettings } from './settings'
import { buildThread, collectComments, type ThreadSource } from './threads'

// ── pure edge-model tests ────────────────────────────────────────────────────

const V = '/v'
const card = (
  id: string,
  project: string,
  extra: Partial<HandoffCard> = {},
): HandoffCard => ({
  id,
  name: id,
  from: 'a',
  to: project,
  objective: `do ${id}`,
  date: '2026-07-10',
  ageDays: 0,
  status: 'open',
  path: `${V}/projects/${project}/handoffs/${id}.md`,
  readingOrder: [],
  kind: 'delivery',
  expired: false,
  ...extra,
})

/** resolver over the synthetic cards: unique basename match, else null */
function sourceOf(cards: HandoffCard[], comments: ThreadSource['comments'] = []): ThreadSource {
  const paths = [...cards.map((c) => c.path.slice(V.length + 1)), ...comments.map((c) => c.path)]
  return {
    vaultPath: V,
    cards,
    comments,
    resolveName: (name) => {
      const hits = paths.filter((p) => p.endsWith(`/${name}.md`))
      return hits.length === 1 ? (hits[0] as string) : null
    },
  }
}

describe('buildThread (pure edge model)', () => {
  it('walks ancestors and depth-first replies through a transitive chain', () => {
    const root = card('root', 'web', { kind: 'request' })
    const mid = card('mid', 'api', { repliesTo: 'root' })
    const leaf = card('leaf', 'web', { repliesTo: 'mid' })
    const s = sourceOf([root, mid, leaf])

    const fromLeaf = buildThread(s, 'leaf')
    expect(fromLeaf?.ancestors.map((n) => n.id)).toEqual(['root', 'mid'])
    expect(fromLeaf?.replies).toEqual([])

    const fromRoot = buildThread(s, 'root')
    expect(fromRoot?.ancestors).toEqual([])
    expect(fromRoot?.replies.map((n) => [n.id, n.depth])).toEqual([
      ['mid', 1],
      ['leaf', 2],
    ])
  })

  it('rides comments on the rail with lighter identity, never as board cards', () => {
    const root = card('root', 'web')
    const s = sourceOf(
      [root],
      [
        {
          path: 'projects/web/handoffs/2026-07-10-comment-nice.md',
          meta: { type: 'comment', replies_to: 'root', date: '2026-07-10' },
          title: 'Nice work',
        },
      ],
    )
    const t = buildThread(s, 'root')
    expect(t?.replies.map((n) => [n.id, n.kind, n.objective])).toEqual([
      ['2026-07-10-comment-nice', 'comment', 'Nice work'],
    ])
    expect(t?.replies[0]?.status).toBe('')
  })

  it('resolves cross-project names by qualified focus and unique basename', () => {
    const webCard = card('2026-07-09-handoff', 'web')
    const apiCard = card('other', 'api', { repliesTo: '2026-07-09-handoff' })
    const t = buildThread(sourceOf([webCard, apiCard]), 'web/2026-07-09-handoff')
    expect(t?.replies.map((n) => n.id)).toEqual(['other'])
    // unknown focus → null (handler maps to UNKNOWN_HANDOFF)
    expect(buildThread(sourceOf([webCard]), 'api/2026-07-09-handoff')).toBeNull()
  })

  it('reports dangling replies_to/fulfills as diagnostics, never crashing', () => {
    const orphan = card('orphan', 'web', { repliesTo: 'deleted-note', fulfills: 'also-gone' })
    const t = buildThread(sourceOf([orphan]), 'orphan')
    expect(t?.ancestors).toEqual([])
    expect(t?.broken).toEqual([
      { ownerId: 'orphan', field: 'replies_to', name: 'deleted-note' },
      { ownerId: 'orphan', field: 'fulfills', name: 'also-gone' },
    ])
  })

  it('guards replies_to cycles instead of hanging', () => {
    const a = card('a', 'web', { repliesTo: 'b' })
    const b = card('b', 'api', { repliesTo: 'a' })
    const t = buildThread(sourceOf([a, b]), 'a')
    expect(t?.ancestors.map((n) => n.id)).toEqual(['b'])
    expect(t?.replies).toEqual([]) // b is already an ancestor — never doubled on the rail
  })

  it('derives fulfills both ways (story 8.3 feeds off this)', () => {
    const request = card('the-request', 'api', { kind: 'request' })
    const delivery = card('the-delivery', 'web', { fulfills: 'the-request' })
    const s = sourceOf([request, delivery])
    expect(buildThread(s, 'the-delivery')?.fulfills?.id).toBe('the-request')
    expect(buildThread(s, 'the-request')?.fulfilledBy.map((n) => n.id)).toEqual(['the-delivery'])
  })
})

describe('collectComments', () => {
  it('keeps only readable type:comment notes inside handoffs dirs', () => {
    const docs: Record<string, { meta: Record<string, unknown>; body: string }> = {
      'projects/web/handoffs/c1.md': {
        meta: { type: 'comment', replies_to: 'x' },
        body: '# Title one\n\nbody',
      },
      'projects/web/handoffs/note.md': { meta: { type: 'handoff' }, body: '# Not a comment' },
      'projects/web/research/c2.md': { meta: { type: 'comment' }, body: '# Outside handoffs' },
    }
    const comments = collectComments(
      [...Object.keys(docs), 'projects/web/handoffs/broken.md'],
      new Set(),
      (rel) => {
        const doc = docs[rel]
        if (!doc) throw new Error('unreadable')
        return doc
      },
    )
    expect(comments).toEqual([
      {
        path: 'projects/web/handoffs/c1.md',
        meta: { type: 'comment', replies_to: 'x' },
        title: 'Title one',
      },
    ])
  })
})

// ── the channel against a real lib-written chain ────────────────────────────

const FIXTURE_VAULT = resolve(import.meta.dirname, '../../tests/fixtures/vault')
const dana = { name: 'Dana Reyes', email: 'dana@nimbus.dev' }
const API_NOTE = '2026-07-02 - nimbus-api - rate limiting research'

let vault: string
let client: IpcClient
let ipc: CoreIpc

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
  const sandbox = mkdtempSync(join(tmpdir(), 'loredex-threads-'))
  vault = join(sandbox, 'vault')
  cpSync(FIXTURE_VAULT, vault, { recursive: true })
  const configDir = mkdtempSync(join(tmpdir(), 'loredex-threads-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'none', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
  initSettings(mkdtempSync(join(tmpdir(), 'loredex-threads-userdata-')))

  ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 30000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
})

describe('handoffs.thread over the seam (request → delivery → comment)', () => {
  it('serves the rail in order and refreshes as notes land', async () => {
    const request = await client.invoke('handoffs.create', {
      input: {
        fromProject: 'nimbus-api',
        toProject: 'nimbus-web',
        objective: 'Need the quota meter shipped',
        kind: 'request',
        notes: [API_NOTE],
      },
      identity: dana,
    })
    const reply = await client.invoke('handoffs.reply', {
      parentId: `nimbus-web/${request.id}`,
      input: { objective: 'Quota meter shipped', kind: 'delivery', notes: [] },
      identity: dana,
    })
    const comment = await client.invoke('handoffs.annotate', {
      id: `nimbus-web/${request.id}`,
      title: 'Sizing note',
      body: 'Half a day, tops.',
      identity: dana,
    })

    // thread on the request: reply + comment ride the rail, depth 1 each
    const onRequest = await client.invoke('handoffs.thread', { id: `nimbus-web/${request.id}` })
    expect(onRequest.ancestors).toEqual([])
    const rail = onRequest.replies.map((n) => [n.id, n.kind, n.depth])
    expect(rail).toContainEqual([reply.id, 'delivery', 1])
    expect(rail).toContainEqual([comment.id, 'comment', 1])
    expect(onRequest.broken).toEqual([])

    // thread on the delivery: the request is its ancestor
    const onReply = await client.invoke('handoffs.thread', { id: `nimbus-api/${reply.id}` })
    expect(onReply.ancestors.map((n) => n.id)).toEqual([request.id])
    // comments never surface as board cards (lanes come from listHandoffs)
    const cards = await client.invoke('handoffs.list', { scope: 'all' })
    expect(cards.some((c) => c.id === comment.id)).toBe(false)
  })

  it('flags a dangling replies_to as a diagnostic on the focused card', async () => {
    writeFileSync(
      join(vault, 'projects/nimbus-web/handoffs/2026-07-10-handoff-dangling.md'),
      [
        '---',
        'type: handoff',
        'status: open',
        'from_project: nimbus-api',
        'to_project: nimbus-web',
        'objective: points at a deleted parent',
        'date: 2026-07-10',
        'replies_to: deleted-forever',
        '---',
        '# Dangling',
        '',
      ].join('\n'),
    )
    const t = await client.invoke('handoffs.thread', {
      id: 'nimbus-web/2026-07-10-handoff-dangling',
    })
    expect(t.broken).toEqual([
      { ownerId: '2026-07-10-handoff-dangling', field: 'replies_to', name: 'deleted-forever' },
    ])
    expect(t.ancestors).toEqual([])
  })

  it('unknown focus maps to UNKNOWN_HANDOFF, never a crash', async () => {
    await expect(
      client.invoke('handoffs.thread', { id: 'nimbus-web/never-existed' }),
    ).rejects.toSatisfy((e: unknown) => isErrEnvelope(e) && e.code === 'UNKNOWN_HANDOFF')
  })
})
