/**
 * `?` shortcut cheatsheet (story 15.3): one modal that teaches the whole
 * keyboard map. Global rows come straight from the registry (never a second
 * hand-maintained list); per-context keys that live in their own components
 * (palette list nav, atlas history, card ⏎, modal Esc/⌘⏎) are documented
 * verbatim here. DESIGN modal pattern; Esc closes; focus lands inside.
 */
import { useEffect, useRef } from 'react'
import { appActions, VIEW_ORDER } from '../actions/registry'
import { useApp } from '../stores/app'

interface Row {
  keys: string
  label: string
}

/** The documented per-context keys (implemented in their own components). */
export const CONTEXT_ROWS: ReadonlyArray<{ group: string; rows: Row[] }> = [
  {
    group: 'Atlas',
    rows: [
      { keys: '⌘[ / ⌘]', label: 'History back / forward' },
      { keys: '⏎', label: 'Open the focused node (hyperlink-everything)' },
    ],
  },
  {
    group: 'Lists & cards',
    rows: [
      { keys: '⇥ / ⇧⇥', label: 'Move through rows, cards and controls (visual order)' },
      { keys: '⏎', label: 'Open the focused card / row' },
      { keys: '⌘⏎', label: 'Consume the focused handoff card' },
      { keys: '↑↓ · ⏎', label: 'Palette + search results: navigate · open' },
    ],
  },
  {
    group: 'Modals',
    rows: [
      { keys: 'esc', label: 'Cancel / close (focus returns to the page)' },
      { keys: '⌘⏎', label: 'Submit (the one gold primary)' },
    ],
  },
]

export function ShortcutCheatsheet(): React.JSX.Element | null {
  const open = useApp((s) => s.cheatsheetOpen)
  const setOpen = useApp((s) => s.setCheatsheetOpen)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) cardRef.current?.focus()
  }, [open])

  if (!open) return null

  const actions = appActions()
  const viewIds = new Set(VIEW_ORDER.map(({ view }) => `view:${view}`))
  const globals = actions.filter((a) => a.shortcut && !viewIds.has(a.id))
  const views = actions.filter((a) => a.shortcut && viewIds.has(a.id))

  const section = (group: string, rows: Row[]): React.JSX.Element => (
    <section key={group} className="cheatsheet-group">
      <h3 className="cheatsheet-group-title">{group}</h3>
      {rows.map((row) => (
        <div key={`${group}:${row.keys}:${row.label}`} className="cheatsheet-row">
          <kbd className="cheatsheet-keys">{row.keys}</kbd>
          <span className="cheatsheet-label">{row.label}</span>
        </div>
      ))}
    </section>
  )

  return (
    // biome-ignore lint: backdrop click-to-dismiss; the keyboard path is Escape
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div
        ref={cardRef}
        className="modal cheatsheet"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            setOpen(false)
          }
        }}
      >
        <h2 className="modal-title">Keyboard shortcuts</h2>
        <div className="cheatsheet-columns">
          {section(
            'Global',
            globals.map((a) => ({ keys: a.shortcut as string, label: a.title })),
          )}
          {section(
            'Views',
            views.map((a) => ({ keys: a.shortcut as string, label: a.title })),
          )}
          {CONTEXT_ROWS.map(({ group, rows }) => section(group, rows))}
        </div>
        <div className="modal-footer">
          <button type="button" className="button-secondary" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
