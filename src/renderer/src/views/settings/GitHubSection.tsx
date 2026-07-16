/**
 * GitHub section (v3 §9 / AUTH-GITHUB.md, story 26.7) — Settings › System.
 * Sign-in state honestly: a live `gh` session is auto-detected (approach A),
 * a pasted fine-grained PAT stores in the macOS keychain (approach C, the
 * one shared entry the CLI reads), device flow (approach B) unlocks when the
 * public OAuth client id is registered. Signed in ⇒ the dex registry: every
 * repo carrying the `loredex-dex` topic, Join (clone via the wizard) or
 * Create (new private repo + topic). Login stays OPTIONAL — SSH dexes never
 * need any of this.
 */
import { useEffect, useState } from 'react'
import type { AuthStatus, DexRepo } from '../../../../shared/types'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import { Button } from '../../components/Button'
import { invoke } from '../../api'
import { useWizard } from '../../stores/wizard'

function RegistryRow({ repo }: { repo: DexRepo }): React.JSX.Element {
  const openJoin = useWizard((s) => s.openJoin)
  return (
    <div className="dexreg-row">
      <span className="dexreg-name" title={repo.fullName}>
        {repo.fullName}
      </span>
      <span className="dexreg-meta">
        {repo.isPrivate ? 'private' : 'public'}
        {repo.pushedAt ? ` · pushed ${repo.pushedAt.slice(0, 10)}` : ''}
      </span>
      <Button
        className="button-small"
        title="Clone this dex and register it (join wizard)"
        onClick={() => openJoin({ remote: repo.cloneUrl })}
      >
        Join
      </Button>
    </div>
  )
}

export function GitHubSection(): React.JSX.Element {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pat, setPat] = useState('')
  const [showPat, setShowPat] = useState(false)
  const [registry, setRegistry] = useState<DexRepo[] | null>(null)
  const [createName, setCreateName] = useState('')

  const refresh = async (): Promise<void> => {
    try {
      setStatus(await invoke('auth.status', undefined))
      setError(null)
    } catch (e) {
      setError(isErrEnvelope(e) ? e.message : String(e))
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(isErrEnvelope(e) ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const loadRegistry = (): Promise<void> =>
    run(async () => {
      setRegistry(await invoke('dex.registry', undefined))
    })

  const createDex = (): Promise<void> =>
    run(async () => {
      const repo = await invoke('dex.createRepo', { name: createName.trim(), isPrivate: true })
      setCreateName('')
      setRegistry((r) => (r ? [repo, ...r] : [repo]))
    })

  return (
    <div className="settings-section">
      <h2 className="settings-title">GitHub</h2>
      {status === null ? (
        <p className="settings-hint">Checking GitHub sign-in…</p>
      ) : status.signedIn ? (
        <>
          <p className="settings-hint">
            Signed in as <b>{status.account}</b> ·{' '}
            {status.source === 'gh' ? 'via your gh CLI session' : 'token in the macOS keychain'} ·{' '}
            <span className="mono">{status.tokenMask}</span>
            {status.scopes.length > 0 ? ` · scopes: ${status.scopes.join(', ')}` : ''}
          </p>
          <div className="settings-actions">
            <Button disabled={busy} onClick={() => void loadRegistry()}>
              {registry === null ? 'List my dexes' : 'Refresh dexes'}
            </Button>
            {status.source === 'stored' && (
              <Button
                variant="danger"
                disabled={busy}
                title="Removes the keychain entry; revoke at github.com/settings/tokens"
                onClick={() =>
                  void run(async () => setStatus(await invoke('auth.logout', undefined)))
                }
              >
                Sign out
              </Button>
            )}
            <Button variant="quiet" disabled={busy} onClick={() => void refresh()}>
              Re-check
            </Button>
          </div>
          {registry !== null && (
            <div className="dexreg" aria-label="Dex registry">
              <div className="today-sect">
                <span className="today-sect-label">
                  dexes · loredex-dex topic · {registry.length}
                </span>
              </div>
              {registry.length === 0 ? (
                <p className="settings-hint">
                  No repos carry the <span className="mono">loredex-dex</span> topic yet — create
                  one below or add the topic to an existing dex repo.
                </p>
              ) : (
                registry.map((r) => <RegistryRow key={r.fullName} repo={r} />)
              )}
              <div className="dexreg-create">
                <input
                  className="settings-input"
                  placeholder="new-dex-name (one dex per product)"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
                <Button
                  variant="primary"
                  disabled={busy || createName.trim() === ''}
                  title="Creates a private repo with the loredex-dex topic"
                  onClick={() => void createDex()}
                >
                  Create dex
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {status.source === 'revoked' && (
            <p className="settings-hint auth-revoked">
              Your stored token (<span className="mono">{status.tokenMask}</span>) was revoked or
              expired — sign in again below.
            </p>
          )}
          <p className="settings-hint">
            Signing in adds dex discovery, create/join from the app, and HTTPS push without
            prompts. <b>SSH dexes need no login</b> — git already handles them. A{' '}
            <span className="mono">gh auth login</span> session is picked up automatically.
          </p>
          <div className="settings-actions">
            <Button disabled={busy} onClick={() => void refresh()}>
              Detect gh session
            </Button>
            <Button variant="quiet" disabled={busy} onClick={() => setShowPat((v) => !v)}>
              Paste a token…
            </Button>
          </div>
          {showPat && (
            <div className="dexreg-create">
              <input
                className="settings-input"
                type="password"
                placeholder="fine-grained PAT — Contents read/write + Metadata"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
              />
              <Button
                variant="primary"
                disabled={busy || pat.trim() === ''}
                onClick={() =>
                  void run(async () => {
                    setStatus(await invoke('auth.loginWithToken', { token: pat.trim() }))
                    setPat('')
                    setShowPat(false)
                  })
                }
              >
                Sign in
              </Button>
            </div>
          )}
          <p className="settings-hint">
            “Sign in with GitHub” (device flow) unlocks once the loredex OAuth app id ships — no
            secrets ever live in this binary.
          </p>
        </>
      )}
      {error && <div className="note-error">{error}</div>}
    </div>
  )
}
