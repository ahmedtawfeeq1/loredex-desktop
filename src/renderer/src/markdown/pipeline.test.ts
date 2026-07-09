/**
 * Story 1.4: the sanctioned markdown pipeline renders GFM and sanitizes
 * script injection. Runs in plain node via react-dom/server.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './pipeline'

const html = (md: string): string => renderToStaticMarkup(renderMarkdown(md))

describe('sanctioned markdown pipeline', () => {
  it('renders GFM tables, strikethrough and task lists', () => {
    const out = html('| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~\n\n- [x] done')
    expect(out).toContain('<table>')
    expect(out).toContain('<del>gone</del>')
    expect(out).toContain('type="checkbox"')
  })

  it('sanitizes script content and event-handler attributes', () => {
    const out = html('hi\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('alert(1)')
  })

  it('strips javascript: urls but keeps https links', () => {
    const out = html('[bad](javascript:alert(1)) and [good](https://example.com)')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('href="https://example.com"')
  })
})
