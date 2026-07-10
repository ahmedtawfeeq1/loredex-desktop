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

/* ── D1 amendment (story 16.4 v1.1): hover/focus targets over anchors ──────
   The ::highlight paint stays zero-DOM, but the comment hover popover needs
   real elements to hover and keyboard-focus. Each anchor's text-node
   segments get wrapped in `.anchor-target` spans (tabindex 0 on the first
   segment — one tab stop per anchor). textContent is unchanged, so anchor
   matching and the highlight ranges still hold. ─────────────────────────── */

export const ANCHOR_TARGET_CLASS = 'anchor-target'

interface TextSegment {
  node: Text
  start: number
  end: number
}

/** Per-text-node slices of a range — anchors can span inline elements. */
function textSegments(root: Node, range: Range): TextSegment[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const segments: TextSegment[] = []
  let inRange = false
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text
    if (node === range.startContainer) inRange = true
    if (!inRange) continue
    const start = node === range.startContainer ? range.startOffset : 0
    const end = node === range.endContainer ? range.endOffset : node.data.length
    if (end > start) segments.push({ node, start, end })
    if (node === range.endContainer) break
  }
  return segments
}

/**
 * (Re)wrap the first occurrence of each anchor in focusable hover-target
 * spans. Rebuilt from scratch each call (unwrap first) — idempotent. Guarded
 * no-op where the DOM is absent (node tests). Pass deduplicated anchors.
 */
export function wrapAnchorTargets(root: Node, anchors: string[]): void {
  if (typeof document === 'undefined') return
  unwrapAnchorTargets(root)
  for (const anchor of anchors) {
    const range = findTextRange(root, anchor)
    if (!range) continue
    textSegments(root, range).forEach((segment, i) => {
      const span = document.createElement('span')
      span.className = ANCHOR_TARGET_CLASS
      span.setAttribute('data-anchor', anchor)
      if (i === 0) span.tabIndex = 0
      const segmentRange = document.createRange()
      segmentRange.setStart(segment.node, segment.start)
      segmentRange.setEnd(segment.node, segment.end)
      // always a pure text slice within one node — surroundContents is safe
      segmentRange.surroundContents(span)
    })
  }
}

/** Remove every target span, splicing its text back in place (normalized). */
export function unwrapAnchorTargets(root: Node): void {
  if (typeof document === 'undefined') return
  const el = root as Element
  if (typeof el.querySelectorAll !== 'function') return
  for (const span of Array.from(el.querySelectorAll(`.${ANCHOR_TARGET_CLASS}`))) {
    const parent = span.parentNode
    if (!parent) continue
    while (span.firstChild) parent.insertBefore(span.firstChild, span)
    parent.removeChild(span)
  }
  if (typeof el.normalize === 'function') el.normalize()
}

/**
 * The hovered/focused anchor text, from any node inside a target span —
 * event-delegation helper (duck-typed so node-side tests can fake a target).
 */
export function anchorFromEvent(target: unknown): string | null {
  const el = target as {
    closest?: (sel: string) => { getAttribute(name: string): string | null } | null
  } | null
  return el?.closest?.(`.${ANCHOR_TARGET_CLASS}`)?.getAttribute('data-anchor') ?? null
}
