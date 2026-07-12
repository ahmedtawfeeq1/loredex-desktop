/**
 * Typography settings: app UI font + per-note-format fonts. Each row opens the
 * live-preview FontPicker; the chosen id is persisted through the fonts store
 * (live apply). Two cards — App font, Note fonts.
 */
import { useEffect, useState } from 'react'
import { fontById } from '../../../../shared/fonts'
import { useFonts } from '../../stores/fonts'
import { FontPicker, type FontRole } from './FontPicker'

const NOTE_ROLES: Array<{ role: FontRole; label: string }> = [
  { role: 'title', label: 'Title' },
  { role: 'headings', label: 'Headings' },
  { role: 'body', label: 'Body' },
  { role: 'code', label: 'Code' },
]

export function TypographySection(): React.JSX.Element {
  const settings = useFonts((s) => s.settings)
  const loaded = useFonts((s) => s.loaded)
  const load = useFonts((s) => s.load)
  const setFonts = useFonts((s) => s.set)
  const [picking, setPicking] = useState<FontRole | null>(null)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const idFor = (role: FontRole): string =>
    role === 'app' ? settings.app : settings.note[role]

  const pick = (role: FontRole, id: string): void => {
    if (role === 'app') void setFonts({ ...settings, app: id })
    else void setFonts({ ...settings, note: { ...settings.note, [role]: id } })
  }

  const Row = ({ role, label }: { role: FontRole; label: string }): React.JSX.Element => {
    const font = fontById(idFor(role))
    return (
      <div className="toggle-row">
        <span>{label}</span>
        <button type="button" className="button-secondary font-pick-btn" onClick={() => setPicking(role)}>
          <span style={{ fontFamily: font.stack }}>{font.name}</span>
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="settings-card">
        <h2 className="settings-title">App font</h2>
        <Row role="app" label="Interface" />
        <p className="settings-hint">The font for menus, lists and the app chrome.</p>
      </div>
      <div className="settings-card">
        <h2 className="settings-title">Note fonts</h2>
        {NOTE_ROLES.map((r) => (
          <Row key={r.role} role={r.role} label={r.label} />
        ))}
        <p className="settings-hint">Applied when reading notes. Click a row to preview and choose.</p>
      </div>
      <FontPicker
        open={picking !== null}
        role={picking ?? 'body'}
        currentId={picking ? idFor(picking) : 'system'}
        onPick={(id) => picking && pick(picking, id)}
        onClose={() => setPicking(null)}
      />
    </>
  )
}
