/**
 * Font picker popup: left = the catalog grouped by category, each row set in
 * its own face; right = a live specimen rendering a mini note with the hovered
 * / selected font applied to the slot that matches `role`. Select → onPick.
 */
import { useEffect, useRef, useState } from 'react'
import { fontById, fontsByCategory, type FontDef } from '../../../../shared/fonts'

export type FontRole = 'app' | 'title' | 'headings' | 'body' | 'code'

interface Props {
  open: boolean
  role: FontRole
  currentId: string
  onPick(id: string): void
  onClose(): void
}

export function FontPicker({ open, role, currentId, onPick, onClose }: Props): React.JSX.Element | null {
  const [selected, setSelected] = useState(currentId)
  const cardRef = useRef<HTMLDivElement>(null)

  // Re-seed selection every time the picker opens (or the target role's
  // current font changes) — otherwise reopening for a different role keeps
  // the previous role's selection and "Use this font" fires the wrong id.
  useEffect(() => {
    if (open) setSelected(currentId)
  }, [open, currentId])

  // Move DOM focus into the dialog on open so the Escape handler below
  // (bound to this div) actually receives the keydown when the picker is
  // opened by clicking a row (focus otherwise stays on the trigger button,
  // a sibling of the modal, not a descendant).
  useEffect(() => {
    if (open) cardRef.current?.focus()
  }, [open])

  if (!open) return null
  const preview = fontById(selected).stack

  // which specimen slot the chosen font restyles
  const titleFont = role === 'title' ? preview : undefined
  const headingFont = role === 'headings' ? preview : undefined
  const bodyFont = role === 'body' || role === 'app' ? preview : undefined
  const codeFont = role === 'code' ? preview : undefined

  return (
    // biome-ignore lint: backdrop click-to-dismiss; keyboard path is Escape
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={cardRef}
        className="modal font-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a font"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <h2 className="modal-title">Choose a font</h2>
        <div className="font-picker-body">
          <div className="font-list">
            {fontsByCategory().map(({ category, fonts }) => (
              <section key={category} className="font-cat">
                <h3 className="nav-group-label">{category}</h3>
                {fonts.map((f: FontDef) => (
                  <button
                    key={f.id}
                    type="button"
                    className="font-row"
                    aria-pressed={selected === f.id}
                    style={{ fontFamily: f.stack }}
                    onMouseEnter={() => setSelected(f.id)}
                    onClick={() => setSelected(f.id)}
                  >
                    {f.name}
                  </button>
                ))}
              </section>
            ))}
          </div>
          <div className="font-specimen">
            <div className="note-body">
              <h1 style={titleFont ? { fontFamily: titleFont } : undefined}>The Quick Brown Fox</h1>
              <h2 style={headingFont ? { fontFamily: headingFont } : undefined}>Jumps Over the Lazy Dog</h2>
              <p style={bodyFont ? { fontFamily: bodyFont } : undefined}>
                Sphinx of black quartz, judge my vow. Pack my box with five dozen liquor jugs — 0123456789.
              </p>
              <p dir="rtl" style={bodyFont ? { fontFamily: bodyFont } : undefined}>
                نص تجريبي بالعربية لمعاينة الخط
              </p>
              <pre>
                <code style={codeFont ? { fontFamily: codeFont } : undefined}>const answer = 42</code>
              </pre>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={() => {
              onPick(selected)
              onClose()
            }}
          >
            Use this font
          </button>
        </div>
      </div>
    </div>
  )
}
