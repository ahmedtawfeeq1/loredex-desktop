/**
 * Filing-scope settings (epic4.story3): "internal, never route" globs. Persisted
 * through the shared lib config (settings.neverRoute.set → saveConfig) so the CLI
 * honors the exact same list — this is team-visible routing policy, never app-db.
 * A source matching any glob is refused by the router with a named-glob explanation
 * (F4: internal scratch files can't be silently published).
 */
import { useEffect, useState } from 'react'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import { invoke } from '../../api'

export function ScopeSettings(): React.JSX.Element {
  const [globs, setGlobs] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void invoke('settings.neverRoute.get', undefined)
      .then((r) => setGlobs(r.globs))
      .catch(() => {})
  }, [])

  async function persist(next: string[]): Promise<void> {
    setError(null)
    try {
      await invoke('settings.neverRoute.set', { globs: next })
      setGlobs(next)
    } catch (e) {
      setError(isErrEnvelope(e) ? e.message : String(e))
    }
  }

  function add(): void {
    const g = draft.trim()
    if (!g || globs.includes(g)) return
    setDraft('')
    void persist([...globs, g])
  }

  return (
    <div className="settings-section">
      <h2 className="settings-title">Never route</h2>
      <p className="settings-hint">
        Files matching these globs are never filed into the vault — internal scratch, findings,
        drafts. The CLI honors the same list. Matches by filename or path (
        <span className="mono">FINDINGS.md</span>, <span className="mono">**/scratch/**</span>,{' '}
        <span className="mono">*.internal.md</span>).
      </p>
      {globs.length === 0 ? (
        <p className="settings-hint">No never-route globs yet.</p>
      ) : (
        <ul className="settings-roots">
          {globs.map((g) => (
            <li key={g} className="settings-root-row">
              <span className="mono settings-root-path">{g}</span>
              <button
                type="button"
                className="button-quiet"
                title="Remove this glob"
                onClick={() => void persist(globs.filter((x) => x !== g))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="settings-actions">
        <input
          className="settings-inline-input mono"
          value={draft}
          placeholder="**/scratch/**"
          aria-label="Never-route glob"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button type="button" className="button-secondary" onClick={add}>
          Add glob
        </button>
      </div>
      {error && <p className="settings-error">{error}</p>}
    </div>
  )
}
