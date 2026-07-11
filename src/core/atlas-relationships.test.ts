/**
 * WP-D — Learn relationship-strip data builder (shared/atlas-relationships).
 * Synthetic cases pin the direction mapping, self-route drop, non-route
 * exclusion, count/blocking carry and the biggest-flow-first ordering; the
 * nimbus fixture case proves the strip reads the real aggregated neighbor lanes
 * for a focused project (built through core/atlas, like the atlas suite).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { relationshipStrip } from '../shared/atlas-relationships'
import type { AtlasEdge } from '../shared/types'
import { type AtlasSource, buildAtlasModel } from './atlas'
import { resolveLink } from './links'
import { listMarkdownFiles } from './tree'

const NIMBUS_VAULT = resolve(
  import.meta.dirname,
  '../../../loredex-simulation/_machine2/nimbus-vault',
)

const agg = (from: string, to: string, extra: Partial<AtlasEdge> = {}): AtlasEdge => ({
  id: `route-agg:project:${from}->project:${to}`,
  source: `project:${from}`,
  target: `project:${to}`,
  category: 'route',
  totalCount: 1,
  openCount: 0,
  blocking: false,
  ...extra,
})

describe('relationshipStrip (synthetic)', () => {
  it('splits inbound (← from) and outbound (→ to) around the focus', () => {
    const strip = relationshipStrip('backend', [
      agg('mobile', 'backend', { totalCount: 3, openCount: 1 }),
      agg('backend', 'frontend', { totalCount: 4, openCount: 2 }),
    ])
    expect(strip.inbound).toEqual([
      { project: 'mobile', nodeId: 'project:mobile', total: 3, open: 1, blocking: false },
    ])
    expect(strip.outbound).toEqual([
      { project: 'frontend', nodeId: 'project:frontend', total: 4, open: 2, blocking: false },
    ])
  })

  it('drops a self-route (project → itself) — not a neighbor lane', () => {
    const strip = relationshipStrip('backend', [agg('backend', 'backend', { totalCount: 5 })])
    expect(strip).toEqual({ inbound: [], outbound: [] })
  })

  it('ignores non-route edges', () => {
    const strip = relationshipStrip('backend', [
      agg('mobile', 'backend'),
      { ...agg('ai', 'backend'), category: 'thread' },
    ])
    expect(strip.inbound.map((c) => c.project)).toEqual(['mobile'])
  })

  it('orders each side biggest-flow-first, then alphabetical', () => {
    const strip = relationshipStrip('backend', [
      agg('ai', 'backend', { totalCount: 2 }),
      agg('frontend', 'backend', { totalCount: 5 }),
      agg('mobile', 'backend', { totalCount: 2 }),
    ])
    expect(strip.inbound.map((c) => `${c.project}:${c.total}`)).toEqual([
      'frontend:5',
      'ai:2',
      'mobile:2',
    ])
  })

  it('carries blocking + open through to the chip', () => {
    const strip = relationshipStrip('backend', [
      agg('mobile', 'backend', { blocking: true, openCount: 2, totalCount: 3 }),
    ])
    expect(strip.inbound[0]).toMatchObject({ blocking: true, open: 2, total: 3 })
  })

  it('a focus with no route flow yields empty strips', () => {
    expect(relationshipStrip('lonely', [agg('mobile', 'backend')])).toEqual({
      inbound: [],
      outbound: [],
    })
  })
})

describe.skipIf(!existsSync(NIMBUS_VAULT))('relationshipStrip (nimbus fixture)', () => {
  let aggregated: AtlasEdge[]

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
    aggregated = buildAtlasModel(source).aggregated
  })

  it('summarizes nimbus-backend inbound/outbound neighbor lanes', () => {
    const strip = relationshipStrip('nimbus-backend', aggregated)
    // all three siblings hand INTO backend, biggest flow first then alpha
    expect(strip.inbound).toEqual([
      { project: 'nimbus-ai-engine', nodeId: 'project:nimbus-ai-engine', total: 4, open: 1, blocking: true },
      { project: 'nimbus-frontend', nodeId: 'project:nimbus-frontend', total: 4, open: 2, blocking: false },
      { project: 'nimbus-mobile', nodeId: 'project:nimbus-mobile', total: 3, open: 2, blocking: true },
    ])
    // ...and backend hands OUT to all three
    expect(strip.outbound).toEqual([
      { project: 'nimbus-frontend', nodeId: 'project:nimbus-frontend', total: 4, open: 2, blocking: true },
      { project: 'nimbus-mobile', nodeId: 'project:nimbus-mobile', total: 4, open: 3, blocking: false },
      { project: 'nimbus-ai-engine', nodeId: 'project:nimbus-ai-engine', total: 1, open: 1, blocking: true },
    ])
  })

  it('each chip mirrors its aggregated route edge (no miscount/direction flip)', () => {
    const strip = relationshipStrip('nimbus-backend', aggregated)
    for (const chip of strip.inbound) {
      const e = aggregated.find(
        (a) => a.source === chip.nodeId && a.target === 'project:nimbus-backend',
      )
      expect(chip.total).toBe(e?.totalCount ?? 0)
      expect(chip.open).toBe(e?.openCount ?? 0)
    }
    for (const chip of strip.outbound) {
      const e = aggregated.find(
        (a) => a.source === 'project:nimbus-backend' && a.target === chip.nodeId,
      )
      expect(chip.total).toBe(e?.totalCount ?? 0)
      expect(chip.open).toBe(e?.openCount ?? 0)
    }
  })
})
