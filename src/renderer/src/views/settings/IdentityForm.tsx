/**
 * Identity profile form (story 3.4, AC1): name + email, stored app-side —
 * never in the vault. Defaults offered from the vault repo's git config.
 */
import { useEffect, useState } from 'react'
import { isValidIdentity } from '../../../../shared/identity'
import { useIdentity } from '../../stores/identity'

export function IdentityForm(): React.JSX.Element {
  const profile = useIdentity((s) => s.profile)
  const ambient = useIdentity((s) => s.ambient)
  const loaded = useIdentity((s) => s.loaded)
  const error = useIdentity((s) => s.error)
  const load = useIdentity((s) => s.load)
  const save = useIdentity((s) => s.save)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  // seed the form once from the profile, else the ambient git identity
  useEffect(() => {
    const seed = profile ?? (isValidIdentity(ambient) ? ambient : null)
    if (seed) {
      setName((n) => n || seed.name)
      setEmail((e) => e || seed.email)
    }
  }, [profile, ambient])

  const candidate = { name: name.trim(), email: email.trim() }
  const valid = isValidIdentity(candidate)

  return (
    <form
      className="settings-section"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        void save(candidate).then((ok) => setSaved(ok))
      }}
    >
      <h2 className="settings-title">Identity</h2>
      <p className="settings-hint">
        Stamped on handoffs you consume and carried on the git commits it makes. Stored on this
        Mac, never in the vault.
      </p>
      <label className="settings-field">
        <span>Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
          placeholder={ambient?.name && ambient.name !== 'unknown' ? ambient.name : 'Your name'}
        />
      </label>
      <label className="settings-field">
        <span>Email</span>
        <input
          type="text"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setSaved(false)
          }}
          placeholder={
            ambient?.email && ambient.email !== 'unknown' ? ambient.email : 'you@example.com'
          }
        />
      </label>
      <div className="settings-actions">
        <button type="submit" className="button-primary" disabled={!valid}>
          Save identity
        </button>
        {saved && <span className="settings-saved">Saved</span>}
        {error && <span className="note-error">{error}</span>}
      </div>
    </form>
  )
}
