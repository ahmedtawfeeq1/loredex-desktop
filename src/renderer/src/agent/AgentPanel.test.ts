/**
 * Step A1: agent/user bubbles render sanitized, syntax-highlighted markdown
 * through the panel-local processor; thinking collapses into <details>; tool
 * rows stay mono machine lines. Runs in plain node via react-dom/server — the
 * ThreadItem markup is the assertion surface (no DOM needed, pipeline.test.ts
 * precedent).
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AcpChatItem } from '../stores/agentPanel'
import { ThreadItem } from './AgentPanel'

const html = (item: AcpChatItem): string => renderToStaticMarkup(createElement(ThreadItem, { item }))

describe('agent thread bubbles (A1: rich markdown + collapsible thinking)', () => {
  it('renders an agent bubble as markdown: bold, GFM table, fenced code with a language class', () => {
    const md = ['**bold** text', '', '| a | b |', '|---|---|', '| 1 | 2 |', '', '```js', 'const x = 1', '```'].join(
      '\n',
    )
    const out = html({ type: 'agent', text: md })
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<table>')
    // remark-rehype emits language-js; rehype-highlight then prepends `hljs`
    expect(out).toMatch(/<code class="[^"]*language-js[^"]*">/)
  })

  it('sanitizes injected script/handlers even in agent output', () => {
    const out = html({ type: 'agent', text: 'hi\n\n<img src=x onerror="alert(1)">' })
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('alert(1)')
  })

  it('renders a user bubble through markdown too (not raw text)', () => {
    const out = html({ type: 'user', text: 'ship `loredex route` please' })
    expect(out).toContain('<code')
    expect(out).toContain('agent-msg-user')
    expect(out).toContain('agent-md')
  })

  it('renders a thought inside a collapsible <details>, dimmed', () => {
    const out = html({ type: 'thought', text: 'weighing **options**' })
    expect(out).toContain('<details')
    expect(out).toContain('agent-msg-thought')
    expect(out).toContain('<strong>options</strong>')
  })

  it('a tool row stays a mono machine line (title only), never markdown-rendered', () => {
    const out = html({ type: 'tool', toolCallId: 't1', title: 'Read **file**.md', status: 'completed' })
    expect(out).toContain('agent-tool-line')
    // the title is shown verbatim, not parsed as markdown
    expect(out).not.toContain('<strong>')
    expect(out).toContain('Read **file**.md')
  })
})
