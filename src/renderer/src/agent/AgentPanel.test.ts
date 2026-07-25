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
import { attachmentSummary, type AcpChatItem } from '../stores/agentPanel'
import { ThreadItem, copyTextFor } from './AgentPanel'

const html = (item: AcpChatItem, copy?: string): string =>
  renderToStaticMarkup(createElement(ThreadItem, { item, copy }))

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

/**
 * BL-31: the copy affordance is a BLOCK-level thing. A fenced block gets one
 * button pinned to its top-right; inline `code` inside a sentence gets none.
 * The boundary is one line in agentMarkdown.tsx (only `pre` is overridden) and
 * is exactly what an "add copy everywhere" pass would quietly break.
 */
describe('BL-31 — copy affordances are block-level only', () => {
  it('a fenced block renders exactly one Copy button, in its non-scrolling wrapper', () => {
    const out = html({ type: 'agent', text: '```js\nconst x = 1\n```' })
    expect(out.match(/agent-copy-code/g)).toHaveLength(1)
    // the button is a SIBLING of <pre>, inside the wrapper — never inside the
    // horizontal scroll container (BL-3)
    expect(out).toMatch(/<div class="agent-code-wrap"><button[^>]*agent-copy-code/)
  })

  it('inline code in the middle of a sentence gets no copy button at all', () => {
    const out = html({ type: 'agent', text: 'call `lookup_products` once, not per product' })
    expect(out).toContain('<code>lookup_products</code>')
    expect(out).not.toContain('agent-copy-code')
    expect(out).not.toContain('agent-code-wrap')
  })

  it('the whole-reply Copy is the LAST thing in the bubble, below the markdown', () => {
    const out = html({ type: 'agent', text: 'done.\n\n```sh\nls\n```' }, 'done.')
    expect(out.match(/agent-copy-msg/g)).toHaveLength(1)
    // below the reply: it follows the closing </pre> of the final block
    expect(out.indexOf('agent-copy-msg')).toBeGreaterThan(out.lastIndexOf('</pre>'))
  })

  it('an item given no copy text renders no button — the caller decides', () => {
    const out = html({ type: 'agent', text: 'mid-turn note' })
    expect(out).not.toContain('agent-copy-msg')
    // …but fenced code inside any bubble still gets its own block button
    expect(html({ type: 'user', text: 'ship it\n\n```sh\nls\n```' })).toContain('agent-copy-code')
  })
})

/**
 * Reported 2026-07-23: "why is there a Copy below each statement". An assistant
 * turn arrives as MANY `agent` items — one per burst of text between tool calls
 * — and each rendered its own button, so a turn with eight tool calls grew eight
 * of them. The decision belongs to the caller, which can see the neighbours.
 */
describe('copyTextFor — one Copy per reply, not per statement', () => {
  const turn: AcpChatItem[] = [
    { type: 'user', text: 'do the thing' },
    { type: 'agent', text: 'Let me look.' },
    { type: 'tool', toolCallId: 't1', title: 'Read', status: 'completed' },
    { type: 'thought', text: 'hmm' },
    { type: 'agent', text: 'Found it.' },
    { type: 'tool', toolCallId: 't2', title: 'Edit', status: 'completed' },
    { type: 'agent', text: 'Done.' },
  ]

  it('gives the LAST agent item of the turn the button, and no other', () => {
    expect(copyTextFor(turn, 1)).toBeUndefined()
    expect(copyTextFor(turn, 4)).toBeUndefined()
    expect(copyTextFor(turn, 6)).toBeDefined()
  })

  it('that button copies the WHOLE reply, not just its last paragraph', () => {
    expect(copyTextFor(turn, 6)).toBe('Let me look.\n\nFound it.\n\nDone.')
  })

  it('excludes thoughts and tool rows — they are not the reply', () => {
    const copied = copyTextFor(turn, 6) as string
    expect(copied).not.toContain('hmm')
    expect(copied).not.toContain('Read')
  })

  it('the user’s own message gets its own Copy', () => {
    expect(copyTextFor(turn, 0)).toBe('do the thing')
  })

  it('does not reach back past the previous user turn', () => {
    const two: AcpChatItem[] = [
      { type: 'user', text: 'first' },
      { type: 'agent', text: 'reply one' },
      { type: 'user', text: 'second' },
      { type: 'agent', text: 'reply two' },
    ]
    expect(copyTextFor(two, 1)).toBe('reply one')
    expect(copyTextFor(two, 3)).toBe('reply two')
  })

  it('a tool row never gets one', () => {
    expect(copyTextFor(turn, 2)).toBeUndefined()
    expect(copyTextFor(turn, 3)).toBeUndefined()
  })
})

/**
 * Reported 2026-07-23: attached images "are removed or just converted to text"
 * once the turn is sent. The bubble showed `📎 image.png, image.png, image.png,
 * image.png` and no pictures — the bytes were stored but the live item carried
 * no handles, so thumbnails only appeared after reopening the conversation.
 */
describe('images on a sent message (2026-07-23)', () => {
  it('renders a thumbnail slot for each stored image handle', () => {
    const out = html({ type: 'user', text: 'look at these', media: ['aaa', 'bbb'] })
    expect(out).toContain('agent-msg-media')
  })

  it('a message with no media renders no media block', () => {
    expect(html({ type: 'user', text: 'plain' })).not.toContain('agent-msg-media')
  })
})

describe('attachmentSummary — the marker beside the thumbnails', () => {
  const img = (name: string) =>
    ({ type: 'image', mimeType: 'image/png', dataB64: '', name }) as const
  const file = (name: string) => ({ type: 'resource', path: `/x/${name}`, name }) as const

  it('COUNTS images instead of repeating a generic filename', () => {
    expect(attachmentSummary([img('image.png'), img('image.png'), img('image.png')])).toBe(
      '📎 3 images',
    )
  })

  it('singular reads naturally', () => {
    expect(attachmentSummary([img('shot.png')])).toBe('📎 1 image')
  })

  /** A file has no thumbnail, so its NAME is the only record of it. */
  it('still names non-image attachments', () => {
    expect(attachmentSummary([img('a.png'), file('notes.md')])).toBe('📎 1 image, notes.md')
  })

  it('is empty with nothing attached', () => {
    expect(attachmentSummary([])).toBe('')
  })
})
