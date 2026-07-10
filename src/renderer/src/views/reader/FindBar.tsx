/**
 * Read-mode find bar (story epic17.3, DESIGN.md D1 amendment 3): a floating
 * bar top-right of the note pane — query input, `N/M` counter, prev/next,
 * case-sensitive Aa toggle, Esc close. Enter/⇧Enter step matches. The query
 * scan is debounced 150ms and runs over the RENDERED note DOM (bodyRef); the
 * paint rides the CSS Custom Highlight API under find-only names, so it
 * coexists with the comment anchor highlight over the same text. Edit mode
 * keeps CodeMirror's own ⌘F — this bar only exists in Read mode.
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useFind } from '../../stores/find'
import {
  applyFindHighlights,
  clearFindHighlights,
  computeMatches,
  counterLabel,
  findKeyAction,
  scrollFindMatchIntoView,
  type FindMatch,
} from './findEngine'

export function FindBar({
  bodyRef,
  renderKey,
}: {
  /** the rendered note body — the DOM the scan + highlights operate on */
  bodyRef: RefObject<HTMLDivElement | null>
  /** bumps when the note re-renders — a new note re-scans from scratch */
  renderKey: number
}): React.JSX.Element | null {
  const open = useFind((s) => s.open)
  const query = useFind((s) => s.query)
  const caseSensitive = useFind((s) => s.caseSensitive)
  const total = useFind((s) => s.total)
  const current = useFind((s) => s.current)
  const inputRef = useRef<HTMLInputElement>(null)
  const matchesRef = useRef<FindMatch[]>([])

  useEffect(() => {
    // opening focuses + selects the query so a fresh search overtypes
    if (open) inputRef.current?.select()
  }, [open])

  useEffect(() => {
    // debounced 150ms scan: rendered text → matches → highlight the first hit
    if (!open) {
      matchesRef.current = []
      clearFindHighlights()
      return
    }
    const handle = setTimeout(() => {
      const root = bodyRef.current
      const text = root?.textContent ?? ''
      const matches = computeMatches(text, query, caseSensitive)
      matchesRef.current = matches
      useFind.getState().setResults(matches.length)
      const first = matches.length > 0 ? 0 : -1
      if (root) {
        applyFindHighlights(root, matches, first)
        scrollFindMatchIntoView(root, matches, first)
      }
    }, 150)
    return () => clearTimeout(handle)
  }, [open, query, caseSensitive, renderKey, bodyRef])

  useEffect(() => {
    // navigation (prev/next) repaints the gold current match immediately —
    // matchesRef is stable while the query holds, so no debounce here
    if (!open) return
    const root = bodyRef.current
    if (!root) return
    applyFindHighlights(root, matchesRef.current, current)
    scrollFindMatchIntoView(root, matchesRef.current, current)
  }, [open, current, bodyRef])

  useEffect(() => () => clearFindHighlights(), [])

  if (!open) return null
  const find = useFind.getState()
  return (
    <div className="find-bar" role="search" aria-label="Find in note">
      <input
        ref={inputRef}
        className="find-input"
        type="text"
        placeholder="Find in note"
        aria-label="Find in note"
        value={query}
        onChange={(e) => find.setQuery(e.target.value)}
        onKeyDown={(e) => {
          const action = findKeyAction(e.key, e.shiftKey)
          if (!action) return
          e.preventDefault()
          if (action === 'next') find.next()
          else if (action === 'prev') find.prev()
          else find.close()
        }}
      />
      <span className="find-counter" aria-live="polite">
        {counterLabel(current, total)}
      </span>
      <button
        type="button"
        className="find-nav"
        title="Previous match (⇧⏎)"
        aria-label="Previous match"
        disabled={total === 0}
        onClick={() => find.prev()}
      >
        ↑
      </button>
      <button
        type="button"
        className="find-nav"
        title="Next match (⏎)"
        aria-label="Next match"
        disabled={total === 0}
        onClick={() => find.next()}
      >
        ↓
      </button>
      <button
        type="button"
        className="find-case"
        title="Match case"
        aria-label="Match case"
        aria-pressed={caseSensitive}
        onClick={() => find.toggleCase()}
      >
        Aa
      </button>
      <button
        type="button"
        className="find-close"
        title="Close (Esc)"
        aria-label="Close find"
        onClick={() => find.close()}
      >
        ✕
      </button>
    </div>
  )
}
