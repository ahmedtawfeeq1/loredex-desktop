/**
 * Interactive checklists. The remark plugin stamps each GFM task item with its
 * document-order index (data-task-index on the rendered <li>); toggleTask flips
 * that same index in the markdown SOURCE. Both sides count task lines the same
 * way, and toggleTask refuses to write when the counts disagree — a click can
 * fail safe, it can never edit the wrong line.
 */
import type { ListItem, Root } from 'mdast'
import { visit } from 'unist-util-visit'

export function remarkTaskIndexes() {
  return (tree: Root): void => {
    let index = 0
    visit(tree, 'listItem', (node: ListItem) => {
      if (typeof node.checked !== 'boolean') return
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, dataTaskIndex: index++ },
      }
    })
  }
}

// a GFM task line: optional blockquote markers, list marker, then [ ]/[x]
const TASK_LINE = /^(?:\s*>)*\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\](?=\s|$)/
const FENCE = /^\s*(```|~~~)/

/**
 * Return `body` with the `index`-th task set to `checked`, or null when the
 * task can't be located safely (index out of range, or the line's current
 * state doesn't match what the UI showed — e.g. the file changed underneath).
 */
// ponytail: line scan, not a full mdast parse — indented-code false positives
// are caught by the state-mismatch guard, not prevented
export function toggleTask(body: string, index: number, checked: boolean): string | null {
  const lines = body.split('\n')
  let fence: string | null = null
  let seen = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    const fenceMatch = line.match(FENCE)
    if (fenceMatch) {
      const marker = fenceMatch[1] as string
      if (!fence) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (fence) continue
    const match = line.match(TASK_LINE)
    if (!match) continue
    if (seen++ !== index) continue
    const wasChecked = match[1] !== ' '
    if (wasChecked === checked) return null // stale UI — refuse the write
    const box = line.indexOf(`[${match[1]}]`)
    lines[i] = `${line.slice(0, box + 1)}${checked ? 'x' : ' '}${line.slice(box + 2)}`
    return lines.join('\n')
  }
  return null
}
