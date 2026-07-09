/**
 * Broken-link diagnostics (story 2.2): current note first, then the per-vault
 * list fed lazily as notes render. A count pill floats in the reader; the
 * panel opens from it or from clicking a broken link.
 */
import { useDiagnostics } from '../../stores/diagnostics'
import { useReader } from '../../stores/reader'

export function Diagnostics(): React.JSX.Element | null {
  const open = useDiagnostics((s) => s.open)
  const byNote = useDiagnostics((s) => s.byNote)
  const setOpen = useDiagnostics((s) => s.setOpen)
  const selected = useReader((s) => s.selected)

  const notes = Object.keys(byNote).sort((a, b) =>
    a === selected ? -1 : b === selected ? 1 : a.localeCompare(b),
  )
  const count = notes.reduce((n, note) => n + (byNote[note]?.length ?? 0), 0)
  if (count === 0) return null

  if (!open) {
    return (
      <button type="button" className="diag-pill" onClick={() => setOpen(true)}>
        {count} broken {count === 1 ? 'link' : 'links'}
      </button>
    )
  }

  return (
    <aside className="diag-panel" aria-label="Link diagnostics">
      <div className="diag-header">
        <span className="pane-list-title">Link diagnostics</span>
        <button type="button" className="button-quiet" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="diag-hint">
        These wikilinks match no note in the vault. Fix the name or add the note — links are never
        auto-created.
      </p>
      {notes.map((note) => (
        <div key={note} className="diag-note">
          <div className="diag-note-path">{note === selected ? `${note} (open note)` : note}</div>
          {(byNote[note] ?? []).map((link) => (
            <div key={link} className="diag-row">
              [[{link}]]
            </div>
          ))}
        </div>
      ))}
    </aside>
  )
}
