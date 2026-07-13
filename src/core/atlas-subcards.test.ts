/**
 * Story epic17.2 (D1 amendment 3): the drilled panel now reads in a direction.
 * Extended layout invariants over the shared contract:
 *   - sub-card CONTAINMENT: every topic's notes sit inside that topic's bordered
 *     sub-card, and no two topic sub-cards overlap (no note floats naked, no
 *     topic bleeds into another);
 *   - ORDER-CHIP recency: chip `01` names a topic's newest note and sits at the
 *     top of the sub-card; the chip sequence IS the recency sequence;
 *   - EDGE clearance: in-panel relationship edges route their channel midpoint
 *     card-free.
 * Proven against a synthesized 25-topic single project (the user's real-world
 * scale — ~25 topics in one project) AND the real nimbus simulation vault.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  byRecencyDesc,
  nodeRect,
  truncateLabel,
  orderChips,
  orthoRoute,
  type Rect,
  rectsOverlap,
  subCardRect,
} from '../shared/atlas-layout'
import type { AtlasGraph, AtlasNode, HandoffCard } from '../shared/types'
import { type AtlasSource, buildAtlasModel, projectAtlas } from './atlas'
import { listMarkdownFiles } from './tree'
import { resolveLink } from './links'

const NIMBUS_VAULT = resolve(
  import.meta.dirname,
  '../../../loredex-simulation/_machine2/nimbus-vault',
)

// ── a source backed by an in-memory file map (names resolve by basename) ─────
function vaultSource(
  files: Record<string, { meta: Record<string, unknown>; body: string }>,
): AtlasSource {
  const rels = Object.keys(files)
  return {
    vaultPath: '/v',
    files: rels,
    cards: [] as HandoffCard[],
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
  }
}

/** A 25-topic project: topic k holds (k mod 4)+1 notes, dated so newer topics
 *  and newer notes are unambiguous; a handful of same-topic-within-project
 *  wikilinks give in-panel relationship edges to hold to the channel. */
function megaProjectFiles(): Record<string, { meta: Record<string, unknown>; body: string }> {
  const files: Record<string, { meta: Record<string, unknown>; body: string }> = {}
  for (let t = 0; t < 25; t++) {
    const topic = `topic-${String(t).padStart(2, '0')}`
    const count = (t % 4) + 1
    for (let n = 0; n < count; n++) {
      // month climbs with topic index, day with note index → every note a
      // distinct, comparable ISO date; note 0 is the newest in its topic
      const month = String(3 + (t % 10)).padStart(2, '0')
      const day = String(28 - n).padStart(2, '0')
      // link the second note of each topic to the first (in-panel wikilink edge)
      const body = n === 1 ? `See [[mega-${topic}-n0]].` : ''
      files[`projects/mega/${topic}/mega-${topic}-n${n}.md`] = {
        meta: { date: `2026-${month}-${day}`, type: 'note' },
        body,
      }
    }
  }
  return files
}

// ── invariant helpers over a projected graph ─────────────────────────────────

interface TopicRects {
  project: string
  topic: string
  members: AtlasNode[]
  memberRects: Rect[]
  subCard: Rect
}

/** Every topic (with ≥1 rendered member) as its bordered sub-card + members. */
function topicSubCards(g: AtlasGraph): TopicRects[] {
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const out: TopicRects[] = []
  for (const cluster of g.clusters) {
    for (const topic of cluster.topics) {
      const members = topic.nodeIds
        .map((id) => byId.get(id))
        .filter((n): n is AtlasNode => n !== undefined)
      if (members.length === 0) continue
      const memberRects = members.map((n) => nodeRect(n, g.level))
      const subCard = subCardRect(memberRects) as Rect
      out.push({ project: cluster.project, topic: topic.name, members, memberRects, subCard })
    }
  }
  return out
}

function assertSubCardContainment(g: AtlasGraph): void {
  const cards = topicSubCards(g)
  for (const tc of cards) {
    // every note of the topic is inside its own sub-card
    for (const r of tc.memberRects) {
      const inside =
        r.x >= tc.subCard.x &&
        r.y >= tc.subCard.y &&
        r.x + r.w <= tc.subCard.x + tc.subCard.w &&
        r.y + r.h <= tc.subCard.y + tc.subCard.h
      expect(inside, `${g.level}: ${tc.topic} note escapes its sub-card`).toBe(true)
    }
  }
  // no two topic sub-cards overlap → no topic bleeds into another's border,
  // and no foreign note ever lands inside a topic's sub-card
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i] as TopicRects
      const b = cards[j] as TopicRects
      if (a.project !== b.project) continue // different panels, different regions
      expect(
        rectsOverlap(a.subCard, b.subCard),
        `${g.level}: sub-cards ${a.topic} & ${b.topic} overlap`,
      ).toBe(false)
    }
  }
}

function assertOrderChipRecency(g: AtlasGraph): void {
  for (const tc of topicSubCards(g)) {
    const chips = orderChips(tc.members)
    const sorted = [...tc.members].sort(byRecencyDesc)
    // chip 01 = newest, and the sequence is exactly the recency order
    sorted.forEach((m, i) => {
      expect(chips.get(m.id)).toBe(String(i + 1).padStart(2, '0'))
    })
    // the newest note (chip 01) is placed at the sub-card's top-left cell
    const newest = sorted[0] as AtlasNode
    const minX = Math.min(...tc.members.map((m) => m.x))
    const minY = Math.min(...tc.members.map((m) => m.y))
    expect(chips.get(newest.id)).toBe('01')
    expect(newest.x, `${tc.topic}: chip 01 not in first column`).toBe(minX)
    expect(newest.y, `${tc.topic}: chip 01 not on top row`).toBe(minY)
  }
}

function assertEdgeClearance(g: AtlasGraph): void {
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const cardRects = g.nodes
    .filter((n) => n.type !== 'project')
    .map((n) => nodeRect(n, g.level))
  for (const e of g.edges) {
    // in-panel relationship edges (the connectors D1a3 draws inside the panel)
    if (e.category === 'route') continue
    const a = byId.get(e.source)
    const b = byId.get(e.target)
    if (!a || !b) continue
    const route = orthoRoute(nodeRect(a, g.level), nodeRect(b, g.level), 0, 20)
    // the vertical run (constant x) is the card-free channel; its midpoint must
    // sit clear of every card
    const pts = route.points
    let channel = pts[Math.floor(pts.length / 2)] as { x: number; y: number }
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1] as { x: number; y: number }
      const q = pts[i] as { x: number; y: number }
      if (p.x === q.x && p.y !== q.y) {
        channel = { x: p.x, y: (p.y + q.y) / 2 }
        break
      }
    }
    const probe: Rect = { x: channel.x - 1, y: channel.y - 1, w: 2, h: 2 }
    for (const r of cardRects) {
      expect(
        rectsOverlap(probe, r),
        `${g.level}: edge ${e.id} channel crosses a card`,
      ).toBe(false)
    }
  }
}

function assertAll(g: AtlasGraph): void {
  assertSubCardContainment(g)
  assertOrderChipRecency(g)
  assertEdgeClearance(g)
}

// ── the synthesized 25-topic project (user's real-world scale) ───────────────

describe('drilled sub-card invariants — 25-topic project fixture', () => {
  const model = buildAtlasModel(vaultSource(megaProjectFiles()))

  it('projects 25 topics into one panel', () => {
    const g = projectAtlas(model, 'learn', { project: 'mega' })
    expect(g.clusters[0]?.topics.length).toBe(25)
  })

  it('sub-cards contain their notes and never overlap (learn + deep)', () => {
    assertSubCardContainment(projectAtlas(model, 'learn', { project: 'mega' }))
    assertSubCardContainment(projectAtlas(model, 'deep', { project: 'mega' }))
  })

  it('order chips match recency; chip 01 tops each sub-card', () => {
    assertOrderChipRecency(projectAtlas(model, 'learn', { project: 'mega' }))
    assertOrderChipRecency(projectAtlas(model, 'deep', { project: 'mega' }))
  })

  it('in-panel relationship edges route card-free channels', () => {
    assertEdgeClearance(projectAtlas(model, 'learn', { project: 'mega' }))
    assertEdgeClearance(projectAtlas(model, 'deep', { project: 'mega' }))
  })

  it('topics arrange newest-activity first, left→right', () => {
    const g = projectAtlas(model, 'learn', { project: 'mega' })
    const cards = topicSubCards(g)
    // topic-19 (month 12) is newer than topic-00 (month 03): it sits left/up
    const t19 = cards.find((c) => c.topic === 'topic-19') as TopicRects
    const t00 = cards.find((c) => c.topic === 'topic-00') as TopicRects
    const before = t19.subCard.x < t00.subCard.x || t19.subCard.y < t00.subCard.y
    expect(before).toBe(true)
  })
})

// ── the real nimbus vault (the user's actual pain surface) ───────────────────

describe.runIf(existsSync(NIMBUS_VAULT))('drilled sub-card invariants — nimbus vault', () => {
  // Lazy: `describe.runIf(false)` skips the it()s but STILL runs this callback
  // body at collection, so any eager listMarkdownFiles(NIMBUS_VAULT) would ENOENT
  // on machines without the sibling nimbus vault (CI). beforeAll only runs when
  // the block actually runs, so the read is deferred behind the runIf guard.
  let model: ReturnType<typeof buildAtlasModel>
  let projects: string[]

  beforeAll(() => {
    model = buildAtlasModel({
      vaultPath: NIMBUS_VAULT,
      files: listMarkdownFiles(NIMBUS_VAULT),
      cards: [],
      readDoc: () => ({ meta: {}, body: '' }),
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
    })
    projects = [...new Set([...model.nodes.values()].map((n) => n.project))].filter(
      (p): p is string => Boolean(p),
    )
  })

  it('every project panel holds the sub-card + chip + clearance invariants', () => {
    expect(projects.length).toBeGreaterThan(0)
    for (const project of projects) {
      assertAll(projectAtlas(model, 'learn', { project }))
      assertAll(projectAtlas(model, 'deep', { project }))
    }
  })
})

// D1 amendment 6 — topic label truncation (footer meta no longer collides)
describe('truncateLabel (D1 amendment 6)', () => {
  it('leaves short labels untouched', () => {
    expect(truncateLabel('ONBOARDING', 200, 6.2)).toBe('ONBOARDING')
  })
  it('ellipsizes a long label to the card width', () => {
    const out = truncateLabel('OPPORTUNITY-MANAGEMENT', 60, 6.2)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThan('OPPORTUNITY-MANAGEMENT'.length)
    expect(out.length).toBeLessThanOrEqual(Math.floor(60 / 6.2))
  })
  it('never returns an empty string for a tiny width', () => {
    expect(truncateLabel('SPEC-MCP-SERVER-PAGE', 4, 6.2).length).toBeGreaterThan(0)
  })
})
