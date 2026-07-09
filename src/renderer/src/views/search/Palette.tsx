/**
 * Cmd+K palette (story 2.4): Linear-style single overlay on --bg-raised, the
 * same vault.search backend as the search view, keyboard-first. Empty query
 * falls back to recent notes. Built as a generic command list — search is the
 * first provider; M2 actions slot in as more item sources.
 */
import { useEffect, useRef, useState } from 'react'
import { openSearchResult, useSearch } from '../../stores/search'
import { clampSelection, moveSelection } from './palette-nav'

interface PaletteItem {
  key: string
  title: string
  meta: string
  path: string
}

const titleOf = (path: string): string => (path.split('/').pop() ?? path).replace(/\.md$/, '')

export function Palette(): React.JSX.Element | null {
  const open = useSearch((s) => s.paletteOpen)
  const q = useSearch((s) => s.q)
  const hits = useSearch((s) => s.hits)
  const recents = useSearch((s) => s.recents)
  const setQuery = useSearch((s) => s.setQuery)
  const setPaletteOpen = useSearch((s) => s.setPaletteOpen)
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSel(0)
      inputRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  const items: PaletteItem[] = q.trim()
    ? (hits ?? []).map((h) => ({
        key: h.path,
        title: h.name,
        meta: `${h.project || 'product'} · ${h.kind}${h.date ? ` · ${h.date}` : ''}`,
        path: h.path,
      }))
    : recents.map((p) => ({ key: p, title: titleOf(p), meta: p, path: p }))

  const selected = clampSelection(sel, items.length)

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      setPaletteOpen(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setSel(moveSelection(selected, items.length, e.key))
    } else if (e.key === 'Enter') {
      const item = items[selected === -1 ? 0 : selected]
      if (item) openSearchResult(item.path)
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
                onMouseEnter={() => setSel(i)}
                onClick={() => openSearchResult(item.path)}
              >
                <span className="palette-item-title">{item.title}</span>
                <span className="palette-item-meta">{item.meta}</span>
              </button>
            ))
          )}
        </div>
        <div className="palette-foot">↑↓ navigate · ⏎ open · esc close</div>
      </div>
    </div>
  )
}
