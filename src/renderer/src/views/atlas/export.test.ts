/**
 * Story 10.7 AC3/AC5: the export SVG stands alone — CSS variables resolved to
 * literal colors (no `var(--…)` anywhere), caption present, renders on a
 * solid background.
 */
import { describe, expect, it } from 'vitest'
import { buildExportSvg, resolveCssVars } from './export'

const PALETTE: Record<string, string> = {
  '--gold': '#C08A2D',
  '--navy': '#131826',
  '--hairline': '#E4E2DB',
  '--font-mono': 'ui-monospace, monospace',
}
const resolve = (name: string): string => PALETTE[name] ?? ''

describe('resolveCssVars', () => {
  it('replaces variables with literal values, including inside shorthand', () => {
    const css = '.atlas-card { stroke: var(--hairline); fill: var(--navy); }'
    expect(resolveCssVars(css, resolve)).toBe(
      '.atlas-card { stroke: #E4E2DB; fill: #131826; }',
    )
  })

  it('uses the fallback when the variable is unknown, else currentColor', () => {
    expect(resolveCssVars('a { color: var(--ghost, #123456); }', resolve)).toBe(
      'a { color: #123456; }',
    )
    expect(resolveCssVars('a { color: var(--ghost); }', resolve)).toBe(
      'a { color: currentColor; }',
    )
  })

  it('resolves nested fallbacks to a fixed point', () => {
    expect(resolveCssVars('a { color: var(--ghost, var(--gold)); }', resolve)).toBe(
      'a { color: #C08A2D; }',
    )
  })
})

describe('buildExportSvg', () => {
  const svg = buildExportSvg({
    width: 1200,
    height: 800,
    viewBox: '40 60 1600 1100',
    inner: '<g class="atlas-nodes"><rect class="atlas-card"/></g>',
    css: resolveCssVars('.atlas-card { stroke: var(--hairline); }', resolve),
    caption: 'nimbus-vault · 2026-07-10',
    bg: '#F6F5F1',
    ink: '#6E6E73',
    monoFont: PALETTE['--font-mono'] as string,
  })

  it('contains no CSS-variable references (AC5 snapshot rule)', () => {
    expect(svg).not.toContain('var(--')
  })

  it('carries the mono caption and a solid background', () => {
    expect(svg).toContain('nimbus-vault · 2026-07-10')
    expect(svg).toContain('fill="#F6F5F1"')
    expect(svg).toContain('font-family="ui-monospace, monospace"')
  })

  it('preserves the viewport (current viewBox) and inlines the styles', () => {
    expect(svg).toContain('viewBox="40 60 1600 1100"')
    expect(svg).toContain('<style>.atlas-card { stroke: #E4E2DB; }</style>')
    expect(svg).toContain('class="atlas-nodes"')
  })

  it('escapes the caption (never raw markup in the output)', () => {
    const sneaky = buildExportSvg({
      width: 10,
      height: 10,
      viewBox: '0 0 10 10',
      inner: '',
      css: '',
      caption: 'a<b>&c',
      bg: '#fff',
      ink: '#000',
      monoFont: 'monospace',
    })
    expect(sneaky).toContain('a&lt;b&gt;&amp;c')
  })
})
