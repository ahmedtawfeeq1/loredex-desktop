/**
 * Story 12.1 AC2/AC4/AC5: CommitChip variants — GitHub base → linked chip with
 * the derived URL; no base → plain mono text and NO anchor (never a broken
 * URL); the PR slot renders nothing until story 12.2 populates it.
 * Static-markup render in plain node (same approach as pipeline.test.ts).
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CommitChip, type PrInfo } from './CommitChip'

const SHA = '0123456789abcdef0123456789abcdef01234567'

const html = (props: Parameters<typeof CommitChip>[0]): string =>
  renderToStaticMarkup(createElement(CommitChip, props))

describe('CommitChip', () => {
  it('links the short sha to <base>/commit/<sha> when the remote is GitHub', () => {
    const out = html({ sha: SHA, base: 'https://github.com/acme/nimbus' })
    expect(out).toContain(`href="https://github.com/acme/nimbus/commit/${SHA}"`)
    expect(out).toContain('>0123456</a>')
    expect(out).toContain('target="_blank"') // main-process guard opens externally
  })

  it('renders plain mono text without a base — no anchor, no broken URL', () => {
    const out = html({ sha: SHA, base: null })
    expect(out).toContain('0123456')
    expect(out).not.toContain('<a')
    expect(out).not.toContain('href')
  })

  it('PR slot renders nothing until story 12.2 populates it', () => {
    expect(html({ sha: SHA, base: null })).not.toContain('commit-pr')
    expect(html({ sha: SHA, base: null, pr: null })).not.toContain('commit-pr')
  })

  it('PR slot renders number + state when populated; merged is distinct', () => {
    const pr: PrInfo = {
      url: 'https://github.com/acme/nimbus/pull/42',
      number: 42,
      title: 'Ship the thing',
      state: 'MERGED',
      mergedAt: '2026-07-09T10:00:00Z',
    }
    const out = html({ sha: SHA, base: 'https://github.com/acme/nimbus', pr })
    expect(out).toContain('href="https://github.com/acme/nimbus/pull/42"')
    expect(out).toContain('commit-pr-merged')
    expect(out).toContain('#42 merged')
  })
})
