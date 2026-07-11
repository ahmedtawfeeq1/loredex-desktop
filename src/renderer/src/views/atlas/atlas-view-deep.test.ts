/**
 * Atlas reframe WP3 DoD — AtlasView self-explains at Deep Dive: the purpose
 * header + inline key render above the graph, and Path + Blocked read as the
 * primary actions there. Asserted at the source level (this suite runs in the
 * node-free web project, mirroring atlas-view-learn / atlas-view-overview).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(import.meta.dirname, 'AtlasView.tsx'), 'utf8')

describe('AtlasView Deep Dive self-explanation', () => {
  it('imports the DeepDiveIntro (purpose header + inline key)', () => {
    expect(src).toMatch(/import\s+\{\s*DeepDiveIntro\s*\}\s+from\s+'\.\/DeepDiveIntro'/)
  })

  it('renders the intro above the canvas only at Deep Dive', () => {
    expect(src).toContain("level === 'deep' && <DeepDiveIntro")
    // it lives in the graph branch, above the AtlasCanvas
    expect(src).toMatch(/<DeepDiveIntro[\s\S]*<AtlasCanvas\b/)
  })

  it('emphasises Path + Blocked as the primary Deep-Dive actions', () => {
    expect(src).toContain("level === 'deep' && (action.id === 'path' || action.id === 'blocked')")
    expect(src).toContain('atlas-tool-primary')
  })
})
