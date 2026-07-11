/**
 * Atlas reframe WP1 DoD — AtlasView routes Learn to the readable ProjectPage,
 * not the SVG canvas, while Deep Dive (and the Overview flow-view) keep the
 * AtlasCanvas graph. Asserted at the source level (this suite runs in the
 * node-free web project, so it reads AtlasView.tsx the way atlas-fidelity does).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(import.meta.dirname, 'AtlasView.tsx'), 'utf8')

describe('AtlasView Learn routing', () => {
  it('imports the ProjectPage', () => {
    expect(src).toMatch(/import\s+\{\s*ProjectPage\s*\}\s+from\s+'\.\/ProjectPage'/)
  })

  it("renders ProjectPage at level==='learn'", () => {
    // WP4: the level→renderer decision moved into the pure atlasRenderer()
    expect(src).toContain("showProjectPage = renderer === 'page'")
    expect(src).toMatch(/showProjectPage\s*\?[\s\S]*<ProjectPage graph=\{graph\}/)
  })

  it('keeps AtlasCanvas for the non-Learn (Deep Dive / Overview flow) branch', () => {
    expect(src).toContain('import { AtlasCanvas }')
    // the canvas still renders in the else branch of the page split
    expect(src).toMatch(/<AtlasCanvas\b/)
  })

  it('no longer renders the header relationship strip (moved onto the page)', () => {
    expect(src).not.toContain('atlas-rel-strip')
  })
})
