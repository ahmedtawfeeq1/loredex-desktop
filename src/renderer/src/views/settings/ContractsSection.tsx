/**
 * Contract intelligence settings (story 11.1): project roots (folder picker
 * via the native panel — never a cold scan) + user contract globs. When the
 * loredex config's projects map wins the precedence, the list is read-only —
 * the app-side map is never written back into config.json.
 */
import { useEffect, useState } from 'react'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import type { ProjectRootsMap } from '../../../../shared/types'
import { invoke, pickProjectRoot } from '../../api'

export function ContractsSection(): React.JSX.Element {
  const [roots, setRoots] = useState<ProjectRootsMap>({})
  const [fromConfig, setFromConfig] = useState(false)
  const [globs, setGlobs] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void invoke('settings.projectRoots.get', undefined)
      .then((r) => {
        setRoots(r.roots)
        setFromConfig(r.fromConfig)
      })
      .catch(() => {})
    void invoke('settings.contractGlobs.get', undefined)
      .then((r) => setGlobs(r.globs.join('\n')))
      .catch(() => {})
  }, [])

  async function persistRoots(next: ProjectRootsMap): Promise<void> {
    setError(null)
    try {
      await invoke('settings.projectRoots.set', { roots: next })
      setRoots(next)
    } catch (e) {
      setError(isErrEnvelope(e) ? e.message : String(e))
    }
  }

  async function addRoot(): Promise<void> {
    const dir = await pickProjectRoot()
    if (!dir) return
    const name = dir.split('/').filter(Boolean).pop() ?? dir
    await persistRoots({ ...roots, [dir]: { name } })
  }

  async function saveGlobs(): Promise<void> {
    setSaved(false)
    setError(null)
    const parsed = globs
      .split(/[\n,]+/)
      .map((g) => g.trim())
      .filter(Boolean)
    try {
      await invoke('settings.contractGlobs.set', { globs: parsed })
      setSaved(true)
    } catch (e) {
      setError(isErrEnvelope(e) ? e.message : String(e))
    }
  }

  const entries = Object.entries(roots)

  return (
    <div className="settings-section">
      <h2 className="settings-title">Contracts</h2>
      <p className="settings-hint">
        Project folders scanned for API contract files (openapi, postman, graphql) — the
        Contracts timeline reads their git history, read-only.
      </p>
      {entries.length === 0 ? (
        <p className="settings-hint">No project folders yet.</p>
      ) : (
        <ul className="settings-roots">
          {entries.map(([path, { name }]) => (
            <li key={path} className="settings-root-row">
              <span className="settings-root-name">{name}</span>
              <span className="mono settings-root-path" title={path}>
                {path}
              </span>
              {!fromConfig && (
                <button
                  type="button"
                  className="button-quiet"
                  title="Stop scanning this folder"
                  onClick={() => {
                    const next = { ...roots }
                    delete next[path]
                    void persistRoots(next)
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {fromConfig ? (
        <p className="settings-hint">
          Managed by your loredex config (<span className="mono">config.projects</span>) — edit
          that file to change them.
        </p>
      ) : (
        <div className="settings-actions">
          <button type="button" className="button-secondary" onClick={() => void addRoot()}>
            Add project folder…
          </button>
        </div>
      )}
      <label className="settings-field">
        <span>Extra globs</span>
        <textarea
          rows={2}
          value={globs}
          placeholder={'contracts/**/*.proto\napi/*.raml'}
          onChange={(e) => {
            setGlobs(e.target.value)
            setSaved(false)
          }}
        />
      </label>
      <div className="settings-actions">
        {/* secondary: one gold primary per view (Save identity owns it) */}
        <button type="button" className="button-secondary" onClick={() => void saveGlobs()}>
          Save globs
        </button>
        {saved && <span className="settings-saved">Saved</span>}
      </div>
      {error && <p className="settings-error">{error}</p>}
    </div>
  )
}
