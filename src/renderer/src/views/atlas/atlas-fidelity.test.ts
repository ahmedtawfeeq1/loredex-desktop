/**
 * D1 amendment 5 (epic19.1) — atlas.css fidelity assertions in the design-
 * fidelity pattern (stylesheet is the single source of visual truth, so assert
 * against its text): header breathing room (16px horizontal + 12px vertical, a
 * hairline divider BELOW the toolbar), the 16px canvas inset, and the floating
 * zoom pill stack recipe (--bg-card / hairline / shadow-sm, 28px mono buttons).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(import.meta.dirname, 'atlas.css'), 'utf8')
// WP3 side-panel + body rules live in the global stylesheet, not atlas.css
const styles = readFileSync(join(import.meta.dirname, '../../styles.css'), 'utf8')

/** The first `{...}` block following a selector, in the given stylesheet text. */
function blockIn(sheet: string, selector: string): string {
  const start = sheet.indexOf(selector)
  expect(start, `selector ${selector} present`).toBeGreaterThanOrEqual(0)
  const open = sheet.indexOf('{', start)
  return sheet.slice(open + 1, sheet.indexOf('}', open))
}

/** The first `{...}` block following a selector. */
function block(selector: string): string {
  return blockIn(css, selector)
}

describe('header breathing room (D1a5)', () => {
  it('the toolbar row gets 16px horizontal + 12px vertical padding', () => {
    expect(block('.atlas > .atlas-header')).toContain('padding: 12px 16px;')
  })
  it('the hairline divider sits below the toolbar, not the top edge', () => {
    expect(block('.atlas > .atlas-header')).toContain('border-bottom: 1px solid var(--hairline);')
  })
  it('the canvas region is inset 16px from the ground on sides + bottom', () => {
    const pane = block('.atlas > .atlas-pane')
    expect(pane).toContain('margin: 0 16px 16px;')
    expect(pane).toContain('position: relative;') // anchors the zoom pills
  })
})

describe('floating zoom pill stack (D1a5)', () => {
  it('is a bottom-right --bg-card pill: hairline, radius 10, shadow-sm', () => {
    const stack = block('.atlas-zoom-controls')
    expect(stack).toContain('position: absolute;')
    expect(stack).toContain('right: 12px;')
    expect(stack).toContain('bottom: 12px;')
    expect(stack).toContain('background: var(--bg-card);')
    expect(stack).toContain('border: 1px solid var(--hairline);')
    expect(stack).toContain('border-radius: 10px;')
    expect(stack).toContain('box-shadow: 0 1px 3px rgba(19, 24, 38, 0.06);')
  })
  it('buttons are 28px mono glyphs with a ≤120ms transition', () => {
    const btn = block('.atlas-zoom-btn')
    expect(btn).toContain('width: 28px;')
    expect(btn).toContain('height: 28px;')
    expect(btn).toContain('font-family: var(--font-mono);')
    expect(btn).toMatch(/transition: background \d{1,3}ms/)
    const ms = Number(/transition: background (\d{1,3})ms/.exec(btn)?.[1])
    expect(ms).toBeLessThanOrEqual(120)
  })
  it('introduces no border wider than 1px', () => {
    const wide = css.match(/border(?!-radius)[a-z-]*:\s*[^;]*\b([2-9]|\d{2,})px[^;]*/g) ?? []
    expect(wide).toEqual([])
  })
})

describe('hover emphasis stays on-brand (WP5)', () => {
  it('hot edges stroke gold, not navy — navy flips to paper-white in dark', () => {
    const hot = block('.atlas-edge-hot .atlas-edge-line')
    expect(hot).toContain('stroke: var(--gold);')
    expect(hot).not.toContain('var(--navy)')
  })
  it('keeps the non-neighbor fade at 30%', () => {
    expect(css).toContain('opacity: 0.3;')
  })
  it('the atlas stylesheet declares no drop-shadow filter (raster-tile corruption)', () => {
    // strip comments (they explain the deliberate absence) then check declarations
    const decls = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(decls).not.toContain('drop-shadow')
  })
})

describe('collapsed topic card is a solid expandable affordance (WP5)', () => {
  it('has a solid subtle fill + hairline, not the weak dashed-empty look', () => {
    const card = blockIn(styles, '.atlas-topic-card {')
    expect(card).toContain('fill: var(--bg-inset);')
    expect(card).toContain('stroke: var(--hairline);')
    expect(card).not.toContain('stroke-dasharray')
  })
})

describe('side panels are a floating overlay, not a flex-squish (WP3)', () => {
  it('.atlas-body is a positioned container the panel can dock into', () => {
    expect(blockIn(styles, '.atlas-body')).toContain('position: relative;')
  })
  it('.atlas-side is absolutely positioned, right-docked, 300px — out of normal flow', () => {
    const side = blockIn(styles, '.atlas-side {')
    expect(side).toContain('position: absolute;')
    expect(side).toContain('right: 0;')
    expect(side).toContain('top: 0;')
    expect(side).toContain('bottom: 0;')
    expect(side).toContain('width: 300px;')
    // NOT a normal-flow flex sibling that steals width from the canvas
    expect(side).not.toContain('flex: none;')
  })
  it('.atlas-side floats above the canvas with a left hairline + shadow', () => {
    const side = blockIn(styles, '.atlas-side {')
    expect(side).toMatch(/z-index:\s*[1-9]/)
    expect(side).toContain('border-left: 1px solid var(--hairline);')
    expect(side).toContain('box-shadow:')
  })
  it('long objectives wrap instead of overflowing the 300px panel', () => {
    expect(blockIn(styles, '.atlas-side {')).toContain('overflow-wrap: anywhere;')
  })
})

describe('WP-A: magnitude on the edge, no aggregated pill', () => {
  const canvas = readFileSync(join(import.meta.dirname, 'AtlasCanvas.tsx'), 'utf8')

  it('renders no aggregated `N open / M total` pill on the canvas', () => {
    // the whole pill mechanism is gone from the canvas and the stylesheets
    expect(canvas).not.toContain('atlas-edge-badge')
    expect(canvas).not.toContain('routeBadge')
    expect(css).not.toContain('atlas-edge-badge')
    expect(styles).not.toContain('atlas-edge-badge')
  })

  it('encodes total on the edge stroke width via the edgeWidth scale', () => {
    expect(canvas).toContain('edgeWidth(edge.totalCount)')
    expect(canvas).toContain('strokeWidth')
  })

  it('draws the gold open-count dot ONLY when open > 0, near the target end', () => {
    // the dot is gated on openCount > 0 and is placed clear of the arrowhead
    // (openDotAt takes the stroke width so it can back off the scaled head)
    expect(canvas).toMatch(/openCount\s*>\s*0\s*\?\s*openDotAt\(points,\s*edgeWidth/)
    expect(canvas).toContain('atlas-edge-opendot')
    // and it is styled gold with gold-ink text
    expect(blockIn(styles, '.atlas-edge-opendot circle')).toContain('fill: var(--gold);')
    expect(blockIn(styles, '.atlas-edge-opendot text')).toContain('fill: var(--gold-ink);')
  })
})
