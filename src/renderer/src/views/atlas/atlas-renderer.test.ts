/**
 * Atlas reframe WP4 DoD (spec §Navigation glue) — the pure level→renderer
 * mapping: every (level, flowView) cell resolves to exactly one surface. This is
 * the "nav transition test where pure" — the segmented control switches level,
 * atlasRenderer decides what renders, and this pins the whole table.
 */
import { describe, expect, it } from 'vitest'
import { atlasRenderer } from './atlas-renderer'

describe('atlasRenderer (level → renderer)', () => {
  it('Learn is always the readable page (Flow view is Overview-only)', () => {
    expect(atlasRenderer('learn', false)).toBe('page')
    expect(atlasRenderer('learn', true)).toBe('page')
  })

  it('Overview defaults to the launcher, Flow view flips to the graph', () => {
    expect(atlasRenderer('overview', false)).toBe('launcher')
    expect(atlasRenderer('overview', true)).toBe('graph')
  })

  it('Deep Dive is always the graph', () => {
    expect(atlasRenderer('deep', false)).toBe('graph')
    expect(atlasRenderer('deep', true)).toBe('graph')
  })

  it('only ever lands on one of the three known surfaces', () => {
    const surfaces = new Set(['launcher', 'page', 'graph'])
    for (const level of ['overview', 'learn', 'deep'] as const)
      for (const flow of [false, true]) expect(surfaces.has(atlasRenderer(level, flow))).toBe(true)
  })
})
