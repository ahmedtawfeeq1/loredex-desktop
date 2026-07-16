/**
 * Atlas reframe WP4 DoD (spec §Navigation glue) — the transitions between the
 * three surfaces and the empty states. Two layers, matching this suite's house
 * style: pure assertions on breadcrumbsFor (dex › <project> at learn/deep),
 * and source-level assertions that the launcher/page wire their clicks to the
 * right store navigation and that the page hides sections when there's nothing
 * to show (fresh project, no handoffs, no flows). The node-free web project has
 * no DOM, so the wiring is read from source like atlas-view-*.test.ts.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { breadcrumbsFor } from './atlas-visibility'

const read = (f: string): string => readFileSync(join(import.meta.dirname, f), 'utf8')

describe('breadcrumbs reflect dex › <project> at learn and deep', () => {
  it('Overview is just the dex root (current, not a link)', () => {
    const crumbs = breadcrumbsFor({ level: 'overview', scope: {} })
    expect(crumbs.map((c) => c.label)).toEqual(['dex'])
    expect(crumbs[0]?.target).toBeNull()
  })

  it('Learn shows dex › <project>, dex links back to Overview', () => {
    const crumbs = breadcrumbsFor({ level: 'learn', scope: { project: 'nimbus-frontend' } })
    expect(crumbs.map((c) => c.label)).toEqual(['dex', 'nimbus-frontend'])
    expect(crumbs[0]?.target).toEqual({ level: 'overview' })
  })

  it('Deep Dive scoped to a project also reads dex › <project>', () => {
    const crumbs = breadcrumbsFor({ level: 'deep', scope: { project: 'nimbus-frontend' } })
    expect(crumbs.map((c) => c.label)).toEqual(['dex', 'nimbus-frontend'])
    expect(crumbs[0]?.target).toEqual({ level: 'overview' })
  })
})

describe('AtlasView routes through the pure renderer mapping', () => {
  const src = read('AtlasView.tsx')
  it('imports and applies atlasRenderer for the level→surface split', () => {
    expect(src).toMatch(/import\s+\{\s*atlasRenderer\s*\}\s+from\s+'\.\/atlas-renderer'/)
    expect(src).toContain('atlasRenderer(level, flowView)')
  })
})

describe('ProjectLauncher card opens the Learn page', () => {
  const src = read('ProjectLauncher.tsx')
  it("navigates to learn scoped to the card's project", () => {
    expect(src).toMatch(/navigate\('learn',\s*\{\s*project:\s*card\.project\s*\}\)/)
  })
})

describe('ProjectPage transitions and empty states', () => {
  const src = read('ProjectPage.tsx')

  it('Trace connections jumps to Deep Dive scoped to the project and arms Path', () => {
    expect(src).toMatch(/navigate\('deep',\s*\{\s*project:\s*header\.project\s*\}\)/)
    expect(src).toContain("setPanel('path')")
  })

  it('fresh project (no notes/handoffs) shows "Nothing filed for <project> yet"', () => {
    expect(src).toContain('const empty = topics.length === 0 && handoffs.length === 0')
    expect(src).toContain('Nothing filed for {header.project} yet')
    expect(src).toMatch(/\{empty\s*&&/)
  })

  it('hides the flows strip when there are no flows', () => {
    expect(src).toContain('const hasFlows = flows.inbound.length > 0 || flows.outbound.length > 0')
    expect(src).toMatch(/\{hasFlows\s*&&/)
  })

  it('hides the handoffs section when the project has no handoffs', () => {
    expect(src).toMatch(/\{handoffs\.length > 0\s*&&/)
  })
})
