/**
 * Story 10.1 (ATLAS-1): the atlas model — 6 node types / 6 edge categories
 * lifted from existing truth, deterministic positions, graceful degradation —
 * plus the atlas.graph channel over the seam (fixture vault) and a contract
 * suite against the real nimbus simulation vault when present.
 */
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'
import type { AtlasEdge, AtlasGraph, AtlasNode, HandoffCard } from '../shared/types'
import {
  type AtlasSource,
  buildAtlasModel,
  firstSentence,
  isBlocking,
  projectAtlas,
} from './atlas'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc } from './ipc'
import { resolveLink } from './links'
import { listMarkdownFiles } from './tree'

const FIXTURE_VAULT = resolve(import.meta.dirname, '../../tests/fixtures/vault')
const NIMBUS_VAULT = resolve(
  import.meta.dirname,
  '../../../loredex-simulation/_machine2/nimbus-vault',
)

// ── synthetic source helpers ─────────────────────────────────────────────────

const V = '/v'
const card = (id: string, project: string, extra: Partial<HandoffCard> = {}): HandoffCard => ({
  id,
  name: id,
  from: 'alpha',
  to: project,
  objective: `do ${id}`,
  date: '2026-07-01',
  ageDays: 9,
  status: 'open',
  path: `${V}/projects/${project}/handoffs/${id}.md`,
  readingOrder: [],
  kind: 'delivery',
  expired: false,
  ...extra,
})

function sourceOf(over: Partial<AtlasSource> = {}): AtlasSource {
  return {
    vaultPath: V,
    files: [],
    cards: [],
    readDoc: () => ({ meta: {}, body: '' }),
    resolveName: () => null,
    projectRoots: {},
    contracts: [],
    today: '2026-07-10',
    fileExists: () => false,
    readRepoRemote: () => null,
    vaultRemote: null,
    ...over,
  }
}

/** file-map-backed source: rel → {meta, body}; names resolve by unique basename */
function vaultSource(
  files: Record<string, { meta: Record<string, unknown>; body: string }>,
  over: Partial<AtlasSource> = {},
): AtlasSource {
  const rels = Object.keys(files)
  return sourceOf({
    files: rels,
    readDoc: (rel) => files[rel] ?? null,
    resolveName: (name) => {
      const hits = rels.filter((r) => r === `${name}.md` || r.endsWith(`/${name}.md`))
      return hits.length === 1 ? (hits[0] as string) : null
    },
    ...over,
  })
}

const ids = (nodes: AtlasNode[]): string[] => nodes.map((n) => n.id).sort()
const ofCategory = (edges: AtlasEdge[], category: AtlasEdge['category']): AtlasEdge[] =>
  edges.filter((e) => e.category === category)

// ── pure helpers ─────────────────────────────────────────────────────────────

describe('atlas helpers', () => {
  it('firstSentence takes the first authored prose sentence, skipping structure', () => {
    expect(firstSentence('# Title\n\n- list\n\nThe decision holds. More text.')).toBe(
      'The decision holds.',
    )
    expect(firstSentence('```\ncode. not prose\n```\nReal sentence here')).toBe(
      'Real sentence here',
    )
    expect(firstSentence('See [[some-note|the note]] for detail. Rest.')).toBe(
      'See some-note for detail.',
    )
    expect(firstSentence('# only headings\n## here')).toBe('')
  })

  // commitBaseOf moved to shared/github.ts githubWebBase (story 12.1
  // supersession — one derivation, everywhere); tested in shared/github.test.ts

  it('blocking matrix: open/accepted requests block; expired snooze counts as open', () => {
    const matrix: Array<[string, string, boolean, boolean]> = [
      ['request', 'open', false, true],
      ['request', 'accepted', false, true],
      ['request', 'snoozed', true, true], // expired snooze derives as open
      ['request', 'snoozed', false, false],
      ['request', 'declined', false, false],
      ['request', 'consumed', false, false],
      ['delivery', 'open', false, false], // deliveries never block
      ['delivery', 'snoozed', true, false],
    ]
    for (const [kind, status, expired, want] of matrix) {
      expect(isBlocking({ kind, status, expired }), `${kind}/${status}/${expired}`).toBe(want)
    }
  })
})

// ── model: nodes, edges, ids, degradation ───────────────────────────────────

describe('buildAtlasModel', () => {
  it('emits typed-prefixed ids and only the 6 node types', () => {
    const model = buildAtlasModel(
      vaultSource(
        {
          'projects/alpha/design/2026-07-01-plan.md': {
            meta: { date: '2026-07-01', type: 'note' },
            body: 'Plan body.',
          },
        },
        { cards: [card('h1', 'beta')] },
      ),
    )
    expect(ids([...model.nodes.values()])).toEqual([
      'handoff:beta/h1',
      'note:alpha/design/2026-07-01-plan',
      'project:alpha',
      'project:beta',
    ])
    for (const n of model.nodes.values()) {
      expect(['project', 'note', 'handoff', 'contract', 'source', 'commit']).toContain(n.type)
    }
  })

  it('lifts route edges with blocking flags and aggregates N open / M total', () => {
    const model = buildAtlasModel(
      sourceOf({
        cards: [
          card('req', 'beta', { kind: 'request', status: 'open' }),
          card('done', 'beta', { status: 'consumed' }),
          card('expired', 'beta', { kind: 'request', status: 'snoozed', expired: true }),
        ],
      }),
    )
    const routes = ofCategory(model.edges, 'route')
    expect(routes).toHaveLength(3)
    expect(routes.find((e) => e.handoffId === 'handoff:beta/req')?.blocking).toBe(true)
    expect(routes.find((e) => e.handoffId === 'handoff:beta/done')?.blocking).toBe(false)
    expect(model.aggregated).toHaveLength(1)
    expect(model.aggregated[0]).toMatchObject({
      source: 'project:alpha',
      target: 'project:beta',
      openCount: 2, // open + expired snooze; consumed never counts
      totalCount: 3,
      blocking: true,
    })
  })

  it('v1 vault degradation: no kind/status v2 fields → routes never block', () => {
    // v1 lib cards surface kind 'delivery' by default and expired false
    const model = buildAtlasModel(sourceOf({ cards: [card('old', 'beta')] }))
    expect(ofCategory(model.edges, 'route').every((e) => e.blocking === false)).toBe(true)
    expect(model.aggregated[0]?.blocking).toBe(false)
  })

  it('thread edges resolve replies_to/fulfills; dangling refs are dropped, never fatal', () => {
    const request = card('req', 'beta', { kind: 'request' })
    const delivery = card('del', 'alpha', { kind: 'delivery', fulfills: 'req' })
    const orphan = card('orphan', 'alpha', { repliesTo: 'ghost' })
    const model = buildAtlasModel(
      vaultSource(
        {
          'projects/beta/handoffs/req.md': { meta: {}, body: '' },
          'projects/alpha/handoffs/del.md': { meta: {}, body: '' },
          'projects/alpha/handoffs/orphan.md': { meta: {}, body: '' },
        },
        { cards: [request, delivery, orphan] },
      ),
    )
    const threads = ofCategory(model.edges, 'thread')
    expect(threads).toHaveLength(1)
    expect(threads[0]).toMatchObject({
      source: 'handoff:alpha/del',
      target: 'handoff:beta/req',
      field: 'fulfills',
    })
  })

  it('wikilink edges resolve body links; broken/ambiguous drop silently', () => {
    const model = buildAtlasModel(
      vaultSource({
        'projects/alpha/design/a.md': {
          meta: {},
          body: 'See [[b]] and [[ghost]] and [[a]].',
        },
        'projects/beta/design/b.md': { meta: {}, body: '' },
      }),
    )
    const wikis = ofCategory(model.edges, 'wikilink')
    expect(wikis).toHaveLength(1)
    expect(wikis[0]).toMatchObject({
      source: 'note:alpha/design/a',
      target: 'note:beta/design/b',
    })
  })

  it('provenance re-resolves locally: roots map first, recorded path fallback, else null', () => {
    const meta = {
      source_path: '/recorded/docs/x.md',
      source_project: 'alpha-repo',
      source_rel: 'docs/x.md',
    }
    const files = {
      'projects/alpha/design/a.md': { meta, body: '' },
      'projects/alpha/design/b.md': {
        meta: { source_path: '/recorded/only.md' },
        body: '',
      },
    }
    // roots map hit wins
    const viaRoots = buildAtlasModel(
      vaultSource(files, {
        projectRoots: { '/repos/alpha': { name: 'alpha-repo' } },
        fileExists: (abs) => abs === '/repos/alpha/docs/x.md',
      }),
    )
    expect(viaRoots.nodes.get('source:alpha-repo/docs/x.md')?.localPath).toBe(
      '/repos/alpha/docs/x.md',
    )
    // recorded absolute path fallback
    const viaAbs = buildAtlasModel(
      vaultSource(files, { fileExists: (abs) => abs === '/recorded/docs/x.md' }),
    )
    expect(viaAbs.nodes.get('source:alpha-repo/docs/x.md')?.localPath).toBe('/recorded/docs/x.md')
    // nothing local → null (honest disabled state downstream)
    const nowhere = buildAtlasModel(vaultSource(files))
    expect(nowhere.nodes.get('source:alpha-repo/docs/x.md')?.localPath).toBeNull()
    expect(ofCategory(nowhere.edges, 'provenance')).toHaveLength(2)
  })

  it('sha mentions become commit nodes with mentioned-tier contract links', () => {
    const model = buildAtlasModel(
      vaultSource(
        {
          'projects/alpha/design/a.md': {
            meta: {},
            body: 'Landed in f3a398e. Also deadbeef is a word, not a commit.',
          },
        },
        {
          projectRoots: { '/repos/alpha': { name: 'alpha' } },
          readRepoRemote: () => 'git@github.com:acme/alpha.git',
        },
      ),
    )
    const commit = model.nodes.get('commit:f3a398e')
    expect(commit).toMatchObject({
      type: 'commit',
      sha: 'f3a398e',
      commitBase: 'https://github.com/acme/alpha',
    })
    expect(model.nodes.has('commit:deadbeef')).toBe(false) // letter-only hex = word
    const links = ofCategory(model.edges, 'contract-link')
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      source: 'note:alpha/design/a',
      target: 'commit:f3a398e',
      confidence: 'mentioned',
    })
  })

  it('contract-scan rows pass confidence tiers through verbatim (m2 §5)', () => {
    const model = buildAtlasModel(
      vaultSource(
        { 'projects/beta/handoffs/h1.md': { meta: {}, body: '' } },
        {
          cards: [card('h1', 'beta')],
          contracts: [
            {
              repoRoot: '/repos/beta',
              file: 'openapi.yaml',
              sha: 'a1b2c3d4',
              date: '2026-07-09',
              links: [
                { handoffId: 'h1', confidence: 'mentioned' },
                { handoffId: 'missing', confidence: 'heuristic' },
              ],
            },
            {
              repoRoot: '/repos/beta',
              file: 'openapi.yaml',
              sha: 'e5f6a7b8',
              date: '2026-07-10',
              links: [{ handoffId: 'h1', confidence: 'heuristic' }],
            },
          ],
        },
      ),
    )
    const contract = model.nodes.get('contract:/repos/beta/openapi.yaml')
    expect(contract).toMatchObject({ type: 'contract', file: 'openapi.yaml', changeCount: 2 })
    const tiers = ofCategory(model.edges, 'contract-link')
      .filter((e) => e.target === 'handoff:beta/h1')
      .map((e) => e.confidence)
      .sort()
    expect(tiers).toEqual(['heuristic', 'mentioned']) // verbatim, missing link dropped
  })

  it('affinity connects same-topic notes across projects only', () => {
    const model = buildAtlasModel(
      vaultSource({
        'projects/alpha/streaming/a.md': { meta: {}, body: '' },
        'projects/alpha/streaming/a2.md': { meta: {}, body: '' },
        'projects/beta/streaming/b.md': { meta: {}, body: '' },
        'projects/beta/channels/c.md': { meta: {}, body: '' },
      }),
    )
    const affinity = ofCategory(model.edges, 'affinity')
    expect(affinity).toHaveLength(2) // a↔b, a2↔b — never a↔a2 (same project)
    expect(affinity.every((e) => e.topic === 'streaming' && e.weight === 1)).toBe(true)
  })

  it('route cycles are flagged and broken deterministically — never a hang', () => {
    const model = buildAtlasModel(
      sourceOf({
        cards: [
          card('ab', 'beta', { from: 'alpha', to: 'beta' }),
          card('ba', 'alpha', { from: 'beta', to: 'alpha' }),
        ],
      }),
    )
    expect(model.cyclic).toBe(true)
    expect(model.depth.get('alpha')).toBeDefined()
    expect(model.depth.get('beta')).toBeDefined()
  })

  it('clusters group by explicit topic folders with single-child flags', () => {
    const model = buildAtlasModel(
      vaultSource({
        'projects/alpha/design/a.md': { meta: {}, body: '' },
        'projects/alpha/design/b.md': { meta: {}, body: '' },
        'projects/alpha/notes/only.md': { meta: {}, body: '' },
      }),
    )
    const alpha = model.clusters.find((c) => c.project === 'alpha')
    expect(alpha?.topics.map((t) => [t.name, t.singleChild])).toEqual([
      ['design', false],
      ['notes', true],
    ])
    expect(model.nodes.get('project:alpha')?.noteCount).toBe(3)
  })
})

// ── level projection + positions ─────────────────────────────────────────────

describe('projectAtlas levels', () => {
  const files = {
    'projects/alpha/streaming/design.md': {
      meta: { date: '2026-07-01', source_path: '/repo/d.md', source_project: 'alpha', source_rel: 'd.md' },
      body: 'Shipped in a1b2c3d.',
    },
    'projects/alpha/streaming/later.md': { meta: { date: '2026-07-05' }, body: '' },
    'projects/beta/handoffs/h1.md': { meta: {}, body: 'See [[design]].' },
  }
  const src = vaultSource(files, {
    cards: [card('h1', 'beta', { kind: 'request', status: 'open' })],
  })

  it('overview returns only project clusters + aggregated route edges', () => {
    const g = projectAtlas(buildAtlasModel(src), 'overview', {})
    expect(g.nodes.every((n) => n.type === 'project')).toBe(true)
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ openCount: 1, totalCount: 1, blocking: true })
  })

  it('learn scopes one project: notes + handoffs, no provenance/contract tails', () => {
    const g = projectAtlas(buildAtlasModel(src), 'learn', { project: 'alpha' })
    const types = new Set(g.nodes.map((n) => n.type))
    expect(types.has('note')).toBe(true)
    expect(types.has('source')).toBe(false)
    expect(types.has('commit')).toBe(false)
    expect(g.edges.some((e) => e.category === 'provenance')).toBe(false)
  })

  it('deep pulls the 1-hop boundary: source/commit nodes and cross-project targets', () => {
    const g = projectAtlas(buildAtlasModel(src), 'deep', { project: 'alpha' })
    const byId = new Map(g.nodes.map((n) => [n.id, n]))
    expect(byId.has('source:alpha/d.md')).toBe(true)
    expect(byId.has('commit:a1b2c3d')).toBe(true)
    expect(byId.has('handoff:beta/h1')).toBe(true) // wikilinks into alpha
    expect(g.edges.some((e) => e.category === 'provenance')).toBe(true)
  })

  it('positions are deterministic across runs and date-sort notes within a topic', () => {
    const a = projectAtlas(buildAtlasModel(src), 'learn', { project: 'alpha' })
    const b = projectAtlas(buildAtlasModel(src), 'learn', { project: 'alpha' })
    expect(a).toEqual(b)
    const design = a.nodes.find((n) => n.id === 'note:alpha/streaming/design') as AtlasNode
    const later = a.nodes.find((n) => n.id === 'note:alpha/streaming/later') as AtlasNode
    expect(design.y).toBe(later.y) // same topic row
    expect(design.x).toBeLessThan(later.x) // date-sorted left→right
  })

  it('overview columns order projects left→right by route-dependency depth', () => {
    const g = projectAtlas(buildAtlasModel(src), 'overview', {})
    const alpha = g.nodes.find((n) => n.id === 'project:alpha') as AtlasNode
    const beta = g.nodes.find((n) => n.id === 'project:beta') as AtlasNode
    expect(alpha.x).toBeLessThan(beta.x) // alpha sends to beta → beta sits right
  })
})

// ── the channel over the seam (fixture vault) ────────────────────────────────

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

describe('atlas.graph channel (fixture vault)', () => {
  beforeAll(() => {
    const configDir = mkdtempSync(join(tmpdir(), 'loredex-desktop-atlas-'))
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ vaultPath: FIXTURE_VAULT, sync: 'none', projects: {} }),
    )
    process.env.LOREDEX_CONFIG_DIR = configDir
    initEngine()
  })

  it('serves overview and deep graphs from the memoized core-side cache', async () => {
    const ipc = createCoreIpc()
    registerCoreHandlers(ipc)
    const client = createIpcClient({ timeoutMs: 2000 })
    const [a, b] = fakePortPair()
    ipc.attach(a)
    client.attach(b)

    const overview = await client.invoke('atlas.graph', { level: 'overview' })
    expect(overview.nodes.map((n) => n.id).sort()).toEqual([
      'project:nimbus-api',
      'project:nimbus-web',
    ])
    expect(overview.edges.every((e) => e.category === 'route')).toBe(true)
    expect(overview.edges.every((e) => typeof e.totalCount === 'number')).toBe(true)

    const deep = await client.invoke('atlas.graph', {
      level: 'deep',
      scope: { project: 'nimbus-web' },
    })
    expect(deep.nodes.some((n) => n.type === 'note')).toBe(true)
    expect(deep.nodes.some((n) => n.type === 'handoff')).toBe(true)
    // memoized: same request returns the identical cached object shape
    const again = await client.invoke('atlas.graph', { level: 'overview' })
    expect(again).toEqual(overview)

    // story 10.6: atlas.path rides the same seam over the same cached model
    const path = await client.invoke('atlas.path', {
      from: 'project:nimbus-api',
      to: 'project:nimbus-web',
    })
    expect(path).not.toBeNull()
    expect(path?.nodeIds[0]).toBe('project:nimbus-api')
    expect(path?.nodeIds[path.nodeIds.length - 1]).toBe('project:nimbus-web')
    const nowhere = await client.invoke('atlas.path', {
      from: 'project:nimbus-api',
      to: 'note:ghost',
    })
    expect(nowhere).toBeNull()
  })
})

// ── contract suite against the real nimbus simulation vault ─────────────────

describe.skipIf(!existsSync(NIMBUS_VAULT))('atlas model (nimbus simulation vault)', () => {
  let graphDeep: AtlasGraph
  let graphOverview: AtlasGraph

  beforeAll(async () => {
    const { listHandoffs, parseDoc } = await import('loredex')
    const { readFileSync } = await import('node:fs')
    const source: AtlasSource = {
      vaultPath: NIMBUS_VAULT,
      files: listMarkdownFiles(NIMBUS_VAULT),
      cards: listHandoffs(NIMBUS_VAULT, { direction: 'all' }),
      readDoc: (rel) => {
        try {
          const doc = parseDoc(readFileSync(join(NIMBUS_VAULT, rel), 'utf8'))
          return { meta: doc.meta as Record<string, unknown>, body: doc.body }
        } catch {
          return null
        }
      },
      resolveName: (name, fromRel) => {
        const r = resolveLink(NIMBUS_VAULT, name, fromRel)
        return r.status === 'resolved' ? (r.target ?? null) : null
      },
      projectRoots: {},
      contracts: [],
      today: '2026-07-10',
      fileExists: () => false,
      readRepoRemote: () => null,
      vaultRemote: 'git@github.com:nimbus/vault.git',
    }
    const model = buildAtlasModel(source)
    graphDeep = projectAtlas(model, 'deep', {})
    graphOverview = projectAtlas(model, 'overview', {})
  })

  it('finds all four nimbus projects as clusters', () => {
    expect(graphOverview.nodes.map((n) => n.label).sort()).toEqual([
      'nimbus-ai-engine',
      'nimbus-backend',
      'nimbus-frontend',
      'nimbus-mobile',
    ])
  })

  it('aggregated routes carry open/total counts for the backend lanes', () => {
    const toFrontend = graphOverview.edges.find(
      (e) => e.source === 'project:nimbus-backend' && e.target === 'project:nimbus-frontend',
    )
    expect(toFrontend).toBeDefined()
    expect(toFrontend?.totalCount).toBeGreaterThanOrEqual(1)
  })

  it('lifts thread edges from the schema-v2 request loop (replies_to + fulfills)', () => {
    const threads = graphDeep.edges.filter((e) => e.category === 'thread')
    expect(threads.some((e) => e.field === 'fulfills')).toBe(true)
    expect(threads.some((e) => e.field === 'replies_to')).toBe(true)
    // the comment note rides the thread rail as a note node
    const comment = graphDeep.nodes.find((n) =>
      n.id.includes('2026-07-10-comment-gateway-caveat'),
    )
    expect(comment?.type).toBe('note')
  })

  it('lifts provenance edges from the stamped notes (source_project/source_rel)', () => {
    const prov = graphDeep.edges.filter((e) => e.category === 'provenance')
    expect(prov.length).toBeGreaterThanOrEqual(3)
    const streamingApi = prov.find(
      (e) => e.source === 'note:nimbus-backend/streaming/2026-07-09-streaming-api',
    )
    expect(streamingApi?.target).toBe('source:nimbus-backend/docs/streaming-api.md')
    const node = graphDeep.nodes.find((n) => n.id === 'source:nimbus-backend/docs/streaming-api.md')
    expect(node?.localPath).toBeNull() // repo not on "this machine" in the test source
  })

  it('resolves the 3-hop streaming chain through wikilink edges', () => {
    const wikis = graphDeep.edges.filter((e) => e.category === 'wikilink')
    // ai-engine design ← backend api ← frontend ui reading orders
    expect(
      wikis.some((e) => e.target === 'note:nimbus-ai-engine/streaming/2026-07-09-streaming-design'),
    ).toBe(true)
    expect(
      wikis.some((e) => e.target === 'note:nimbus-backend/streaming/2026-07-09-streaming-api'),
    ).toBe(true)
  })

  it('mentions become commit nodes with mentioned-tier links (vault remote base)', () => {
    const commit = graphDeep.nodes.find((n) => n.id === 'commit:f3a398e')
    expect(commit).toBeDefined()
    expect(commit?.commitBase).toBe('https://github.com/nimbus/vault')
    const links = graphDeep.edges.filter(
      (e) => e.category === 'contract-link' && e.target === 'commit:f3a398e',
    )
    expect(links.length).toBeGreaterThanOrEqual(1)
    expect(links.every((e) => e.confidence === 'mentioned')).toBe(true)
  })

  it('connects the streaming topic across projects through affinity edges', () => {
    const affinity = graphDeep.edges.filter(
      (e) => e.category === 'affinity' && e.topic === 'streaming',
    )
    expect(affinity.length).toBeGreaterThanOrEqual(2)
    for (const e of affinity) {
      const a = graphDeep.nodes.find((n) => n.id === e.source)
      const b = graphDeep.nodes.find((n) => n.id === e.target)
      expect(a?.project).not.toBe(b?.project)
    }
  })

  it('every emitted node is one of the 6 resolvable types with a position', () => {
    for (const n of graphDeep.nodes) {
      expect(['project', 'note', 'handoff', 'contract', 'source', 'commit']).toContain(n.type)
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
  })
})
