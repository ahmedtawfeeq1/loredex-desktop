/**
 * Sync health panel (story 5.2, the F8 net made visible): every git truth in
 * one grid, handshake + MCP port-conflict banners, Sync Now with a structured
 * report, and the git.warning log — nothing git says goes unseen.
 */
import { useEffect } from 'react'
import type { SyncHealth } from '../../../../shared/types'
import { useApp } from '../../stores/app'
import { dotTone, useSync } from '../../stores/sync'

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn' | 'bad'
}): React.JSX.Element {
  return (
    <div className="sync-row">
      <span className="sync-row-label">{label}</span>
      <span className={`sync-row-value${tone ? ` sync-${tone}` : ''}`}>{value}</span>
    </div>
  )
}

const fmtTime = (iso: string | null): string => (iso ? iso.slice(0, 16).replace('T', ' ') : 'never')

function StatusGrid({ health }: { health: SyncHealth }): React.JSX.Element {
  const aheadBehind =
    health.ahead === 0 && health.behind === 0
      ? 'in sync'
      : `${health.ahead} ahead · ${health.behind} behind`
  return (
    <div className="sync-grid">
      <Row
        label="remote"
        value={health.remote ?? 'none configured'}
        tone={health.remote ? undefined : 'bad'}
      />
      <Row
        label="reachable"
        value={health.remote ? (health.remoteReachable ? 'yes' : 'NO') : '—'}
        tone={!health.remote ? undefined : health.remoteReachable ? 'ok' : 'bad'}
      />
      <Row
        label="branch"
        value={
          health.branchMatches
            ? (health.branch ?? '—')
            : `${health.branch} (team: ${health.canonicalBranch})`
        }
        tone={health.branchMatches ? undefined : 'bad'}
      />
      <Row
        label="ahead/behind"
        value={aheadBehind}
        tone={health.ahead + health.behind === 0 ? 'ok' : 'warn'}
      />
      <Row label="last pull" value={fmtTime(health.lastPull)} />
      <Row label="last push" value={fmtTime(health.lastPush)} />
      <Row
        label="merge driver"
        value={health.mergeDriverInstalled ? 'installed' : 'MISSING'}
        tone={health.mergeDriverInstalled ? 'ok' : 'bad'}
      />
      <Row
        label="gitattributes"
        value={health.gitattributesValid ? 'valid' : 'INVALID'}
        tone={health.gitattributesValid ? 'ok' : 'bad'}
      />
    </div>
  )
}

export function SyncPanel(): React.JSX.Element {
  const { health, handshake, mcp, report, warnings, syncing, error, load, syncNow } = useSync()
  const setView = useApp((s) => s.setView)

  useEffect(() => {
    if (!health) void load()
  }, [health, load])

  return (
    <div className="sync">
      <div className="board-header">
        <span className="pane-list-title">Sync health</span>
        {health && <span className={`sync-dot sync-dot-${dotTone(health)}`} aria-hidden />}
        <button
          type="button"
          className="button-quiet"
          title="Re-read sync status"
          onClick={() => void load()}
        >
          Refresh
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={syncing}
          onClick={() => void syncNow()}
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      {handshake && !handshake.ok && (
        <div className="sync-banner">
          Vault notes declare loredex schema {handshake.schemaDeclared}; this app supports{' '}
          {handshake.schemaSupported} (engine {handshake.engineVersion}). A newer CLI or agent
          wrote here — update Loredex Desktop before writing to this vault.
        </div>
      )}
      {mcp?.state === 'port-conflict' && (
        <div className="sync-banner">
          {mcp.message}{' '}
          <button type="button" className="sync-banner-action" onClick={() => setView('settings')}>
            Open Settings
          </button>
        </div>
      )}

      {error && <div className="note-error">{error}</div>}
      {health ? (
        <StatusGrid health={health} />
      ) : (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>Reading git status…</p>
        </div>
      )}

      {health && health.warnings.length > 0 && (
        <div className="sync-section">
          <h2 className="sync-section-title">Status warnings</h2>
          {health.warnings.map((w) => (
            <p key={w} className="sync-warning-row">
              {w}
            </p>
          ))}
        </div>
      )}

      {report && (
        <div className="sync-section">
          <h2 className="sync-section-title">Last sync</h2>
          <p className="sync-report-line">
            pulled {report.pulled} commit{report.pulled === 1 ? '' : 's'} · pushed{' '}
            {report.pushed ? 'yes' : 'no'} · {report.warnings.length} warning
            {report.warnings.length === 1 ? '' : 's'}
          </p>
        </div>
      )}

      <div className="sync-section">
        <h2 className="sync-section-title">Warning log</h2>
        {warnings.length === 0 ? (
          <p className="sync-log-empty">No git warnings this session.</p>
        ) : (
          warnings.map((w) => (
            <p key={`${w.at}-${w.text}`} className="sync-warning-row">
              <span className="sync-warning-at">{w.at.slice(11, 19)}</span> {w.text}
            </p>
          ))
        )}
      </div>
    </div>
  )
}
