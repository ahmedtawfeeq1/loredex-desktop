/**
 * Wizard identity step (story 13.1 AC1 "identity confirm — block if unset"):
 * shows the saved profile, or inline name/email fields that save it via the
 * ordinary settings channel. The core sequence independently enforces
 * IDENTITY_MISSING — this is the friendly path, not the gate.
 */
import { useEffect, useState } from 'react'
import { isValidIdentity } from '../../../../shared/identity'
import { useIdentity } from '../../stores/identity'

export function IdentityConfirm(): React.JSX.Element {
  const profile = useIdentity((s) => s.profile)
  const ambient = useIdentity((s) => s.ambient)
  const loaded = useIdentity((s) => s.loaded)
  const load = useIdentity((s) => s.load)
  const save = useIdentity((s) => s.save)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  // ambient (vault git config) is offered as the default when there is one
  useEffect(() => {
    if (loaded && !profile && ambient) {
      setName((n) => n || ambient.name)
      setEmail((m) => m || ambient.email)
    }
  }, [loaded, profile, ambient])

  if (profile) {
    return (
      <p className="wizard-identity mono" title="Every vault write is attributed to this identity">
        {profile.name} &lt;{profile.email}&gt;
      </p>
    )
  }

  const candidate = { name: name.trim(), email: email.trim() }
  const valid = isValidIdentity(candidate)
  return (
    <div className="wizard-identity-form">
      <input
        className="modal-input"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="modal-input"
        placeholder="you@team.dev"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button
        type="button"
        className="button-secondary"
        disabled={!valid || saving}
        onClick={() => {
          setSaving(true)
          void save(candidate).finally(() => setSaving(false))
        }}
      >
        {saving ? 'Saving…' : 'Save identity'}
      </button>
      <p className="modal-hint">Every vault write is attributed — name and email are required.</p>
    </div>
  )
}
