/**
 * Story 16.7 (D1 amendment 2): the editor's syntax highlighting and chrome
 * are themed ONLY through styles.css tokens — every highlight color is a
 * `var(--token)` and every token exists in BOTH theme blocks, so light/dark
 * apply to the editor with zero editor-side switching.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EDITOR_V2_CSS, HIGHLIGHT_TOKENS, markdownHighlight } from './editorTheme'

// tokens live in the handoff drop-in now; styles.css holds aliases on top
const css =
  readFileSync(join(import.meta.dirname, '../../assets/loredex-v3.css'), 'utf8') +
  readFileSync(join(import.meta.dirname, '../../styles.css'), 'utf8')

/** The first `{…}` block following a selector (same helper as design-fidelity). */
function block(selector: string): string {
  const start = css.indexOf(selector)
  expect(start, `selector ${selector} present`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  return css.slice(open + 1, css.indexOf('}', open))
}

// theme-independent aliases (styles.css :root) count for BOTH themes —
// they resolve to themed drop-in tokens
const aliases = css.slice(css.lastIndexOf('/* legacy aliases'), css.indexOf('--brand'))
const dark =
  css.slice(css.indexOf(':root {'), css.indexOf('\n[data-theme="light"] {')) + aliases
const light =
  css.slice(css.indexOf('\n[data-theme="light"] {'), css.indexOf('PRIMITIVES — exact values')) +
  aliases

describe('highlight styles ride the app theme tokens (both themes)', () => {
  it('every syntax tint is a var(--token), nothing hard-coded', () => {
    for (const [role, value] of Object.entries(HIGHLIGHT_TOKENS)) {
      expect(value, role).toMatch(/^var\(--[a-z0-9-]+\)$/)
    }
  })

  it('every referenced token is defined in the light AND dark theme blocks', () => {
    const tokens = new Set(
      Object.values(HIGHLIGHT_TOKENS).map((v) => /^var\((--[a-z0-9-]+)\)$/.exec(v)?.[1] as string),
    )
    for (const token of tokens) {
      expect(light, `${token} light`).toContain(`${token}:`)
      expect(dark, `${token} dark`).toContain(`${token}:`)
    }
  })

  it('the HighlightStyle covers the spec surface: headings, bold, code, links', () => {
    const styled = markdownHighlight.specs.flatMap((s) => (Array.isArray(s.tag) ? s.tag : [s.tag]))
    const names = new Set(styled.map((tag) => String(tag)))
    for (const wanted of ['heading', 'strong', 'emphasis', 'strikethrough', 'monospace', 'link', 'url', 'quote']) {
      expect([...names].some((n) => n.includes(wanted)), wanted).toBe(true)
    }
  })
})

describe('editor v2 chrome (EDITOR_V2_CSS, mounted by NoteEditor)', () => {
  it('draws only with theme tokens — hairlines, card/inset surfaces, ink', () => {
    for (const token of ['var(--hairline)', 'var(--bg-card)', 'var(--bg-inset)', 'var(--text-1)', 'var(--text-2)', 'var(--font-mono)']) {
      expect(EDITOR_V2_CSS).toContain(token)
    }
    // no raw hex colors smuggled in beside the tokens
    expect(EDITOR_V2_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('toolbar buttons are the specced 28px; the host is full-bleed (no border box)', () => {
    expect(EDITOR_V2_CSS).toContain('width: 28px')
    expect(EDITOR_V2_CSS).toContain('height: 28px')
    const host = EDITOR_V2_CSS.slice(EDITOR_V2_CSS.indexOf('.note-editor-cm'))
    expect(host).not.toContain('border:')
  })
})
