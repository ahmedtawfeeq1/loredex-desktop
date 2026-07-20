/**
 * PANEL-LOCAL markdown processor for agent chat bubbles (acp step A1). Same
 * sanctioned chain as the reader pipeline (remark-parse → gfm → remark-rehype →
 * rehype-sanitize → rehype-react) but with rehype-highlight added for
 * fenced-code syntax colour, and WITHOUT the reader-only remark plugins
 * (wikilinks / sha-links / task-indexes) — agent output is chat, not a vault
 * note. The shared reader `processor` is never mutated (arch law): this is a
 * separate `unified()` chain that only REUSES the pipeline's sanitize `schema`
 * and rehype-react `options`.
 *
 * Sanitize stays mandatory. The reader schema is reused verbatim and only
 * widened to let highlight.js survive the sanitizer: the `hljs` class on
 * `<code>` and the `span.hljs-*` token classes (the exact widening the
 * hast-util-sanitize docs give for rehype-highlight). className is inert —
 * script/handler/URL vectors are still stripped by the reused base schema.
 */
import type { ReactNode } from 'react'
import rehypeHighlight from 'rehype-highlight'
import rehypeReact from 'rehype-react'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { options, schema } from '../markdown/pipeline'

const agentSchema = {
  ...schema,
  attributes: {
    ...schema.attributes,
    code: [...(schema.attributes?.code ?? []), ['className', 'hljs']],
    // base schema defines no `span` — highlight.js token spans are the only ones
    span: [['className', /^hljs-/]],
  },
}

/** Custom <pre> for fenced code (chat-completeness COPY): the sanitized code
 *  plus a hover copy button. The button reads the <code>'s textContent on click
 *  (the raw code — the button itself lives outside <code>, so its label never
 *  pollutes the copy) and writes it to the clipboard, the same navigator API
 *  the settings device-flow uses. Injected via rehype-react's `components`
 *  AFTER sanitize, so it needs no schema widening.
 *
 *  The button lives in a NON-scrolling wrapper, never inside the <pre>: the
 *  <pre> is the horizontal scroll container, so a button positioned against it
 *  drifts across the code as you scroll sideways. Anchoring to the wrapper pins
 *  it to the visible top-right corner at any scroll offset. */
function CodeBlock(props: React.HTMLAttributes<HTMLPreElement>): React.JSX.Element {
  const { children, ...rest } = props
  return (
    <div className="agent-code-wrap">
      <button
        type="button"
        className="agent-copy-code"
        aria-label="Copy code"
        title="Copy code"
        onClick={(e) => {
          // the button is a SIBLING of <pre> now — reach the code through the
          // wrapper, not closest('pre') (which would find nothing)
          const code = e.currentTarget.parentElement?.querySelector('code')
          try {
            void navigator.clipboard?.writeText(code?.textContent ?? '')
          } catch {
            // no clipboard (node/test) — best-effort, never throw mid-render
          }
        }}
      >
        Copy
      </button>
      <pre {...rest}>{children}</pre>
    </div>
  )
}

// panel-local options: the reader components (anchors / task checkboxes) plus
// the copy-enabled <pre>. The shared `options` object is never mutated (arch
// law) — this is a fresh object that only spreads its fields.
const agentOptions = { ...options, components: { ...options.components, pre: CodeBlock } }

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  // ignoreMissing: an unrecognised ```lang fence must degrade to plain code,
  // never throw mid-render and blank the bubble.
  .use(rehypeHighlight, { ignoreMissing: true })
  .use(rehypeSanitize, agentSchema)
  .use(rehypeReact, agentOptions)

/** Render one bubble body (user / agent / thought) as sanitized, highlighted markdown. */
export function renderAgentMarkdown(body: string): ReactNode {
  return processor.processSync(body).result
}
