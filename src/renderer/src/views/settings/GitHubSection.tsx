/**
 * GitHub settings row (story 12.2 AC1): the gh capability state, honestly.
 * No gh (or unauthenticated) → "install gh for PR chips" + a re-check button
 * (the m2 §6 "re-checked on settings change" path). No REST fallback, no
 * tokens, no OAuth — the gh CLI is the only network path this cycle.
 */
import { useEffect, useState } from 'react'
import { invoke } from '../../api'

export function GitHubSection(): React.JSX.Element {
  const [gh, setGh] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    void invoke('github.capability', {})
      .then((r) => setGh(r.gh))
      .catch(() => setGh(false))
  }, [])

  async function recheck(): Promise<void> {
    setChecking(true)
    try {
      setGh((await invoke('github.capability', { refresh: true })).gh)
    } catch {
      setGh(false)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="settings-section">
      <h2 className="settings-title">GitHub</h2>
      {gh === null ? (
        <p className="settings-hint">Checking for the GitHub CLI…</p>
      ) : gh ? (
        <p className="settings-hint">
          GitHub CLI detected and signed in — commit chips show PR status, and merged PRs can
          suggest handoff status changes (always your click, never automatic).
        </p>
      ) : (
        <p className="settings-hint">
          Install gh for PR chips: commit links stay plain without the GitHub CLI. Install it
          (<span className="mono">brew install gh</span>), sign in with{' '}
          <span className="mono">gh auth login</span>, then check again. This app never asks for a
          GitHub login itself.
        </p>
      )}
      <div className="settings-actions">
        <button
          type="button"
          className="button-secondary"
          disabled={checking}
          onClick={() => void recheck()}
        >
          {checking ? 'Checking…' : 'Check again'}
        </button>
      </div>
    </div>
  )
}
