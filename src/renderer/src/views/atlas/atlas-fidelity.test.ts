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

/** The first `{...}` block following a selector. */
function block(selector: string): string {
  const start = css.indexOf(selector)
  expect(start, `selector ${selector} present`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  return css.slice(open + 1, css.indexOf('}', open))
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
