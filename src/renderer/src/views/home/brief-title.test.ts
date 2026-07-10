/** Defect 14.2-1: the brief title renders exactly once — the chrome owns it. */
import { describe, expect, it } from 'vitest'
import { DEFAULT_BRIEF_TITLE, splitLeadingH1, stripDuplicateH1 } from './brief-title'

describe('splitLeadingH1', () => {
  it('lifts a leading H1 into the chrome title and strips it from the body', () => {
    const { title, body } = splitLeadingH1('# Start Here — Nimbus\n\nSome intro.\n')
    expect(title).toBe('Start Here — Nimbus')
    expect(body).not.toMatch(/^#\s/m)
    expect(body).toContain('Some intro.')
  })

  it('tolerates leading blank lines before the H1', () => {
    const { title, body } = splitLeadingH1('\n\n# Brief\nbody text')
    expect(title).toBe('Brief')
    expect(body).toBe('body text')
  })

  it('leaves markdown without a leading H1 verbatim, falling back to the default title', () => {
    const md = 'Intro paragraph.\n\n## Section\n'
    expect(splitLeadingH1(md)).toEqual({ title: null, body: md })
    expect(DEFAULT_BRIEF_TITLE).toBe('Start Here — Product')
  })

  it('does not treat deeper headings or mid-document H1s as the title', () => {
    expect(splitLeadingH1('## Not a title\n# later').title).toBeNull()
    const { body } = splitLeadingH1('# Title\ntext\n# Another H1 stays')
    expect(body).toContain('# Another H1 stays')
  })
})

describe('stripDuplicateH1 (Addendum D1 — index/MOC duplicate title, story 16.1)', () => {
  it('strips the leading H1 when it repeats the chrome title (case-insensitive)', () => {
    const md = '# nimbus-backend\n\n## streaming — 2026-07-10\n\n- [[a-note]]\n'
    const out = stripDuplicateH1(md, 'nimbus-backend')
    expect(out).not.toContain('# nimbus-backend')
    expect(out).toContain('## streaming')
    expect(stripDuplicateH1('# Home\nbody', 'home')).toBe('body')
  })

  it('keeps a leading H1 with its own wording, and bodies without one, verbatim', () => {
    const curated = '# Handoff — a → b\n\ntext'
    expect(stripDuplicateH1(curated, '2026-07-10-handoff-a')).toBe(curated)
    const plain = 'no heading here'
    expect(stripDuplicateH1(plain, 'anything')).toBe(plain)
  })
})
