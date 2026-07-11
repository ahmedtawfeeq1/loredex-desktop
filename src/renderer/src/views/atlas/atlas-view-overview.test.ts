/**
 * Atlas reframe WP2 DoD — AtlasView routes Overview to the readable
 * ProjectLauncher by DEFAULT, and to the AtlasCanvas graph only when the
 * "Flow view" toggle is on. Asserted at the source level (this suite runs in the
 * node-free web project, mirroring atlas-view-learn.test.ts / atlas-fidelity).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = readFileSync(join(import.meta.dirname, 'AtlasView.tsx'), 'utf8')

describe('AtlasView Overview routing', () => {
  it('imports the ProjectLauncher', () => {
    expect(src).toMatch(/import\s+\{\s*ProjectLauncher\s*\}\s+from\s+'\.\/ProjectLauncher'/)
  })

  it('defaults Overview to the launcher (graph only when Flow view is on)', () => {
    // WP4: the level→renderer decision moved into the pure atlasRenderer()
    expect(src).toContain("showLauncher = renderer === 'launcher'")
    expect(src).toMatch(/showLauncher\s*\?[\s\S]*<ProjectLauncher\s*\/>/)
  })

  it('carries a Flow-view toggle that flips to the AtlasCanvas graph', () => {
    expect(src).toContain('atlas-flow-toggle')
    expect(src).toContain('setFlowView(true)')
    expect(src).toContain('setFlowView(false)')
    // the graph still renders in the final (non-launcher, non-page) branch
    expect(src).toMatch(/<AtlasCanvas\b/)
  })

  it('only shows the toggle at the Overview level', () => {
    expect(src).toContain("level === 'overview' && (")
  })
})
