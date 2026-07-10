/**
 * Cmd+K palette (story 2.4): Linear-style single overlay on --bg-raised, the
 * same vault.search backend as the search view, keyboard-first. Empty query
 * falls back to recent notes. Built as a generic command list — search is the
 * first provider; M2 actions slot in as more item sources.
 */
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../stores/app'
import { useHandoffs } from '../../stores/handoffs'
import { useReader } from '../../stores/reader'
import { useRoute } from '../../stores/route'
import { openSearchResult, useSearch } from '../../stores/search'
import { handoffRefFromNote } from '../handoffs/compose-form'
import { clampSelection, moveSelection } from './palette-nav'

interface PaletteItem {
  key: string
  title: string
  meta: string
  path: string
  /** action items (M2): run instead of opening a note */
  run?: () => void
}

const titleOf = (path: string): string => (path.split('/').pop() ?? path).replace(/\.md$/, '')

/** M2 action provider: every write flow is ⌘K-reachable (stories 7.2-7.4). */
function actionItems(q: string): PaletteItem[] {
  const actions: Array<{ key: string; title: string; run: () => void }> = [
    {
      key: 'action:new-handoff',
      title: 'New handoff…',
      run: () => {
        useApp.getState().setView('handoffs')
        useHandoffs.getState().openCompose()
      },
    },
    {
      key: 'action:route-note',
      title: 'Route a note…',
      run: () => void useRoute.getState().start(),
    },
  ]
  // reply/comment target the open reader note when it is a handoff (story 7.3)
  const { selected, doc } = useReader.getState()
  const ref = selected && doc ? handoffRefFromNote(selected, doc.meta as Record<string, unknown>) : null
  if (ref) {
    actions.push(
      {
        key: 'action:reply-handoff',
        title: `Reply to “${ref.objective || ref.id}”…`,
        run: () => useHandoffs.getState().openCompose(ref),
      },
      {
        key: 'action:comment-handoff',
        title: `Comment on “${ref.objective || ref.id}”…`,
        run: () => useHandoffs.getState().openAnnotate(ref),
      },
    )
  }
  const needle = q.trim().toLowerCase()
  return actions
    .filter((a) => !needle || a.title.toLowerCase().includes(needle))
    .map((a) => ({ ...a, meta: 'action', path: '' }))
}

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

  const noteItems: PaletteItem[] = q.trim()
    ? (hits ?? []).map((h) => ({
        key: h.path,
        title: h.name,
        meta: `${h.project || 'product'} · ${h.kind}${h.date ? ` · ${h.date}` : ''}`,
        path: h.path,
      }))
    : recents.map((p) => ({ key: p, title: titleOf(p), meta: p, path: p }))
  const items: PaletteItem[] = [...actionItems(q), ...noteItems]

  const selected = clampSelection(sel, items.length)

  function pick(item: PaletteItem): void {
    if (item.run) {
      setPaletteOpen(false)
      item.run()
    } else {
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
                onMouseEnter={() => setSel(i)}
                onClick={() => pick(item)}
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
