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
import { MarkdownTaskCheckbox } from '../components/TaskCheckbox'
import { MarkdownAnchor } from '../components/WikiLink'
import { remarkShaLinks } from './shaLinks'
import { remarkTaskIndexes } from './tasks'
import { remarkWikilinks } from './wikilinks'

/** defaultSchema + the wikilink carrier attributes (story 2.2) + task indexes.
 *  Exported so the panel-local agent processor (agent/agentMarkdown.tsx) can
 *  reuse the SAME sanitize allowlist rather than re-derive it. */
export const schema: typeof defaultSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.['a'] ?? []), 'className', 'dataWikilink'],
    code: [...(defaultSchema.attributes?.['code'] ?? []), ['className', /^language-/]],
    li: [...(defaultSchema.attributes?.['li'] ?? []), 'dataTaskIndex'],
  },
}

export const options: RehypeReactOptions = {
  Fragment,
  jsx,
  jsxs,
  // wikilinks (marked by the remark plugin) render through WikiLink;
  // plain anchors open externally via the main-process guard;
  // task checkboxes become interactive where a TasksContext handler exists
  components: { a: MarkdownAnchor, input: MarkdownTaskCheckbox },
}

function buildProcessor(commitBase: string | null) {
  return unified()
    .use(remarkParse)
    .use(remarkWikilinks)
    .use(remarkShaLinks, { commitBase })
    .use(remarkGfm)
    .use(remarkTaskIndexes)
    .use(remarkRehype)
    .use(rehypeSanitize, schema)
    .use(rehypeReact, options)
}

const processor = buildProcessor(null)
// one extra processor per commit base (in practice: the vault's one remote)
const shaProcessors = new Map<string, ReturnType<typeof buildProcessor>>()

/**
 * THE render entry for all note/brief markdown. `commitBase` (story 2.5)
 * additionally turns commit SHAs into remote links — same pipeline, same
 * sanitize step, wikilinks still resolve.
 */
export function renderMarkdown(body: string, commitBase?: string | null): ReactNode {
  let p = processor
  if (commitBase) {
    p = shaProcessors.get(commitBase) ?? buildProcessor(commitBase)
    shaProcessors.set(commitBase, p)
  }
  return p.processSync(body).result
}
