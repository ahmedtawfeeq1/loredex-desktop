/**
 * Remark plugin (story 2.2): parse `[[target]]` and `[[target|alias]]` in
 * text nodes into link nodes carrying the raw target as `data-wikilink`.
 * Resolution happens core-side via `vault.resolveLink`; this plugin only marks.
 */
import type { PhrasingContent, Root, Text } from 'mdast'
import { visit } from 'unist-util-visit'

const WIKILINK = /\[\[([^[\]]+)\]\]/g

export function remarkWikilinks() {
  return (tree: Root): void => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index === undefined || parent.type === 'link') return undefined
      WIKILINK.lastIndex = 0
      if (!WIKILINK.test(node.value)) return undefined
      WIKILINK.lastIndex = 0

      const parts: PhrasingContent[] = []
      let cursor = 0
      for (const match of node.value.matchAll(WIKILINK)) {
        const start = match.index
        if (start > cursor) parts.push({ type: 'text', value: node.value.slice(cursor, start) })
        const raw = (match[1] as string).trim()
        const [targetPart, alias] = raw.split('|')
        const target = (targetPart ?? raw).trim()
        const display = alias?.trim() || target
        parts.push({
          type: 'link',
          url: '',
          children: [{ type: 'text', value: display }],
          data: { hProperties: { className: ['wikilink'], dataWikilink: raw } },
        })
        cursor = start + match[0].length
      }
      if (cursor < node.value.length) {
        parts.push({ type: 'text', value: node.value.slice(cursor) })
      }
      parent.children.splice(index, 1, ...parts)
      return index + parts.length // skip what we just inserted
    })
  }
}
