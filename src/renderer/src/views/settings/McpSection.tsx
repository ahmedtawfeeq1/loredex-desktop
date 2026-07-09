/**
 * MCP server section (story 1.6): host status + the port override that is the
 * sanctioned answer to a port conflict (loud-fail policy — never listen(0)).
 */
import { useEffect, useState } from 'react'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import type { McpStatus } from '../../../../shared/types'
import { invoke } from '../../api'

export function McpSection(): React.JSX.Element {
  const [status, setStatus] = useState<McpStatus | null>(null)
  const [port, setPort] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void invoke('mcp.status', undefined)
      .then((s) => {
        setStatus(s)
        setPort(s.portOverride === null ? '' : String(s.portOverride))
      })
      .catch(() => setStatus(null))
  }, [])

  async function save(): Promise<void> {
    setSaved(false)
    setError(null)
    const trimmed = port.trim()
    try {
      await invoke('settings.mcpPort.set', { port: trimmed === '' ? null : Number(trimmed) })
      setSaved(true)
    } catch (e) {
      setError(isErrEnvelope(e) ? e.message : String(e))
    }
  }

  return (
    <div className="settings-section">
      <h2 className="settings-title">MCP server</h2>
      {status === null ? (
        <p className="settings-hint">Status unavailable.</p>
      ) : status.state === 'running' ? (
        <p className="settings-hint">
          Serving agents on <span className="mono">127.0.0.1:{status.port}</span> — discovery file{' '}
          <span className="mono">{status.discoveryPath}</span>
        </p>
      ) : status.state === 'port-conflict' ? (
        <p className="settings-error">{status.message}</p>
      ) : (
        <p className="settings-hint">Not running — open a vault to start it.</p>
      )}
      <label className="settings-field">
        <span>Port</span>
        <input
          value={port}
          inputMode="numeric"
          placeholder={String(status?.preferredPort ?? 52017)}
          onChange={(e) => {
            setPort(e.target.value)
            setSaved(false)
          }}
        />
      </label>
      <div className="settings-actions">
        <button type="button" className="button-primary" onClick={() => void save()}>
          Save port
        </button>
        {saved && <span className="settings-saved">Saved — applies when the vault is reopened</span>}
      </div>
      {error && <p className="settings-error">{error}</p>}
    </div>
  )
}
