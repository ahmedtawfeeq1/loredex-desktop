/**
 * THE sanctioned markdown path for the whole app (architecture.md#tech-stack):
 * remark-parse → remark-gfm → remark-rehype → rehype-sanitize → rehype-react.
 * Never bypass it; rehype-sanitize is mandatory.
 */
import type { ReactNode } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import rehypeReact, { type Options as RehypeReactOptions } from 'rehype-react'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { MarkdownAnchor } from '../components/WikiLink'
import { remarkWikilinks } from './wikilinks'

/** defaultSchema + the wikilink carrier attributes (story 2.2). */
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.['a'] ?? []), 'className', 'dataWikilink'],
    code: [...(defaultSchema.attributes?.['code'] ?? []), ['className', /^language-/]],
  },
}

const options: RehypeReactOptions = {
  Fragment,
  jsx,
  jsxs,
  // wikilinks (marked by the remark plugin) render through WikiLink;
  // plain anchors open externally via the main-process guard
  components: { a: MarkdownAnchor },
}

const processor = unified()
  .use(remarkParse)
  .use(remarkWikilinks)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize, schema)
  .use(rehypeReact, options)

export function renderMarkdown(body: string): ReactNode {
  return processor.processSync(body).result
}
