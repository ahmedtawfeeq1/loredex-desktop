/**
 * AI providers (B1 login — Settings › System). The API-key half of the LOCKED
 * login decision: paste a provider's API key (stored in the OS keychain via
 * agent.auth.*, folded into ONLY that adapter's env at spawn — never process.env
 * / the vault / a log) to authenticate by token instead of the CLI subscription.
 * The one-click TERMINAL login (`claude /login`, `codex login`) lives in the
 * agent panel's auth card; this is the pay-per-token alternative and the home
 * for API-only providers. Presence only ever crosses the seam — the key is
 * write-only from the renderer.
 */
import { useEffect, useState } from 'react'
import type { AcpAgent } from '../../../../shared/ipc-contract'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import { invoke } from '../../api'
import { Button } from '../../components/Button'

const PROVIDERS: { agent: AcpAgent; label: string; keyName: string; terminal: boolean }[] = [
  { agent: 'claude', label: 'Claude', keyName: 'ANTHROPIC_API_KEY', terminal: true },
  { agent: 'codex', label: 'Codex', keyName: 'OPENAI_API_KEY', terminal: true },
  { agent: 'gemini', label: 'Gemini', keyName: 'GEMINI_API_KEY', terminal: false },
]

function ProviderRow({
  agent,
  label,
  keyName,
  terminal,
  hasKey,
  onChange,
}: {
  agent: AcpAgent
  label: string
  keyName: string
  terminal: boolean
  hasKey: boolean
  onChange: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (): Promise<void> => {
    if (draft.trim() === '') return
    setBusy(true)
    try {
      await invoke('agent.auth.setKey', { agent, key: draft.trim() })
      setDraft('')
      onChange()
    } finally {
      setBusy(false)
    }
  }

  const clear = async (): Promise<void> => {
    setBusy(true)
    try {
      await invoke('agent.auth.clearKey', { agent })
      onChange()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="agent-auth-row">
      <div className="agent-auth-head">
        <span className={`settings-dot ${hasKey ? 'dot-ok' : ''}`} aria-hidden="true" />
        <span className="agent-auth-name">{label}</span>
        <span className="agent-auth-mode mono">{hasKey ? 'API key' : 'subscription'}</span>
      </div>
      <p className="settings-hint">
        {terminal ? (
          <>
            Default: reuse the CLI subscription — click <b>Log in with {label}</b> in the agent
            panel (runs <span className="mono">{agent === 'claude' ? 'claude /login' : 'codex login'}</span>).
            Or paste an <span className="mono">{keyName}</span> below to bill per token.
          </>
        ) : (
          <>
            Paste a <span className="mono">{keyName}</span> to authenticate this provider by API key.
          </>
        )}
      </p>
      <div className="dexreg-create">
        <input
          className="settings-input"
          type="password"
          placeholder={hasKey ? 'Replace the stored key…' : `${keyName}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button variant="primary" disabled={busy || draft.trim() === ''} onClick={() => void save()}>
          {hasKey ? 'Replace key' : 'Save key'}
        </Button>
        {hasKey && (
          <Button variant="danger" disabled={busy} onClick={() => void clear()}>
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}

export function AgentAuthSection(): React.JSX.Element {
  const [status, setStatus] = useState<Record<string, boolean> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (retried = false): Promise<void> => {
    try {
      const rows = await invoke('agent.auth.status', undefined)
      setStatus(Object.fromEntries(rows.map((r) => [r.agent, r.hasKey])))
      setError(null)
    } catch (e) {
      // first-attach port swap drops early invokes — retry once (app.init pattern)
      if (!retried && isErrEnvelope(e) && e.code === 'PORT_SWAPPED') return refresh(true)
      setError(isErrEnvelope(e) ? e.message : String(e))
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="settings-section">
      <h2 className="settings-title">AI providers</h2>
      <p className="settings-hint">
        Each agent reuses your existing CLI <b>subscription</b> by default (no extra login) — or
        authenticate by <b>API key</b> here to bill per token. Keys live in this machine’s keychain,
        never the vault or a commit.
      </p>
      {PROVIDERS.map((p) => (
        <ProviderRow
          key={p.agent}
          agent={p.agent}
          label={p.label}
          keyName={p.keyName}
          terminal={p.terminal}
          hasKey={status?.[p.agent] ?? false}
          onChange={() => void refresh()}
        />
      ))}
      {error && <div className="note-error">{error}</div>}
    </div>
  )
}
