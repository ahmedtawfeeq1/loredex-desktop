/**
 * Soft gold underline-highlight for anchored text (story 16.4, Addendum D1)
 * via the CSS Custom Highlight API — zero DOM mutation of the rendered
 * markdown; styling lives in ::highlight(loredex-anchor). Guarded no-op where
 * the API/DOM is absent (node tests). Anchors can span inline elements, so
 * matching runs over the concatenated text-node stream.
 */
export const ANCHOR_HIGHLIGHT_NAME = 'loredex-anchor'

interface HighlightRegistry {
  set(name: string, highlight: unknown): void
  delete(name: string): void
}

function registry(): HighlightRegistry | null {
  if (typeof CSS === 'undefined') return null
  const highlights = (CSS as unknown as { highlights?: HighlightRegistry }).highlights
  return highlights ?? null
}

/** First occurrence of `needle` across root's text nodes, as a DOM Range. */
export function findTextRange(root: Node, needle: string): Range | null {
  if (!needle || typeof document === 'undefined') return null
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  const starts: number[] = []
  let text = ''
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n as Text)
    starts.push(text.length)
    text += (n as Text).data
  }
  const at = text.indexOf(needle)
  if (at === -1) return null
  const end = at + needle.length
  const locate = (offset: number, isEnd: boolean): { node: Text; offset: number } | null => {
    for (let i = 0; i < nodes.length; i += 1) {
      const start = starts[i] as number
      const node = nodes[i] as Text
      const len = node.data.length
      // starts sit at a node's first char; ends prefer the node holding the last char
      if (isEnd ? offset > start && offset <= start + len : offset >= start && offset < start + len) {
        return { node, offset: offset - start }
      }
    }
    return null
  }
  const from = locate(at, false)
  const to = locate(end, true)
  if (!from || !to) return null
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  return range
}

/**
 * (Re)apply the highlight set for the given anchors under `root`. Returns
 * true when the API is available and the set was applied.
 */
export function applyAnchorHighlights(root: Node, anchors: string[]): boolean {
  const highlights = registry()
  if (!highlights) return false
  const ranges = anchors
    .map((anchor) => findTextRange(root, anchor))
    .filter((r): r is Range => r !== null)
  const HighlightCtor = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
  if (!HighlightCtor || ranges.length === 0) {
    highlights.delete(ANCHOR_HIGHLIGHT_NAME)
    return ranges.length === 0
  }
  highlights.set(ANCHOR_HIGHLIGHT_NAME, new HighlightCtor(...ranges))
  return true
}

/** Remove the highlight set (note closed / edit mode). */
export function clearAnchorHighlights(): void {
  registry()?.delete(ANCHOR_HIGHLIGHT_NAME)
}
