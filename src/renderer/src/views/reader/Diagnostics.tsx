/**
 * Broken-link diagnostics (story 2.2, upgraded by 14.2-4): the count badge is
 * a button opening a panel that lists every broken link — source note + raw
 * target — and each row navigates to the source note. Links are never
 * auto-created.
 */
import { brokenLinkCount, orderNotes, useDiagnostics } from '../../stores/diagnostics'
import { useReader } from '../../stores/reader'

export function Diagnostics(): React.JSX.Element | null {
  const open = useDiagnostics((s) => s.open)
  const byNote = useDiagnostics((s) => s.byNote)
  const setOpen = useDiagnostics((s) => s.setOpen)
  const selected = useReader((s) => s.selected)
  const openNote = useReader((s) => s.open)

  const notes = orderNotes(byNote, selected)
  const count = brokenLinkCount(byNote)
  if (count === 0) return null

  if (!open) {
    return (
      <button
        type="button"
        className="diag-pill"
        title="Open link diagnostics"
        onClick={() => setOpen(true)}
      >
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
            <button
              key={link}
              type="button"
              className="diag-row"
              title={`Open ${note}`}
              onClick={() => void openNote(note)}
            >
              [[{link}]]
            </button>
          ))}
        </div>
      ))}
    </aside>
  )
}
