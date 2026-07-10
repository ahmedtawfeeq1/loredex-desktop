/**
 * Read-mode find bar engine (story epic17.3, DESIGN.md D1 amendment 3).
 * Pure match/navigation/counter logic (node-testable) + a DOM highlight layer
 * that rides the CSS Custom Highlight API under SEPARATE names from the
 * comment anchor highlight (anchorHighlight.ts owns `loredex-anchor`), so the
 * two paints coexist over the SAME text without either clobbering the other.
 * The DOM helpers are guarded no-ops where the API/DOM is absent (node tests),
 * matching the anchorHighlight precedent.
 */

/** A match as [start, end) offsets into the rendered note's text stream. */
export interface FindMatch {
  start: number
  end: number
}

/**
 * Every non-overlapping occurrence of `query` in `text`, left-to-right.
 * Empty/whitespace query → no matches. Case-insensitive unless `caseSensitive`.
 */
export function computeMatches(text: string, query: string, caseSensitive: boolean): FindMatch[] {
  if (!query) return []
  const hay = caseSensitive ? text : text.toLowerCase()
  const needle = caseSensitive ? query : query.toLowerCase()
  const matches: FindMatch[] = []
  let from = 0
  for (;;) {
    const at = hay.indexOf(needle, from)
    if (at === -1) break
    matches.push({ start: at, end: at + needle.length })
    from = at + needle.length // non-overlapping (advance past this hit)
  }
  return matches
}

/** Next match index with wrap-around. `total` 0 → -1 (no current match). */
export function navigate(current: number, total: number, dir: 1 | -1): number {
  if (total <= 0) return -1
  return (((current + dir) % total) + total) % total
}

/** Counter label `3/17`; `0/0` when there are no matches. `current` 0-indexed. */
export function counterLabel(current: number, total: number): string {
  if (total <= 0) return '0/0'
  return `${current + 1}/${total}`
}

/** Map a find-input keystroke to its action (Enter next, ⇧Enter prev, Esc close). */
export function findKeyAction(key: string, shift: boolean): 'next' | 'prev' | 'close' | null {
  if (key === 'Escape') return 'close'
  if (key === 'Enter') return shift ? 'prev' : 'next'
  return null
}

/* ── DOM highlight layer — separate Custom Highlight names ─────────────────── */

export const FIND_HIGHLIGHT_NAME = 'loredex-find'
export const FIND_CURRENT_HIGHLIGHT_NAME = 'loredex-find-current'

/** Minimal shape of the CSS.highlights registry (set/delete by name). */
export interface HighlightRegistry {
  set(name: string, highlight: unknown): void
  delete(name: string): void
}

type RangeCtor = new (...ranges: Range[]) => unknown

function registry(): HighlightRegistry | null {
  if (typeof CSS === 'undefined') return null
  return (CSS as unknown as { highlights?: HighlightRegistry }).highlights ?? null
}

function highlightCtor(): RangeCtor | null {
  return (globalThis as { Highlight?: RangeCtor }).Highlight ?? null
}

/**
 * Write the two find highlight sets into `reg` — all matches under
 * FIND_HIGHLIGHT_NAME, the current match under FIND_CURRENT_HIGHLIGHT_NAME
 * (the current range is EXCLUDED from the all-set so each match paints once).
 * Pure over the registry (injectable) — never touches `loredex-anchor`, which
 * is why the comment highlight survives every find write/clear.
 */
export function writeFindHighlights(
  reg: HighlightRegistry,
  allRanges: Range[],
  currentRange: Range | null,
  Ctor: RangeCtor,
): void {
  if (allRanges.length > 0) reg.set(FIND_HIGHLIGHT_NAME, new Ctor(...allRanges))
  else reg.delete(FIND_HIGHLIGHT_NAME)
  if (currentRange) reg.set(FIND_CURRENT_HIGHLIGHT_NAME, new Ctor(currentRange))
  else reg.delete(FIND_CURRENT_HIGHLIGHT_NAME)
}

/** Remove ONLY the find highlight sets (the anchor set is untouched). */
export function clearFindHighlights(reg: HighlightRegistry | null = registry()): void {
  if (!reg) return
  reg.delete(FIND_HIGHLIGHT_NAME)
  reg.delete(FIND_CURRENT_HIGHLIGHT_NAME)
}

/** A DOM Range over [start, end) of `root`'s concatenated text-node stream. */
export function rangeForSpan(root: Node, start: number, end: number): Range | null {
  if (typeof document === 'undefined') return null
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  const starts: number[] = []
  let len = 0
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n as Text)
    starts.push(len)
    len += (n as Text).data.length
  }
  const locate = (offset: number, isEnd: boolean): { node: Text; offset: number } | null => {
    for (let i = 0; i < nodes.length; i += 1) {
      const s = starts[i] as number
      const node = nodes[i] as Text
      const nlen = node.data.length
      if (isEnd ? offset > s && offset <= s + nlen : offset >= s && offset < s + nlen) {
        return { node, offset: offset - s }
      }
    }
    return null
  }
  const from = locate(start, false)
  const to = locate(end, true)
  if (!from || !to) return null
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  return range
}

/**
 * (Re)apply the find highlights under `root` for the given matches, painting
 * match `current` (0-indexed) gold. Guarded no-op where the API is absent.
 */
export function applyFindHighlights(root: Node, matches: FindMatch[], current: number): void {
  const reg = registry()
  if (!reg) return
  const Ctor = highlightCtor()
  if (!Ctor || matches.length === 0) {
    clearFindHighlights(reg)
    return
  }
  const allRanges: Range[] = []
  matches.forEach((m, i) => {
    if (i === current) return // the current match paints via the gold set
    const r = rangeForSpan(root, m.start, m.end)
    if (r) allRanges.push(r)
  })
  const cur = current >= 0 && current < matches.length ? matches[current] : null
  const currentRange = cur ? rangeForSpan(root, cur.start, cur.end) : null
  writeFindHighlights(reg, allRanges, currentRange, Ctor)
}

/** Scroll the current match into view (centered). Guarded no-op in node. */
export function scrollFindMatchIntoView(
  root: Node,
  matches: FindMatch[],
  current: number,
): void {
  if (current < 0 || current >= matches.length) return
  const m = matches[current] as FindMatch
  const range = rangeForSpan(root, m.start, m.end)
  const rect = range?.getBoundingClientRect?.()
  if (!rect) return
  const el = (root as Element).ownerDocument?.defaultView
  if (!el) return
  const viewportH = el.innerHeight || 0
  // scroll only when the match sits outside the comfortable middle band
  if (rect.top < 80 || rect.bottom > viewportH - 80) {
    el.scrollBy({ top: rect.top - viewportH / 2, behavior: 'smooth' })
  }
}
