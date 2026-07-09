/** Pure keyboard navigation for the palette/search lists (story 2.4) — unit-testable. */

export function moveSelection(current: number, count: number, key: string): number {
  if (count === 0) return -1
  if (key === 'ArrowDown') return current >= count - 1 ? 0 : current + 1
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1
  return current
}

/** Clamp after a result-list change: keep in range, prefer the top. */
export function clampSelection(current: number, count: number): number {
  if (count === 0) return -1
  if (current < 0 || current >= count) return 0
  return current
}

/** Case-insensitive term split for <mark> highlighting — no HTML strings. */
export function splitForHighlight(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1)
  if (terms.length === 0 || !text) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const parts: Array<{ text: string; hit: boolean }> = []
  let at = 0
  while (at < text.length) {
    let best = -1
    let bestLen = 0
    for (const term of terms) {
      const i = lower.indexOf(term, at)
      if (i !== -1 && (best === -1 || i < best)) {
        best = i
        bestLen = term.length
      }
    }
    if (best === -1) {
      parts.push({ text: text.slice(at), hit: false })
      break
    }
    if (best > at) parts.push({ text: text.slice(at, best), hit: false })
    parts.push({ text: text.slice(best, best + bestLen), hit: true })
    at = best + bestLen
  }
  return parts
}
