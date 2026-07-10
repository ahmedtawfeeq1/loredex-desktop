/**
 * Story 16.3 (Addendum D1) — deterministic section tints: exact D1 palette,
 * same name → same tint (pinned, so a hash change can't silently recolor
 * every vault), and the hash actually spreads names across all 8 tints.
 */
import { describe, expect, it } from 'vitest'
import { sectionTint, TREE_TINTS } from './sectionTint'

describe('the D1 palette, verbatim', () => {
  it('is exactly the 8 spec hexes in spec order (sage…plum)', () => {
    expect(TREE_TINTS).toEqual([
      '#7C9A6D', // sage
      '#C07856', // clay
      '#6B7FA3', // slate
      '#8A8F55', // moss
      '#B07285', // rose
      '#B99B5F', // sand
      '#5F9490', // teal
      '#8D6E97', // plum
    ])
  })
})

describe('deterministic: same name → same tint', () => {
  it('repeat calls always answer the same hex', () => {
    for (const name of ['nimbus-backend', '_index', 'projects', 'a']) {
      expect(sectionTint(name)).toBe(sectionTint(name))
    }
  })

  it('known names stay pinned across releases (colors must never drift)', () => {
    // FNV-1a assignments — if the hash or palette order changes, every vault
    // recolors underneath the user; this test makes that a deliberate act.
    expect(sectionTint('nimbus-backend')).toBe('#6B7FA3') // slate
    expect(sectionTint('nimbus-frontend')).toBe('#5F9490') // teal
    expect(sectionTint('nimbus-mobile')).toBe('#7C9A6D') // sage
    expect(sectionTint('nimbus-ai-engine')).toBe('#B99B5F') // sand
    expect(sectionTint('projects')).toBe('#8D6E97') // plum
    expect(sectionTint('_index')).toBe('#6B7FA3') // slate
  })

  it('every answer is a member of the 8-tint palette', () => {
    for (let i = 0; i < 100; i++) {
      expect(TREE_TINTS).toContain(sectionTint(`project-${i}`))
    }
  })
})

describe('distribution: names spread across all 8 tints', () => {
  it('24 sibling-style names already hit every tint', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 24; i++) seen.add(sectionTint(`project-${i}`))
    expect(seen.size).toBe(TREE_TINTS.length)
  })

  it('the four nimbus projects land on four DIFFERENT tints', () => {
    const projects = ['nimbus-backend', 'nimbus-frontend', 'nimbus-mobile', 'nimbus-ai-engine']
    expect(new Set(projects.map(sectionTint)).size).toBe(projects.length)
  })
})
