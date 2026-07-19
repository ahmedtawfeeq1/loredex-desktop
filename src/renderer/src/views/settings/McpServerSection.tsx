/**
 * Settings › MCP server (slice C — reference 15/22): the green status card
 * (serving address · connected-now · copy connect command · view live
 * sessions), the Port row, and the two REAL switches — start-on-open and
 * expose-write-tools (both live core-side; write-tools applies without a
 * restart, autostart on the next dex open).
 */
import { useEffect, useState } from 'react'
import type { McpLogEntry, McpStatus } from '../../../../shared/types'
import { invoke } from '../../api'
import { Button } from '../../components/Button'
import { useApp } from '../../stores/app'

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean
  onChange: (next: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch${on ? ' is-on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span className="switch-knob" />
    </button>
  )
}

/** distinct agents seen in the MCP ring within the live window ≈ connected */
export function connectedNow(log: McpLogEntry[], nowMs: number): number {
  const seen = new Set<string>()
  for (const e of log) {
    if (nowMs - Date.parse(e.at) > 10 * 60 * 1000) continue
    seen.add(e.agent ?? '·install')
  }
  return seen.size
}

export function McpServerSection(): React.JSX.Element {
  const [mcp, setMcp] = useState<McpStatus | null>(null)
  const [log, setLog] = useState<McpLogEntry[]>([])
  const [settings, setSettings] = useState<{ autostart: boolean; writeTools: boolean } | null>(null)
  const [port, setPort] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const setView = useApp((s) => s.setView)

  useEffect(() => {
    void invoke('agents.sessions', undefined)
      .then((r) => {
        setMcp(r.mcp)
        setLog(r.log)
      })
      .catch(() => {})
    void invoke('mcp.settings.get', undefined)
      .then(setSettings)
      .catch(() => {})
  }, [])

  const running = mcp?.state === 'running'
  const connected = connectedNow(log, Date.now())

  const save = (patch: { autostart?: boolean; writeTools?: boolean }): void => {
    setSettings((s) => (s ? { ...s, ...patch } : s))
    void invoke('mcp.settings.set', patch).catch(() => {})
  }

  // Apply & retry: rebind the host now. `port === undefined` retries on the
  // current port (clears a stale conflict); a value moves + rebinds.
  async function restart(nextPort?: number | null): Promise<void> {
    setRestarting(true)
    try {
      const status = await invoke('mcp.restart', nextPort === undefined ? {} : { port: nextPort })
      setMcp(status)
    } catch {
      // the returned status already carries a conflict/error message; ignore throw
    } finally {
      setRestarting(false)
    }
  }
  const portChanged = port.trim() !== '' && port.trim() !== String(mcp?.portOverride ?? '')
  // empty field → clear the override (back to the preferred port); else the number
  const applyPort = (): number | null => {
    const t = port.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isInteger(n) ? n : null
  }

  return (
    <>
      <div className={`mcp-card${running ? ' is-ok' : ' is-bad'}`}>
        <div className="mcp-card-head">
          <span className={`sync-pill-dot ${running ? 'tone-ink' : 'tone-rust'}`} />
          <span className="mcp-card-title">
            {running
              ? `Serving agents on 127.0.0.1:${mcp?.port}`
              : mcp?.state === 'port-conflict'
                ? 'Port conflict — agents cannot reach this dex'
                : 'Server stopped'}
          </span>
          {running && (
            <span className="meta mcp-card-count">
              {connected} connected now
            </span>
          )}
        </div>
        <div className="mcp-card-actions">
          {!running && (
            <Button
              variant="emphasis"
              disabled={restarting}
              title="Rebind the MCP host on the current port now"
              onClick={() => void restart()}
            >
              {restarting ? 'Retrying…' : 'Retry now'}
            </Button>
          )}
          <Button
            className="mono-btn"
            title="Copy the .mcp.json server entry (includes this install's bearer token)"
            onClick={() =>
              void invoke('mcp.connectSnippet', undefined).then(({ snippet }) => {
                void navigator.clipboard.writeText(snippet)
                setCopied(true)
                setTimeout(() => setCopied(false), 2500)
              })
            }
          >
            {copied ? 'copied ✓' : '⧉ copy connect command'}
          </Button>
          <Button variant="quiet" onClick={() => setView('agents')}>
            view live sessions →
          </Button>
        </div>
      </div>

      <div className="set-card">
        <div className="set-row">
          <span className="set-row-label">Port</span>
          <span className="set-row-value mcp-port-row">
            <input
              className="settings-input port-input"
              inputMode="numeric"
              placeholder={String(mcp?.preferredPort ?? 52017)}
              defaultValue={mcp?.portOverride ?? ''}
              onChange={(e) => setPort(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && portChanged) void restart(applyPort())
              }}
            />
            <Button
              variant="secondary"
              disabled={restarting || !portChanged}
              title="Save this port and rebind the MCP host now"
              onClick={() => void restart(applyPort())}
            >
              {restarting ? 'Applying…' : 'Apply & retry'}
            </Button>
          </span>
        </div>
        <div className="set-row">
          <span className="set-row-label">Start server when a dex opens</span>
          <Toggle
            on={settings?.autostart !== false}
            label="Start server when a dex opens"
            onChange={(v) => save({ autostart: v })}
          />
        </div>
        <div className="set-row">
          <span className="set-row-label">Expose write tools (vault_store, work_update)</span>
          <Toggle
            on={settings?.writeTools !== false}
            label="Expose write tools"
            onChange={(v) => save({ writeTools: v })}
          />
        </div>
      </div>
      <p className="meta settings-foot">
        status dot lives in the nav — problems visible before you click. state + fix + test always
        together.
      </p>
    </>
  )
}
