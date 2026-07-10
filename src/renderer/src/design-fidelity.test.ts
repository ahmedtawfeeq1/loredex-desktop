/**
 * DESIGN.md v2 fidelity assertions (story 14.1 AC5; story 14.2 centering +
 * density). The stylesheet is the single source of visual truth, so these
 * assert against its text: exact token hex values in both themes, the Don't
 * list (no system blue, no purple, no border > 1px outside the sanctioned
 * 4px left rails), focus ring, reduced motion, card recipe, reader measure.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(import.meta.dirname, 'styles.css'), 'utf8')

/** The first `{...}` block following a selector. */
function block(selector: string): string {
  const start = css.indexOf(selector)
  expect(start, `selector ${selector} present`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  return css.slice(open + 1, css.indexOf('}', open))
}

// DESIGN.md#tokens — verbatim
const LIGHT: Record<string, string> = {
  '--bg-app': '#f6f5f1',
  '--bg-card': '#ffffff',
  '--bg-inset': '#efeee9',
  '--hairline': '#e4e2db',
  '--text-1': '#131826',
  '--text-2': '#6e6e73',
  '--gold': '#c08a2d',
  '--gold-ink': '#131826',
  '--navy': '#131826',
  '--rust': '#a63d2f',
  '--ok': '#2e6e5e',
}
const DARK: Record<string, string> = {
  '--bg-app': '#131826',
  '--bg-card': '#1c2536',
  '--bg-inset': '#182032',
  '--hairline': '#2a3347',
  '--text-1': '#f2efe8',
  '--text-2': '#98a0b0',
  '--gold': '#e0a83e',
  '--gold-ink': '#131826',
  '--navy': '#f2efe8',
  '--rust': '#d4715f',
  '--ok': '#63b3a1',
}

describe('v2 tokens (DESIGN.md#tokens, exact)', () => {
  const light = block(':root')
  const dark = block(":root[data-theme='dark']")
  it('light theme is the :root default with the exact hex table', () => {
    for (const [token, value] of Object.entries(LIGHT)) {
      expect(light, `${token} light`).toContain(`${token}: ${value};`)
    }
  })
  it("dark theme overrides via [data-theme='dark'] with the exact hex table", () => {
    for (const [token, value] of Object.entries(DARK)) {
      expect(dark, `${token} dark`).toContain(`${token}: ${value};`)
    }
  })
  it('v1 tokens are gone — no orphan variables', () => {
    for (const dead of ['--ink', '--stamp', '--bg-raised', '--bg-content', '--bg-sidebar']) {
      expect(css.includes(`${dead}:`) || css.includes(`var(${dead})`), dead).toBe(false)
    }
  })
})

describe("the Don't list", () => {
  it('no system blue, no purple, no gradients on surfaces', () => {
    expect(css).not.toMatch(/#007aff|#0a84ff/i)
    expect(css).not.toMatch(/purple|#af52de|#bf5af2/i)
    expect(css).not.toMatch(/linear-gradient|radial-gradient/)
  })
  it('no border wider than 1px except the sanctioned 4px left rails', () => {
    // any border-* width > 1px (radii are not borders) …
    const wide = css.match(/border(?!-radius)[a-z-]*:\s*[^;]*\b([2-9]|\d{2,})px[^;]*/g) ?? []
    // … must be a border-left rail slot (transparent at rest, gold when active)
    for (const decl of wide) expect(decl).toMatch(/^border-left: 4px solid/)
  })
  it('serif never leaks into nav or buttons', () => {
    expect(block('.nav-item')).not.toContain('serif')
    expect(block('button')).not.toContain('serif')
    expect(block('.button-primary')).not.toContain('serif')
  })
})

describe('quality floor', () => {
  it('focus-visible is a 2px gold ring offset 2px', () => {
    const focus = block(':focus-visible')
    expect(focus).toContain('outline: 2px solid var(--gold);')
    expect(focus).toContain('outline-offset: 2px;')
  })
  it('reduced motion is respected globally', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

describe('v2 surfaces', () => {
  it('cards use the exact recipe: hairline, radius 12, shadow-sm', () => {
    expect(css).toContain('--shadow-card: 0 1px 3px rgba(19, 24, 38, 0.06);')
    for (const sel of ['.pane-list', '.handoff-card', '.settings-section', '.sync-grid']) {
      const b = block(sel)
      expect(b, `${sel} card`).toContain('border-radius: 12px')
      expect(b, `${sel} card`).toContain('var(--shadow-card)')
    }
  })
  it('primary button is the gold pill (radius 10, 32px, gold-ink text)', () => {
    const b = block('.button-primary')
    expect(b).toContain('background: var(--gold);')
    expect(b).toContain('color: var(--gold-ink);')
    expect(b).toContain('border-radius: 10px;')
    expect(b).toContain('height: 32px;')
  })
  it('stamp chips carry the v2 palette incl. dashed snoozed', () => {
    expect(block('.chip-open')).toContain('var(--gold)')
    expect(block('.chip-accepted')).toContain('var(--navy)')
    expect(block('.chip-declined')).toContain('var(--rust)')
    expect(block('.chip-snoozed')).toContain('border-style: dashed;')
  })
})

describe('v0.1 defects stay fixed (story 14.2)', () => {
  it('reader content is centered at a 68–76ch measure — no dead gutter', () => {
    const note = block('.note')
    expect(note).toContain('margin-inline: auto;')
    const measure = Number(note.match(/max-width:\s*(\d+)ch/)?.[1])
    expect(measure).toBeGreaterThanOrEqual(68)
    expect(measure).toBeLessThanOrEqual(76)
  })
  it('sync + settings rows are dense 38px-class rows, not web-app 24px pads', () => {
    for (const sel of ['.sync-row', '.settings-field', '.toggle-row']) {
      expect(block(sel), sel).toContain('min-height: 38px;')
    }
    expect(block('.settings-section')).toContain('padding: 16px;')
  })
})
