/**
 * Cmd+K palette (story 2.4): Linear-style single overlay on --bg-raised, the
 * same vault.search backend as the search view, keyboard-first. Empty query
 * falls back to recent notes. Action rows come from the ONE global registry +
 * contextual providers (actions/palette-items.ts, story 15.3) with shortcut
 * hints rendered per row.
 */
import { useEffect, useRef, useState } from 'react'
import { actionItems } from '../../actions/palette-items'
import { humanizeTitle } from '../../humanize'
import { useApp } from '../../stores/app'
import { openSearchResult, useSearch } from '../../stores/search'
import { clampSelection, moveSelection } from './palette-nav'

/** ⌘K shows only the top few note hits; the rest live in the full Search view. */
const PALETTE_HIT_LIMIT = 5

interface PaletteItem {
  key: string
  title: string
  meta: string
  path: string
  /** shortcut hint (registry actions) — rendered as a kbd chip */
  hint?: string
  /** action items (M2): run instead of opening a note */
  run?: () => void
}

export function Palette(): React.JSX.Element | null {
  const open = useSearch((s) => s.paletteOpen)
  const q = useSearch((s) => s.q)
  const hits = useSearch((s) => s.hits)
  const recents = useSearch((s) => s.recents)
  const setQuery = useSearch((s) => s.setQuery)
  const setPaletteOpen = useSearch((s) => s.setPaletteOpen)
  const recordSearch = useSearch((s) => s.recordSearch)
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSel(0)
      inputRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  // epic22: ⌘K shows the TOP few hits; "see all in Search →" hands off the rest.
  const allHits = hits ?? []
  const seeAll = q.trim().length > 0 && allHits.length > PALETTE_HIT_LIMIT
  // story 17.1: note titles humanize; the real filename stays visible in the
  // meta line (recents) and the row tooltip (title={item.path})
  const noteItems: PaletteItem[] = q.trim()
    ? allHits.slice(0, PALETTE_HIT_LIMIT).map((h) => ({
        key: h.path,
        title: humanizeTitle(h.name),
        meta: `${h.project || 'product'} · ${h.kind}${h.date ? ` · ${h.date}` : ''}`,
        path: h.path,
      }))
    : recents.map((p) => ({ key: p, title: humanizeTitle(p), meta: p, path: p }))
  const seeAllItem: PaletteItem[] = seeAll
    ? [
        {
          key: '__see-all__',
          title: `See all ${allHits.length} in Search →`,
          meta: '',
          path: '',
          run: () => useApp.getState().setView('search'),
        },
      ]
    : []
  const items: PaletteItem[] = [...actionItems(q), ...noteItems, ...seeAllItem]

  const selected = clampSelection(sel, items.length)

  function pick(item: PaletteItem): void {
    if (item.run) {
      setPaletteOpen(false)
      item.run()
    } else {
      recordSearch()
      openSearchResult(item.path)
    }
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      setPaletteOpen(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setSel(moveSelection(selected, items.length, e.key))
    } else if (e.key === 'Enter') {
      const item = items[selected === -1 ? 0 : selected]
      if (item) pick(item)
    }
  }

  return (
    // biome-ignore lint: backdrop click-to-dismiss; keyboard path is Escape
    <div className="palette-backdrop" onMouseDown={() => setPaletteOpen(false)}>
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search notes… (Esc to close)"
          value={q}
          onChange={(e) => {
            setSel(0)
            setQuery(e.target.value)
          }}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list" role="listbox" aria-label="Results">
          {items.length === 0 ? (
            <p className="palette-empty">
              {q.trim() ? 'No notes match.' : 'No recent notes yet — start typing to search.'}
            </p>
          ) : (
            items.map((item, i) => (
              <button
                key={item.key}
                type="button"
                className="palette-item"
                aria-current={i === selected}
                title={item.path || undefined}
                onMouseEnter={() => setSel(i)}
                onClick={() => pick(item)}
              >
                <span className="palette-item-title">{item.title}</span>
                <span className="palette-item-meta">{item.meta}</span>
                {item.hint && <kbd className="palette-item-hint">{item.hint}</kbd>}
              </button>
            ))
          )}
        </div>
        <div className="palette-foot">↑↓ navigate · ⏎ open · esc close · ? shortcuts</div>
      </div>
    </div>
  )
}
