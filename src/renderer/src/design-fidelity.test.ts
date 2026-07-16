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
  it('no border wider than 1px except the sanctioned left rails', () => {
    // any border-* width > 1px (radii are not borders) …
    const wide = css.match(/border(?!-radius)[a-z-]*:\s*[^;]*\b([2-9]|\d{2,})px[^;]*/g) ?? []
    // … must be a border-left rail slot (transparent at rest, gold when active),
    // the thread rail's 2px hairline connector (DESIGN.md#signature, v2), or
    // the D1 project rail on notes under a project (story 16.3)
    for (const decl of wide) {
      expect(decl).toMatch(/^border-left: (4px solid|2px solid var\(--(hairline|section-color)\))/)
    }
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
  it('reader is full-bleed (Addendum D1 supersedes the ch measure): 32px sides, no cap', () => {
    const note = block('.note')
    expect(note).not.toContain('max-width')
    expect(note).not.toContain('margin-inline')
    expect(note).toContain('padding: 32px 32px 64px;')
  })
  it('sync + settings rows are dense 38px-class rows, not web-app 24px pads', () => {
    for (const sel of ['.sync-row', '.settings-field', '.toggle-row']) {
      expect(block(sel), sel).toContain('min-height: 38px;')
    }
    expect(block('.settings-section')).toContain('padding: 16px;')
  })
})

describe('Addendum D1: collapsible rails (story 16.2)', () => {
  it('collapsed sidebar is the 56px icon rail; collapsed list is 0', () => {
    expect(block('.sidebar.rail-collapsed')).toContain('width: 56px;')
    const list = block('.pane-list.rail-collapsed')
    expect(list).toContain('width: 0;')
    expect(list).toContain('margin-right: -12px;') // swallows the flex gap
  })
  it('the slide is 160ms ease-out on both rails (reduced-motion kills it globally)', () => {
    expect(block('.sidebar')).toContain('width 160ms ease-out')
    // .pane-list's first css occurrence is the card-recipe group selector, so
    // assert the pane's own transition directly
    expect(css).toMatch(/\.pane-list \{[^}]*width 160ms ease-out/)
  })
  it('the badge survives collapse as a gold dot', () => {
    expect(block('.nav-dot')).toContain('background: var(--gold);')
  })
})

describe('Addendum D1: vault tree sections (story 16.3)', () => {
  it('section row is a rounded pill: radius 8, 11px caps label', () => {
    const row = block('.tree-section')
    expect(row).toContain('border-radius: 8px;')
    expect(row).toContain('font-size: 11px;')
    expect(row).toContain('text-transform: uppercase;')
  })
  it('tint is the section color at 12% alpha light / 20% dark', () => {
    expect(block('.tree-section')).toContain(
      'background: color-mix(in srgb, var(--section-color) 12%, transparent);',
    )
    expect(css).toMatch(
      /:root\[data-theme='dark'\] \.tree-section \{[^}]*var\(--section-color\) 20%, transparent/,
    )
  })
  it('the color dot is solid 8px round in the section color', () => {
    const dot = block('.tree-section-dot')
    expect(dot).toContain('width: 8px;')
    expect(dot).toContain('height: 8px;')
    expect(dot).toContain('border-radius: 50%;')
    expect(dot).toContain('background: var(--section-color);')
  })
  it('notes under a project carry the 2px project rail; selection keeps gold', () => {
    expect(block('.tree-file-project')).toContain('border-left: 2px solid var(--section-color);')
    expect(block(".tree-file-project[aria-current='true']")).toContain(
      'border-left: 4px solid var(--gold);',
    )
  })
})

describe('Addendum D1: wikilinks are always visibly links (story 16.1)', () => {
  it('wikilink token is #8a6116 light / gold (#e0a83e) dark', () => {
    expect(block(':root')).toContain('--wikilink: #8a6116;')
    expect(block(":root[data-theme='dark']")).toContain('--wikilink: #e0a83e;')
  })
  it('wikilinks: token color, 500 weight, no underline at rest, underline on hover', () => {
    const link = block('.note-body a.wikilink')
    expect(link).toContain('color: var(--wikilink);')
    expect(link).toContain('font-weight: 500;')
    expect(link).toContain('text-decoration: none;')
    expect(block('.note-body a.wikilink:hover')).toContain('text-decoration: underline;')
  })
  it('broken wikilinks stay rust dotted', () => {
    const broken = block('.note-body a.wikilink-broken')
    expect(broken).toContain('color: var(--rust);')
    expect(broken).toContain('dotted')
  })
  it('reading order never renders silence: unresolved names + empty state are rust', () => {
    expect(block('.ro-unresolved')).toContain('color: var(--rust);')
    expect(block('.ro-empty')).toContain('color: var(--rust);')
  })
})

describe('Addendum D2: external links are visibly hyperlinks (2026-07-16)', () => {
  it('link token is #0b57d0 light / #8ab4f8 dark — hyperlink blue, never system blue', () => {
    expect(block(':root')).toContain('--link: #0b57d0;')
    expect(block(":root[data-theme='dark']")).toContain('--link: #8ab4f8;')
  })
  it('note-body anchors: link blue, underlined at rest', () => {
    const link = block('.note-body a')
    expect(link).toContain('color: var(--link);')
    expect(link).toContain('text-decoration: underline;')
  })
})

describe('Addendum D1: edit mode + inline comments (story 16.4)', () => {
  it('the editor is textarea-grade mono 13px — markdown in, no WYSIWYG', () => {
    const editor = block('.note-editor')
    expect(editor).toContain('font-family: var(--font-mono);')
    expect(editor).toContain('font-size: 13px;')
  })
  it('the frontmatter panel is visibly locked in edit mode (caps mono label)', () => {
    const label = block('.fm-locked-label')
    expect(label).toContain('font-family: var(--font-mono);')
    expect(label).toContain('text-transform: uppercase;')
  })
  it('the unsaved dot is gold (write pending — the one gold accent here)', () => {
    expect(block('.unsaved-dot')).toContain('background: var(--gold);')
  })
  it('anchored text carries the soft gold underline-highlight', () => {
    const highlight = block('::highlight(loredex-anchor)')
    expect(highlight).toContain('color-mix(in srgb, var(--gold) 18%, transparent)')
    expect(highlight).toContain('text-decoration: underline;')
    expect(highlight).toContain('text-decoration-color: var(--gold);')
  })
  it('comment cards keep the card recipe: bg-card, hairline, shadow', () => {
    const card = block('.comment-card')
    expect(card).toContain('background: var(--bg-card);')
    expect(card).toContain('border: 1px solid var(--hairline);')
    expect(card).toContain('box-shadow: var(--shadow-card);')
  })
  it('orphaned anchors get the rust chip (quote gone from the note)', () => {
    const chip = block('.orphan-chip')
    expect(chip).toContain('color: var(--rust);')
    expect(chip).toContain('border: 1px solid var(--rust);')
    expect(chip).toContain('text-transform: uppercase;')
  })
})

describe('Addendum D1: activity cards (story 16.6)', () => {
  it('feed rows are cards: bg-card, hairline, radius 10, shadow-sm, 12px padding', () => {
    const card = block('.feed-card')
    expect(card).toContain('background: var(--bg-card);')
    expect(card).toContain('border: 1px solid var(--hairline);')
    expect(card).toContain('border-radius: 10px;')
    expect(card).toContain('box-shadow: var(--shadow-card);')
    expect(card).toContain('padding: 12px;')
  })
  it('kind chips are mono 9px with a kind-tinted border', () => {
    const chip = block('.feed-kind')
    expect(chip).toContain('font-family: var(--font-mono);')
    expect(chip).toContain('font-size: 9px;')
    expect(chip).toContain('border: 1px solid currentColor;')
    expect(block('.feed-kind-route')).toContain('var(--ok)')
    expect(block('.feed-kind-handoff')).toContain('var(--gold)')
    expect(block('.feed-kind-status')).toContain('var(--navy)')
  })
  it('paths and times are mono 11px --text-2 (absolute/full ride hover titles)', () => {
    for (const sel of ['.feed-path', '.feed-time']) {
      const b = block(sel)
      expect(b, sel).toContain('font-family: var(--font-mono);')
      expect(b, sel).toContain('font-size: 11px;')
      expect(b, sel).toContain('color: var(--text-2);')
    }
  })
  it('action pills are navy outline (no second gold in the view); serif only for quoted objectives', () => {
    const pill = block('.feed-action')
    expect(pill).toContain('border: 1px solid var(--navy);')
    expect(pill).toContain('color: var(--navy);')
    expect(pill).not.toContain('--gold')
    expect(block('.feed-summary-objective')).toContain('font-family: var(--font-serif);')
  })
  it('the churn flip rail is the sanctioned 2px hairline connector', () => {
    expect(block('.feed-flips')).toContain('border-left: 2px solid var(--hairline);')
  })
})
