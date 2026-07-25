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
/** Custom <pre> for fenced code, SHARED by the agent panel and the reader: the
 *  sanitized code plus a copy button, visible at rest since BL-31 (hover-only
 *  read as absent).
 *
 *  It lived in agent/agentMarkdown.tsx until 2026-07-23, so a fenced block in a
 *  NOTE had no way to copy it — the affordance existed only in chat. A code
 *  block is copiable wherever it appears, so it belongs here.
 *
 *  BLOCK LEVEL ONLY. Only `pre` is overridden below — inline <code> in the
 *  middle of a sentence stays a bare <code> with no button, no hover target and
 *  no layout shift. A copy affordance mid-paragraph is noise, not a feature.
 *
 *  The button reads the <code>'s textContent on click
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
  components: { a: MarkdownAnchor, input: MarkdownTaskCheckbox, pre: CodeBlock },
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
