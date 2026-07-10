/**
 * Stories 7.2/7.3/7.4 integration: the M2 handoff writers and the route
 * channels over the seam — every write goes through the lib exports only,
 * announces itself as events, and maps lib failures to typed envelopes.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient, type IpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc, type CoreIpc } from './ipc'
import { initSettings } from './settings'

const FIXTURE_VAULT = resolve(import.meta.dirname, '../../tests/fixtures/vault')
const dana = { name: 'Dana Reyes', email: 'dana@nimbus.dev' }
// a real note of nimbus-api in the fixture vault (collectNotes name = basename)
const API_NOTE = '2026-07-02 - nimbus-api - rate limiting research'

let sandbox: string
let vault: string
let client: IpcClient
let ipc: CoreIpc
const events: Array<Record<string, unknown>> = []

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
  sandbox = mkdtempSync(join(tmpdir(), 'loredex-compose-'))
  vault = join(sandbox, 'vault')
  cpSync(FIXTURE_VAULT, vault, { recursive: true })
  const configDir = mkdtempSync(join(tmpdir(), 'loredex-compose-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'none', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
  initSettings(mkdtempSync(join(tmpdir(), 'loredex-compose-userdata-')))

  ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 30000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
  client.onEvent((e) => events.push(e as unknown as Record<string, unknown>))
})

describe('handoffs.create over the seam (story 7.2)', () => {
  it('writes the v2 note at the canonical dest and announces card + vault change', async () => {
    const result = await client.invoke('handoffs.create', {
      input: {
        fromProject: 'nimbus-api',
        toProject: 'nimbus-web',
        objective: 'Ship the quota meter',
        kind: 'request',
        notes: [API_NOTE],
        nextActions: ['read the research first'],
        body: 'Context in the linked note.',
      },
      identity: dana,
    })
    expect(result.pushed).toBe(false) // sync: none — honest
    const rel = result.path.slice(vault.length + 1)
    expect(rel.startsWith('projects/nimbus-web/handoffs/')).toBe(true)

    const doc = await client.invoke('vault.readNote', { path: rel })
    expect(doc.meta).toMatchObject({
      from_project: 'nimbus-api',
      to_project: 'nimbus-web',
      status: 'open',
      kind: 'request',
      loredex_schema: 2,
    })
    expect(doc.body).toContain(`1. [[${API_NOTE}]]`) // reading order, verbatim
    expect(doc.body).toContain('Context in the linked note.')

    // optimistic-insert event carries the full board card (AC3)
    const created = events.find((e) => e.kind === 'handoff.created')
    expect(created).toMatchObject({ relPath: rel })
    expect((created?.card as Record<string, unknown>).id).toBe(result.id)
    expect(events).toContainEqual({ kind: 'vault.changed', paths: [rel] })
  })

  it('maps lib validation to actionable envelopes — unknown note, missing identity', async () => {
    const input = {
      fromProject: 'nimbus-api',
      toProject: 'nimbus-web',
      objective: 'x',
      kind: 'delivery' as const,
      notes: ['no-such-note'],
    }
    await expect(client.invoke('handoffs.create', { input, identity: dana })).rejects.toMatchObject(
      { code: 'INTERNAL', message: expect.stringContaining('unknown note') },
    )
    await expect(
      client.invoke('handoffs.create', {
        input: { ...input, notes: [] },
        identity: { name: '', email: 'not-an-email' },
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL', message: expect.stringContaining('identity') })
  })
})

describe('handoffs.reply + handoffs.annotate (story 7.3)', () => {
  it('reply inverts the route and sets replies_to; qualified parent ids resolve', async () => {
    const result = await client.invoke('handoffs.reply', {
      parentId: 'nimbus-web/2026-07-04-handoff-nimbus-web',
      input: { objective: 'Meter shipped', kind: 'delivery', notes: [] },
      identity: dana,
    })
    const rel = result.path.slice(vault.length + 1)
    const doc = await client.invoke('vault.readNote', { path: rel })
    // parent was api → web, so the reply routes web → api
    expect(doc.meta).toMatchObject({
      from_project: 'nimbus-web',
      to_project: 'nimbus-api',
      replies_to: '2026-07-04-handoff-nimbus-web',
      status: 'open',
    })
  })

  it('unknown parent → UNKNOWN_HANDOFF envelope', async () => {
    await expect(
      client.invoke('handoffs.reply', {
        parentId: 'nope',
        input: { objective: 'x', kind: 'delivery', notes: [] },
        identity: dana,
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_HANDOFF' })
  })

  it('annotate files a comment note and never mutates the handoff itself', async () => {
    const parentRel = 'projects/nimbus-web/handoffs/2026-07-01-handoff-nimbus-web-error-codes.md'
    const before = readFileSync(join(vault, parentRel), 'utf8')

    const result = await client.invoke('handoffs.annotate', {
      id: 'nimbus-web/2026-07-01-handoff-nimbus-web-error-codes',
      title: 'Scope question',
      body: 'Does this include 429 pages?',
      identity: dana,
    })
    const doc = await client.invoke('vault.readNote', {
      path: result.path.slice(vault.length + 1),
    })
    expect(doc.meta).toMatchObject({
      type: 'comment',
      replies_to: '2026-07-01-handoff-nimbus-web-error-codes',
    })
    expect(doc.meta.status).toBeUndefined() // never a board card
    expect(readFileSync(join(vault, parentRel), 'utf8')).toBe(before) // parent untouched

    // comment announce: no card (thread data), still a vault change
    const created = events.filter((e) => e.kind === 'handoff.created').at(-1)
    expect(created?.card).toBeNull()
  })

  it('blank comment fields are rejected before any write', async () => {
    await expect(
      client.invoke('handoffs.annotate', {
        id: 'whatever',
        title: '  ',
        body: '',
        identity: dana,
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL', message: expect.stringContaining('comment') })
  })
})

describe('route.preview + route.file (story 7.4)', () => {
  it('preview shows destination + invented frontmatter without writing; route lands there', async () => {
    const src = join(sandbox, 'quota-finding.md')
    writeFileSync(
      src,
      '---\nproject: nimbus-api\ntopic: api\ntype: finding\ndate: "2026-07-08"\n---\n# quota\n',
    )
    const preview = await client.invoke('route.preview', { file: src, mode: 'move' })
    expect(preview.project).toBe('nimbus-api')
    expect(preview.destination).toContain(join('projects', 'nimbus-api', 'api'))
    expect(preview.meta.loredex).toBe('routed')
    expect(existsSync(preview.destination)).toBe(false) // read-only

    const { written } = await client.invoke('route.file', { path: src, mode: 'move' })
    expect(written).toEqual([preview.destination])
    expect(existsSync(src)).toBe(false) // move consumed the source
    const completed = events.find((e) => e.kind === 'route.completed')
    expect((completed?.receipt as Record<string, unknown>)?.destination).toBe(preview.destination)
  })

  it('a frontmatter-less file previews as ambiguous (empty project) — the select gate', async () => {
    const src = join(sandbox, 'scratch.md')
    writeFileSync(src, '# no frontmatter\n')
    const preview = await client.invoke('route.preview', { file: src, mode: 'copy' })
    expect(preview.project).toBe('')

    const forced = await client.invoke('route.preview', {
      file: src,
      mode: 'copy',
      projectName: 'nimbus-web',
    })
    expect(forced.project).toBe('nimbus-web')
    expect(forced.destination).toContain(join('projects', 'nimbus-web'))
  })

  it('rejects non-markdown sources and files already inside the vault', async () => {
    await expect(
      client.invoke('route.preview', { file: join(sandbox, 'x.txt'), mode: 'move' }),
    ).rejects.toMatchObject({ code: 'INTERNAL', message: expect.stringContaining('markdown') })
    await expect(
      client.invoke('route.file', {
        path: join(vault, 'Start Here - Product.md'),
        mode: 'move',
      }),
    ).rejects.toMatchObject({ code: 'VAULT_OUTSIDE_PATH' })
  })
})
