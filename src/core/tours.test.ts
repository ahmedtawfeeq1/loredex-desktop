/**
 * Story 10.5 (ATLAS-5): tour extraction — reading orders lifted verbatim,
 * thread chains walked oldest-first, topic date-order with closing handoffs,
 * the labeled BFS fallback, dangling steps dropped — plus a contract suite
 * against a real Nimbus handoff reading order (definition of done).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AtlasSource } from './atlas'
import { buildAtlasModel } from './atlas'
import type { HandoffCard, TourDef } from '../shared/types'
import { resolveLink } from './links'
import { buildTours, filterTours, readingOrderProse } from './tours'
import { listMarkdownFiles } from './tree'

const NIMBUS_VAULT = resolve(
  import.meta.dirname,
  '../../../loredex-simulation/_machine2/nimbus-vault',
)

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

function vaultSource(
  files: Record<string, { meta: Record<string, unknown>; body: string }>,
  over: Partial<AtlasSource> = {},
): AtlasSource {
  const rels = Object.keys(files)
  return {
    vaultPath: V,
    files: rels,
    cards: [],
    readDoc: (rel) => files[rel] ?? null,
    resolveName: (name) => {
      const hits = rels.filter((r) => r === `${name}.md` || r.endsWith(`/${name}.md`))
      return hits.length === 1 ? (hits[0] as string) : null
    },
    projectRoots: {},
    contracts: [],
    today: '2026-07-10',
    fileExists: () => false,
    readRepoRemote: () => null,
    vaultRemote: null,
    ...over,
  }
}

const toursOf = (source: AtlasSource): TourDef[] => buildTours(source, buildAtlasModel(source))

describe('readingOrderProse', () => {
  it('lifts same-line prose per wikilink, only inside the Reading order section', () => {
    const body = [
      '# Handoff',
      'See [[elsewhere]] first.',
      '## Reading order',
      '1. [[a-note]] — the decision itself',
      '2. [[b-note|alias]]: follow-up detail',
      '- [[c-note]]',
      '## Next actions',
      '1. [[not-a-step]] — ignored',
    ].join('\n')
    const prose = readingOrderProse(body)
    expect(prose.get('a-note')).toBe('the decision itself')
    expect(prose.get('b-note')).toBe('follow-up detail')
    expect(prose.get('c-note')).toBe('')
    expect(prose.has('elsewhere')).toBe(false)
    expect(prose.has('not-a-step')).toBe(false)
  })
})

describe('buildTours', () => {
  const readingOrderBody = [
    '# Handoff',
    'Context prose.',
    '## Reading order',
    '1. [[design-note]] — why we stream',
    '2. [[api-note]] — the endpoints',
    '3. [[ghost-note]] — no longer exists',
  ].join('\n')

  const files = {
    'projects/beta/handoffs/h1.md': { meta: {}, body: readingOrderBody },
    'projects/alpha/streaming/design-note.md': {
      meta: { date: '2026-07-01' },
      body: 'The design.',
    },
    'projects/alpha/streaming/api-note.md': { meta: { date: '2026-07-03' }, body: 'The api.' },
  }

  it('extracts reading-order tours with prose descriptions, dropping dangling steps', () => {
    const source = vaultSource(files, {
      cards: [card('h1', 'beta', { readingOrder: ['design-note', 'api-note', 'ghost-note'] })],
    })
    const tours = toursOf(source)
    const tour = tours.find((t) => t.id === 'reading-order:handoff:beta/h1') as TourDef
    expect(tour).toBeDefined()
    expect(tour.heuristic).toBe(false)
    expect(tour.steps.map((s) => s.nodeIds[0])).toEqual([
      'note:alpha/streaming/design-note',
      'note:alpha/streaming/api-note', // ghost-note dropped — tour shrinks, never errors
    ])
    expect(tour.steps[0]?.description).toBe('why we stream')
    expect(tour.steps[0]?.project).toBe('alpha')
    expect(tour.steps[0]?.topic).toBe('streaming')
  })

  it('falls back to labeled BFS ordering when the handoff has no reading order', () => {
    const source = vaultSource(
      {
        'projects/beta/handoffs/bare.md': { meta: {}, body: 'See [[near]].' },
        'projects/alpha/topicx/near.md': {
          meta: { date: '2026-07-05' },
          body: 'Links [[far-b]] and [[far-a]].',
        },
        'projects/alpha/topicx/far-a.md': { meta: { date: '2026-07-02' }, body: '' },
        'projects/alpha/topicx/far-b.md': { meta: { date: '2026-07-01' }, body: '' },
      },
      { cards: [card('bare', 'beta')] },
    )
    const tours = toursOf(source)
    const tour = tours.find((t) => t.id === 'reading-order:handoff:beta/bare') as TourDef
    expect(tour.heuristic).toBe(true) // labeled as such in the payload (AC2)
    // step 1 = the handoff; then BFS depth, date-tiebroken within a depth
    expect(tour.steps.map((s) => s.nodeIds[0])).toEqual([
      'handoff:beta/bare',
      'note:alpha/topicx/near',
      'note:alpha/topicx/far-b', // 07-01 before 07-02 at the same depth
      'note:alpha/topicx/far-a',
    ])
    // deterministic across runs
    expect(toursOf(source)).toEqual(tours)
  })

  it('emits no tour for a handoff with nothing reachable (never an error)', () => {
    const source = vaultSource(
      { 'projects/beta/handoffs/lonely.md': { meta: {}, body: 'No links.' } },
      { cards: [card('lonely', 'beta')] },
    )
    expect(toursOf(source).filter((t) => t.kind === 'reading-order')).toHaveLength(0)
  })

  it('walks thread chains oldest-first as thread tours', () => {
    const source = vaultSource(
      {
        'projects/beta/handoffs/req.md': { meta: {}, body: '' },
        'projects/alpha/handoffs/del.md': { meta: {}, body: '' },
        'projects/alpha/handoffs/followup.md': { meta: {}, body: '' },
      },
      {
        cards: [
          card('req', 'beta', { kind: 'request', date: '2026-07-01' }),
          card('del', 'alpha', { kind: 'delivery', fulfills: 'req', date: '2026-07-03' }),
          card('followup', 'alpha', { repliesTo: 'del', date: '2026-07-05' }),
        ],
      },
    )
    const tour = toursOf(source).find((t) => t.kind === 'thread') as TourDef
    expect(tour).toBeDefined()
    expect(tour.steps.map((s) => s.nodeIds[0])).toEqual([
      'handoff:beta/req',
      'handoff:alpha/del',
      'handoff:alpha/followup',
    ])
  })

  it('builds topic tours date-ordered with closing handoffs appended', () => {
    const source = vaultSource(
      {
        'projects/alpha/streaming/late.md': { meta: { date: '2026-07-05' }, body: '' },
        'projects/alpha/streaming/early.md': { meta: { date: '2026-07-01' }, body: '' },
        'projects/alpha/handoffs/ship.md': {
          meta: {},
          body: '## Reading order\n1. [[late]]',
        },
      },
      { cards: [card('ship', 'alpha', { readingOrder: ['late'], date: '2026-07-06' })] },
    )
    const tour = toursOf(source).find((t) => t.id === 'topic:alpha/streaming') as TourDef
    expect(tour).toBeDefined()
    expect(tour.steps.map((s) => s.nodeIds[0])).toEqual([
      'note:alpha/streaming/early',
      'note:alpha/streaming/late',
      'handoff:alpha/ship', // the handoff whose reading order closes the topic
    ])
  })

  it('filterTours narrows by project and topic', () => {
    const tours: TourDef[] = [
      { id: 'a', kind: 'topic', title: '', description: '', heuristic: false, project: 'alpha', topic: 'streaming', steps: [] },
      { id: 'b', kind: 'topic', title: '', description: '', heuristic: false, project: 'beta', topic: 'channels', steps: [] },
      {
        id: 'c',
        kind: 'reading-order',
        title: '',
        description: '',
        heuristic: false,
        project: 'alpha',
        steps: [{ title: '', description: '', nodeIds: [], topic: 'streaming' }],
      },
    ]
    expect(filterTours(tours, { project: 'alpha' }).map((t) => t.id)).toEqual(['a', 'c'])
    expect(filterTours(tours, { topic: 'streaming' }).map((t) => t.id)).toEqual(['a', 'c'])
    expect(filterTours(tours, {}).map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })
})

// ── contract suite: a real Nimbus handoff reading order (DoD) ───────────────

describe.skipIf(!existsSync(NIMBUS_VAULT))('tours (nimbus simulation vault)', () => {
  let tours: TourDef[]

  beforeAll(async () => {
    const { listHandoffs, parseDoc } = await import('loredex')
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
      vaultRemote: null,
    }
    tours = buildTours(source, buildAtlasModel(source))
  })

  it('lifts the real streaming-request reading order as a non-heuristic tour', () => {
    // projects/nimbus-backend/handoffs/2026-07-10-handoff-nimbus-ai-engine.md:
    // "## Reading order\n1. [[2026-07-09-streaming-design]]"
    const tour = tours.find(
      (t) =>
        t.id === 'reading-order:handoff:nimbus-backend/2026-07-10-handoff-nimbus-ai-engine',
    ) as TourDef
    expect(tour).toBeDefined()
    expect(tour.heuristic).toBe(false)
    expect(tour.steps.map((s) => s.nodeIds[0])).toEqual([
      'note:nimbus-ai-engine/streaming/2026-07-09-streaming-design',
    ])
    expect(tour.steps[0]?.project).toBe('nimbus-ai-engine')
    expect(tour.steps[0]?.topic).toBe('streaming')
  })

  it('covers every reading-order-carrying handoff with a tour', () => {
    const withOrder = tours.filter((t) => t.kind === 'reading-order' && !t.heuristic)
    expect(withOrder.length).toBeGreaterThanOrEqual(5)
    for (const tour of withOrder) expect(tour.steps.length).toBeGreaterThanOrEqual(1)
  })

  it('produces a thread tour for the schema-v2 request loop', () => {
    const thread = tours.filter((t) => t.kind === 'thread')
    expect(thread.length).toBeGreaterThanOrEqual(1)
    // chains walk oldest-first
    for (const t of thread) {
      const dates = t.steps.map((s) => s.title.slice(0, 10))
      expect([...dates].sort()).toEqual(dates)
    }
  })

  it('builds a streaming topic tour scoped by project', () => {
    const scoped = filterTours(tours, { project: 'nimbus-backend', topic: 'streaming' })
    expect(scoped.some((t) => t.id === 'topic:nimbus-backend/streaming')).toBe(true)
  })
})
