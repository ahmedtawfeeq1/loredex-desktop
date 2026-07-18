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

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  // ignoreMissing: an unrecognised ```lang fence must degrade to plain code,
  // never throw mid-render and blank the bubble.
  .use(rehypeHighlight, { ignoreMissing: true })
  .use(rehypeSanitize, agentSchema)
  .use(rehypeReact, options)

/** Render one bubble body (user / agent / thought) as sanitized, highlighted markdown. */
export function renderAgentMarkdown(body: string): ReactNode {
  return processor.processSync(body).result
}
