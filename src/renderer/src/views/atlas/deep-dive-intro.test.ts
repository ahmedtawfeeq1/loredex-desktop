/**
 * Atlas reframe WP3 — the Deep Dive self-explanation content (spec §Deep Dive):
 * a persistent one-line purpose header + a tiny always-visible inline key. Pure
 * model, so the copy + the key rows are asserted without a DOM.
 */
import { describe, expect, it } from 'vitest'
import { DEEP_KEY_ITEMS, DEEP_PURPOSE } from './deep-dive-intro'

describe('Deep Dive intro content', () => {
  it('states the graph is the lineage view and points at Path', () => {
    expect(DEEP_PURPOSE).toContain('Trace how work and knowledge connect across your projects')
    expect(DEEP_PURPOSE).toContain('click a node to open it')
    expect(DEEP_PURPOSE).toContain('use Path to trace how one thing reaches another')
  })

  it('carries the four inline-key encodings (arrow/thickness/dot/dashed)', () => {
    const meanings = DEEP_KEY_ITEMS.map((k) => k.meaning)
    expect(meanings).toEqual(['handoff', 'volume', 'open', 'affinity'])
    // every key row has a visible mark to stand next to its meaning
    for (const item of DEEP_KEY_ITEMS) expect(item.mark.length).toBeGreaterThan(0)
  })
})
