/**
 * DESIGN v3 "Obsidian Glass / Cobalt" fidelity assertions (docs/DESIGN.md v3
 * amendment §2; supersedes the v2 tables — the v2 quality floor stays). The
 * stylesheet is the single source of visual truth, so these assert against
 * its text: exact §2 token hex values in both themes (dark-first :root,
 * [data-theme='light'] overrides), the Don't list (no system blue, no purple,
 * no gradient outside the sanctioned cobalt button recipe, no border > 1px
 * outside the sanctioned rails), cobalt focus ring, reduced motion, card
 * recipe, reader measure, Geist type stacks.
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

// DESIGN.md v3 §2 — verbatim (dark is the :root default)
const DARK: Record<string, string> = {
  '--bg-app': '#0b0d12',
  '--bg-card': '#12151c',
  '--bg-hover': '#171b23',
  '--bg-inset': '#0f1218',
  '--bg-overlay': '#1d222c',
  '--hairline': '#232936',
  '--hairline-2': '#2f3646',
  '--text-1': '#e8eaf0',
  '--text-2': '#9aa3b2',
  '--text-3': '#6b7280',
  '--accent': '#5584e8',
  '--accent-hi': '#6e96ee',
  '--accent-lo': '#4a75d6',
  '--accent-press': '#3f69cc',
  '--accent-ink': '#f5f8ff',
  '--link': '#8fb1f5',
  '--warn': '#e3a73c',
  '--ok': '#3bcb8b',
  '--rust': '#ef5d55',
  '--info': '#93a6c9',
  '--brand': '#d9a63c',
}
const LIGHT: Record<string, string> = {
  '--bg-app': '#f3f2ee',
  '--bg-card': '#ffffff',
  '--bg-hover': '#faf9f5',
  '--bg-inset': '#eae8e1',
  '--bg-overlay': '#ffffff',
  '--hairline': '#e1ded4',
  '--hairline-2': '#d6d3c8',
  '--text-1': '#16181d',
  '--text-2': '#565d68',
  '--text-3': '#8a8f99',
  '--accent': '#2e5fc7',
  '--accent-hi': '#3d6fd6',
  '--accent-lo': '#2854b2',
  '--accent-press': '#234a9e',
  '--accent-ink': '#ffffff',
  '--link': '#2e5fc7',
  '--warn': '#96700f',
  '--ok': '#1e8f5f',
  '--rust': '#b44439',
  '--info': '#5c6b85',
  '--brand': '#be8c22',
}

describe('v3 tokens (DESIGN.md v3 §2, exact)', () => {
  const dark = block(':root')
  const light = block("[data-theme='light'] {")
  it('dark theme is the :root default with the exact §2 hex table', () => {
    for (const [token, value] of Object.entries(DARK)) {
      expect(dark, `${token} dark`).toContain(`${token}: ${value};`)
    }
    expect(dark).toContain('--focus: rgba(85, 132, 232, 0.55);')
  })
  it("light theme overrides via [data-theme='light'] with the exact §2 hex table", () => {
    for (const [token, value] of Object.entries(LIGHT)) {
      expect(light, `${token} light`).toContain(`${token}: ${value};`)
    }
    expect(light).toContain('--focus: rgba(46, 95, 199, 0.45);')
  })
  it('retired tokens are gone — no orphan variables (v1 set + v2 gold/navy)', () => {
    const dead = ['--ink', '--stamp', '--bg-raised', '--bg-content', '--bg-sidebar', '--gold', '--gold-ink', '--navy']
    for (const token of dead) {
      expect(css.includes(`${token}:`) || css.includes(`var(${token})`), token).toBe(false)
    }
  })
})

describe('v3 typography (§3): Geist / Geist Mono, self-hosted', () => {
  // the type-role tokens live in the second :root block — assert on the sheet
  it('the UI stack leads with Geist, the mono stack with Geist Mono', () => {
    expect(css).toContain("--font-ui: 'Geist',")
    expect(css).toContain("--font-mono: 'Geist Mono',")
  })
  it('note roles default to Geist / Geist Mono (retro + serif defaults retired)', () => {
    expect(css).toContain('--note-title: var(--font-ui);')
    expect(css).toContain('--note-heading: var(--font-ui);')
    expect(css).toContain('--note-body: var(--font-ui);')
    expect(css).toContain('--note-code: var(--font-mono);')
  })
})

describe("the Don't list", () => {
  it('no system blue, no purple', () => {
    expect(css).not.toMatch(/#007aff|#0a84ff/i)
    expect(css).not.toMatch(/purple|#af52de|#bf5af2/i)
  })
  it('any gradient is the sanctioned cobalt button recipe (§4), nothing else', () => {
    const grads = css.match(/linear-gradient\((?:[^()]|\([^()]*\))*\)/g) ?? []
    for (const g of grads) {
      // rest state 400→lo, hover lightens one step (400→400) — §4
      expect(g).toMatch(
        /^linear-gradient\(180deg, var\(--accent-hi\), var\(--accent-(hi|lo)\)\)$/,
      )
    }
    expect(css).not.toMatch(/radial-gradient/)
  })
  it('no border wider than 1px except the sanctioned left rails', () => {
    // any border-* width > 1px (radii are not borders) …
    const wide = css.match(/border(?!-radius)[a-z-]*:\s*[^;]*\b([2-9]|\d{2,})px[^;]*/g) ?? []
    // … must be a border-left rail slot (transparent at rest, cobalt when
    // active), the thread rail's 2px hairline connector, or the D1 project
    // rail on notes under a project (story 16.3)
    for (const decl of wide) {
      expect(decl).toMatch(
        /^border-left: (4px solid|2px solid (transparent|var\(--(hairline|section-color|accent)\)))/,
      )
    }
  })
  it('serif never leaks into nav or buttons', () => {
    expect(block('.nav-item')).not.toContain('serif')
    expect(block('button')).not.toContain('serif')
    expect(block('.button-primary')).not.toContain('serif')
  })
})

describe('quality floor', () => {
  it('focus-visible is a 2px cobalt ring offset 2px', () => {
    const focus = block(':focus-visible')
    expect(focus).toContain('outline: 2px solid var(--accent);')
    expect(focus).toContain('outline-offset: 2px;')
  })
  it('reduced motion is respected globally', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

describe('v3 surfaces', () => {
  it('cards use the exact recipe: hairline, radius 12, shadow-sm', () => {
    expect(css).toContain('--shadow-card: 0 1px 3px rgba(19, 24, 38, 0.06);')
    for (const sel of ['.pane-list', '.handoff-card', '.settings-section', '.sync-grid']) {
      const b = block(sel)
      expect(b, `${sel} card`).toContain('border-radius: 12px')
      expect(b, `${sel} card`).toContain('var(--shadow-card)')
    }
  })
  it('primary button is the §4 cobalt gradient pill: radius 8, bevel, accent ink', () => {
    const b = block('.button-primary')
    expect(b).toContain('background: linear-gradient(180deg, var(--accent-hi), var(--accent-lo));')
    expect(b).toContain('color: var(--accent-ink);')
    expect(b).toContain('border-radius: 8px;')
    expect(b).toContain('font-weight: 600;')
    expect(b).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.25)')
    expect(block('.button-primary:active:not(:disabled)')).toContain('background: var(--accent-press);')
  })
  it('secondary = overlay + hairline-2 + top-light; ghost transparent; danger rust-bordered (§4)', () => {
    const b = block('.button-secondary')
    expect(b).toContain('background: var(--bg-overlay);')
    expect(b).toContain('border: 1px solid var(--hairline-2);')
    expect(block('.button-quiet')).toContain('background: transparent;')
    expect(block('.button-destructive')).toContain('border: 1px solid rgba(229, 72, 77, 0.35);')
    expect(block('.button-destructive')).toContain('color: var(--rust);')
  })
  it('button focus ring is the §4 lifted ring: 2px card gap + 4px --focus', () => {
    const focus = block('.button-primary:focus-visible')
    expect(focus).toContain('box-shadow: 0 0 0 2px var(--bg-card), 0 0 0 4px var(--focus);')
  })
  it('kbd hints are 9px mono caps, 1px border, radius 3 (§4)', () => {
    const kbd = block('.kbd')
    expect(kbd).toContain('font-family: var(--font-mono);')
    expect(kbd).toContain('font-size: 9px;')
    expect(kbd).toContain('border: 1px solid currentColor;')
    expect(kbd).toContain('border-radius: 3px;')
  })
  it('segmented control is pressed glass: inset track radius 10 pad 3, overlay active with top-light (§4)', () => {
    const track = block('.seg-control')
    expect(track).toContain('background: var(--bg-inset);')
    expect(track).toContain('border-radius: 10px;')
    expect(track).toContain('padding: 3px;')
    const active = block(".seg-option[aria-pressed='true']")
    expect(active).toContain('background: var(--bg-overlay);')
    expect(active).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.12)')
  })
  it('status chips are glyph + label, never color alone (§4)', () => {
    expect(block('.chip-glyph')).toContain('border-radius: 4px;')
    // OPEN: amber ring-dot chip — mono 10, amber border rgba(.4), bg rgba(.07)
    const open = block('.chip-open')
    expect(open).toContain('color: var(--warn);')
    expect(open).toContain('border: 1px solid rgba(227, 167, 60, 0.4);')
    expect(open).toContain('background: rgba(227, 167, 60, 0.07);')
    // ✓ ready/consumable rides ok-green tint; ✕ declined rust; ! stale amber
    expect(block('.chip-accepted .chip-glyph')).toContain('rgba(59, 203, 139, 0.14)')
    expect(block('.chip-declined .chip-glyph')).toContain('rgba(239, 93, 85, 0.14)')
    expect(block('.chip-stale .chip-glyph')).toContain('rgba(227, 167, 60, 0.14)')
    // – consumed muted; REQUEST info-bordered; snoozed keeps the dash
    expect(block('.chip-consumed .chip-glyph')).toContain('var(--bg-hover)')
    expect(block('.chip-request')).toContain('color: var(--info);')
    expect(block('.chip-snoozed')).toContain('dashed')
  })
  it('row item: 40px two-line anatomy, selected = 2px cobalt bar, hover --bg-hover (§4)', () => {
    const row = block('.row-item')
    expect(row).toContain('min-height: 40px;')
    expect(block('.row-item:hover')).toContain('background: var(--bg-hover);')
    expect(block(".row-item[aria-current='true']")).toContain('border-left: 2px solid var(--accent);')
    expect(block('.row-title')).toContain('font-size: 12.5px;')
    expect(block('.row-sub')).toContain('font-family: var(--font-mono);')
  })
  it('agent chip: sacred green live dot with the §4 glow; pulse dies under reduced motion globally', () => {
    const dot = block('.agent-dot-live')
    expect(dot).toContain('background: var(--ok);')
    expect(dot).toContain('box-shadow: 0 0 7px rgba(59, 203, 139, 0.8);')
    expect(dot).toContain('animation: agent-pulse')
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
  it('the badge survives collapse as an amber dot (open = attention, §1)', () => {
    expect(block('.nav-dot')).toContain('background: var(--warn);')
  })
})

describe('Addendum D1: dex tree sections (story 16.3)', () => {
  it('section row is a rounded pill: radius 8, 11px caps label', () => {
    const row = block('.tree-section')
    expect(row).toContain('border-radius: 8px;')
    expect(row).toContain('font-size: 11px;')
    expect(row).toContain('text-transform: uppercase;')
  })
  it('tint is the section color at 20% alpha dark (default) / 12% light', () => {
    expect(block('.tree-section')).toContain(
      'background: color-mix(in srgb, var(--section-color) 20%, transparent);',
    )
    expect(css).toMatch(
      /\[data-theme='light'\] \.tree-section \{[^}]*var\(--section-color\) 12%, transparent/,
    )
  })
  it('the color dot is solid 8px round in the section color', () => {
    const dot = block('.tree-section-dot')
    expect(dot).toContain('width: 8px;')
    expect(dot).toContain('height: 8px;')
    expect(dot).toContain('border-radius: 50%;')
    expect(dot).toContain('background: var(--section-color);')
  })
  it('notes under a project carry the 2px project rail; selection is cobalt', () => {
    expect(block('.tree-file-project')).toContain('border-left: 2px solid var(--section-color);')
    expect(block(".tree-file-project[aria-current='true']")).toContain(
      'border-left: 4px solid var(--accent);',
    )
  })
})

describe('Addendum D1: wikilinks are always visibly links (story 16.1)', () => {
  it('wikilink token rides cobalt: #8fb1f5 dark / #2e5fc7 light', () => {
    expect(block(':root')).toContain('--wikilink: #8fb1f5;')
    expect(block("[data-theme='light'] {")).toContain('--wikilink: #2e5fc7;')
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

describe('Addendum D2 (recolored by v3): external links are visibly hyperlinks', () => {
  it('link token is cobalt 300 dark / cobalt light (§2 --link), never system blue', () => {
    expect(block(':root')).toContain('--link: #8fb1f5;')
    expect(block("[data-theme='light'] {")).toContain('--link: #2e5fc7;')
  })
  it('note-body anchors: link cobalt, underlined at rest', () => {
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
  it('the unsaved dot is amber (write pending = attention, §1)', () => {
    expect(block('.unsaved-dot')).toContain('background: var(--warn);')
  })
  it('anchored text carries the soft accent underline-highlight', () => {
    const highlight = block('::highlight(loredex-anchor)')
    expect(highlight).toContain('color-mix(in srgb, var(--accent) 18%, transparent)')
    expect(highlight).toContain('text-decoration: underline;')
    expect(highlight).toContain('text-decoration-color: var(--accent);')
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
  it('kind chips are mono 9px with a kind-tinted border (§1 roles)', () => {
    const chip = block('.feed-kind')
    expect(chip).toContain('font-family: var(--font-mono);')
    expect(chip).toContain('font-size: 9px;')
    expect(chip).toContain('border: 1px solid currentColor;')
    expect(block('.feed-kind-route')).toContain('var(--ok)')
    expect(block('.feed-kind-handoff')).toContain('var(--warn)')
    expect(block('.feed-kind-status')).toContain('var(--info)')
  })
  it('paths and times are mono 11px --text-2 (absolute/full ride hover titles)', () => {
    for (const sel of ['.feed-path', '.feed-time']) {
      const b = block(sel)
      expect(b, sel).toContain('font-family: var(--font-mono);')
      expect(b, sel).toContain('font-size: 11px;')
      expect(b, sel).toContain('color: var(--text-2);')
    }
  })
  it('action pills are ink outline (no second accent in the view); serif only for quoted objectives', () => {
    const pill = block('.feed-action')
    expect(pill).toContain('border: 1px solid var(--text-1);')
    expect(pill).toContain('color: var(--text-1);')
    expect(pill).not.toContain('--accent')
    expect(block('.feed-summary-objective')).toContain('font-family: var(--font-serif);')
  })
  it('the churn flip rail is the sanctioned 2px hairline connector', () => {
    expect(block('.feed-flips')).toContain('border-left: 2px solid var(--hairline);')
  })
})
