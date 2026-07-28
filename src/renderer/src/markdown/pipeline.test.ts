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

/**
 * Reported 2026-07-23: a fenced block in a NOTE had no way to copy it. The
 * copy-enabled <pre> lived in agent/agentMarkdown.tsx, so the affordance existed
 * only in chat — the reader rendered a bare <pre>. A code block is copiable
 * wherever it appears, so `pre: CodeBlock` now lives in the shared pipeline.
 */
describe('fenced code is copiable in the reader too (2026-07-23)', () => {
  it('wraps a fenced block and gives it a Copy button', () => {
    const out = html('```sh\nls -la\n```')
    expect(out).toContain('agent-code-wrap')
    expect(out).toContain('agent-copy-code')
    // the button is a SIBLING of <pre>, never inside the scroll container (BL-3)
    expect(out).toMatch(/<div class="agent-code-wrap"><button[^>]*agent-copy-code/)
  })

  it('a block with no language still gets one — that is the common case in notes', () => {
    const out = html('```\nEnter ONLY when…\n```')
    expect(out).toContain('agent-copy-code')
  })

  it('inline code in a sentence still gets nothing', () => {
    const out = html('use `ls -la` here')
    expect(out).toContain('<code>ls -la</code>')
    expect(out).not.toContain('agent-copy-code')
  })
})

/**
 * ```mermaid renders as the diagram (Mermaid.tsx). mermaid itself only loads in
 * the browser (dynamic import inside the effect), so on this node-side render
 * the block is present but still pending — which is exactly the assertion that
 * would fail if the fence ever fell back to a plain code block again.
 */
describe('mermaid fences render as a diagram viewer', () => {
  const flow = '```mermaid\nflowchart TD\n  A --> B\n```'

  it('replaces the code block with the viewer', () => {
    const out = html(flow)
    expect(out).toContain('mermaid-block')
    expect(out).toContain('Rendering diagram')
    expect(out).not.toContain('agent-code-wrap')
  })

  it('keeps zoom and expand controls', () => {
    const out = html(flow)
    expect(out).toContain('Zoom in')
    expect(out).toContain('Expand')
    expect(out).toContain('100%')
  })

  it('leaves other languages alone', () => {
    expect(html('```js\nconst mermaid = 1\n```')).not.toContain('mermaid-block')
  })
})
