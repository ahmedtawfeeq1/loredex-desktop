/**
 * One client's page (agent-ops epic): header w/ manager + tags + health,
 * pipelines with the ordered 01→NN stage rail, agents, knowledge tables,
 * workflows, inbox attention, and the workspace panel (generate/check via
 * clients.workspace — writes only gitignored files). Every file name is a
 * reader open target (hyperlink-everything).
 */
import { useEffect, useState } from 'react'
import type {
  ClientCredential,
  ClientInfo,
  ClientWorkspaceStatus,
  SnapshotSummary,
  WorkspaceResult,
} from '../../../../shared/ipc-contract'
import type { Identity } from '../../../../shared/types'
import { invoke } from '../../api'
import { useApp } from '../../stores/app'
import { useDex } from '../../stores/dex'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { useAgentPanel } from '../../stores/agentPanel'
import { useReader } from '../../stores/reader'
import { useTerminal } from '../../stores/terminal'
import { useToasts } from '../../stores/toasts'
import { sectionTint } from '../reader/sectionTint'
import { buildClientPage, type UnitSection } from './client-page'

const PAGE_CSS = `
.client-page { padding: 24px 32px; overflow-y: auto; width: 100%; max-width: 1080px; }
.cp-back { font-size: 12px; color: var(--text-2); margin-bottom: 10px; }
.cp-header { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.cp-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--section-color); }
.cp-title { font-family: var(--font-ui); font-size: 26px; color: var(--text-1); }
.cp-manager { font-size: 12px; color: var(--text-2); }
.cp-tags { display: flex; gap: 6px; }
.cp-tag { font-size: 11px; font-weight: 600; color: var(--text-2); border: 1px solid var(--hairline); border-radius: 12px; padding: 1px 9px; }
.cp-counts { font-size: 12.5px; color: var(--text-2); margin-bottom: 18px; }
.cp-errors { color: var(--rust, #a33f2e); font-weight: 600; }
.cp-attention {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 16px;
  border: 1px solid var(--warn); border-radius: 8px; font-size: 12.5px; color: var(--text-1);
}
.cp-section { margin-bottom: 22px; }
.cp-section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-2); margin-bottom: 8px; }
.cp-unit { border: 1px solid var(--hairline); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; background: var(--bg-card); }
.cp-unit-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.cp-unit-snapshot { font-size: 11px; color: var(--text-2); border: 1px solid var(--hairline); border-radius: 6px; padding: 2px 9px; cursor: pointer; white-space: nowrap; }
.cp-unit-snapshot:hover { color: var(--text-1); border-color: var(--accent-hi); }
.cp-unit-name { font-weight: 650; color: var(--text-1); }
.cp-unit-kind { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-2); }
.cp-unit-files { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.cp-filelink { font-size: 11.5px; color: var(--text-2); border: 1px solid var(--hairline); border-radius: 6px; padding: 2px 8px; cursor: pointer; }
.cp-filelink:hover { color: var(--text-1); border-color: var(--text-2); }
.cp-stage-rail { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.cp-stage { display: flex; align-items: center; gap: 6px; font-size: 12px; border: 1px solid var(--hairline); border-radius: 8px; padding: 4px 10px; cursor: pointer; color: var(--text-1); }
.cp-stage:hover { border-color: var(--text-2); }
.cp-stage-nn { font-family: var(--font-mono, monospace); font-size: 10.5px; color: var(--text-2); }
.cp-stage-broken { border-color: var(--rust, #a33f2e); color: var(--rust, #a33f2e); }
.cp-stage-arrow { color: var(--text-2); font-size: 11px; }
.cp-problems { margin-top: 8px; font-size: 12px; color: var(--rust, #a33f2e); }
.cp-rows { display: flex; flex-direction: column; gap: 4px; }
.cp-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-1); cursor: pointer; padding: 3px 6px; border-radius: 6px; text-align: left; }
.cp-row:hover { background: var(--bg-inset); }
.cp-row-type { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-2); border: 1px solid var(--hairline); border-radius: 4px; padding: 0 5px; }
.cp-versions-unit { margin-bottom: 10px; }
.cp-versions-unit-name { font-size: 12px; font-weight: 650; color: var(--text-1); margin-bottom: 4px; }
.cp-versions-empty { font-size: 12.5px; color: var(--text-2); }
.cp-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; z-index: 40; }
.cp-modal { width: min(440px, 92vw); background: var(--bg-card); border: 1px solid var(--hairline); border-radius: 12px; padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
.cp-modal-title { font-size: 15px; font-weight: 650; color: var(--text-1); }
.cp-modal-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-2); }
.cp-modal-field input { font-size: 13px; padding: 6px 8px; border: 1px solid var(--hairline); border-radius: 6px; background: var(--bg-inset); color: var(--text-1); }
.cp-modal-check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text-1); }
.cp-modal-error { font-size: 12px; color: var(--rust, #a33f2e); }
.cp-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.cp-cred-add { margin-left: 10px; font-size: 11px; font-weight: 600; color: var(--accent-hi); border: 1px solid var(--accent-hi); border-radius: 6px; padding: 1px 8px; cursor: pointer; text-transform: none; letter-spacing: 0; }
.cp-cred-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; padding: 5px 8px; border: 1px solid var(--hairline); border-radius: 8px; }
.cp-cred-label { font-weight: 650; color: var(--text-1); }
.cp-cred-user { color: var(--text-2); }
.cp-cred-secret { font-family: var(--font-mono, monospace); color: var(--text-2); letter-spacing: 1px; }
.cp-cred-url { color: var(--text-3); font-size: 11.5px; }
.cp-cred-actions { display: flex; gap: 4px; margin-left: auto; }
.cp-cred-actions button { font-size: 11px; color: var(--text-2); border: 1px solid var(--hairline); border-radius: 6px; padding: 1px 7px; cursor: pointer; }
.cp-cred-actions button:hover { color: var(--text-1); border-color: var(--text-2); }
.cp-ws { border: 1px solid var(--hairline); border-radius: 10px; padding: 12px 14px; background: var(--bg-card); }
.cp-ws-conn { font-family: var(--font-mono); font-size: 10px; color: var(--text-2); }
.cp-ws-row { display: flex; align-items: center; gap: 10px; }
.cp-ws-result { margin-top: 8px; font-size: 12px; color: var(--text-2); }
.cp-ws-result .ok { color: var(--ok, #2e6e5e); }
.cp-ws-result .warn { color: var(--rust, #a33f2e); }
.cp-conn { border: 1px solid var(--hairline); border-radius: 8px; padding: 10px 12px; margin-top: 10px; }
.cp-conn-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.cp-conn-name { font-size: 13.5px; font-weight: 650; color: var(--text-1); }
.cp-conn-state { font-size: 12px; font-weight: 600; }
.cp-conn-state.ok { color: var(--ok, #2e6e5e); }
.cp-conn-state.warn { color: var(--rust, #a33f2e); }
.cp-conn-state.dim { color: var(--text-2); }
.cp-conn-detail { font-size: 12px; margin: 2px 0 8px; }
.cp-conn-detail.warn { color: var(--rust, #a33f2e); }
.cp-ws-refs { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.cp-ws-ref { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.cp-ws-ref-state { font-size: 12px; font-weight: 600; white-space: nowrap; }
.cp-ws-ref-state.ok { color: var(--ok, #2e6e5e); }
.cp-ws-ref-state.warn { color: var(--rust, #a33f2e); }
.cp-ws-token-input {
  flex: 1; font-size: 12px; color: var(--text-1); background: var(--bg-inset);
  border: 1px solid var(--hairline); border-radius: 6px; padding: 4px 8px;
}
.cp-empty { font-size: 12.5px; color: var(--text-2); }
`

function openNote(path: string): void {
  useApp.getState().setView('reader')
  void useReader.getState().open(path)
}

function Unit({
  unit,
  onSnapshot,
}: {
  unit: UnitSection
  onSnapshot: (name: string) => void
}): React.JSX.Element {
  return (
    <div className="cp-unit">
      <div className="cp-unit-head">
        <span className="cp-unit-name">{unit.name}</span>
        <span className="cp-unit-kind">{unit.kind}</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="cp-unit-snapshot"
          title="Version this unit's definition files into _versions/ (committed)"
          onClick={() => onSnapshot(unit.name)}
        >
          ⧉ Snapshot
        </button>
      </div>
      <div className="cp-unit-files">
        {(
          [
            ['persona', unit.personaPath],
            ['instructions', unit.generalInstructionsPath],
            ['actions', unit.actionsPath],
            ['settings', unit.settingsPath],
          ] as const
        ).map(([label, path]) => (
          <button key={label} type="button" className="cp-filelink" onClick={() => openNote(path)}>
            {label}
          </button>
        ))}
      </div>
      {unit.kind === 'pipeline' && (
        <div className="cp-stage-rail">
          {unit.stages.length === 0 && <span className="cp-empty">no stages yet</span>}
          {unit.stages.map((stage, i) => (
            <span key={stage.nn + stage.slug} style={{ display: 'contents' }}>
              {i > 0 && (
                <span className="cp-stage-arrow" aria-hidden>
                  →
                </span>
              )}
              <button
                type="button"
                className={stage.broken ? 'cp-stage cp-stage-broken' : 'cp-stage'}
                title={stage.broken ? 'Stage files incomplete — see problems below' : undefined}
                onClick={() => openNote(stage.instructionsPath)}
              >
                <span className="cp-stage-nn">{stage.nn}</span>
                {stage.slug}
              </button>
            </span>
          ))}
        </div>
      )}
      {unit.problems.length > 0 && (
        <div className="cp-problems">
          {unit.problems.map((p) => (
            <div key={p}>✗ {p}</div>
          ))}
        </div>
      )}
    </div>
  )
}

type ProbeState = { state: 'testing' | 'ok' | 'fail'; detail: string }

/**
 * A client with no tooling yet: the dex's STANDARD connections (derived from
 * the fleet) render as one token row each — paste, Wire, done. Nobody picks a
 * "golden client"; the copy source is resolved core-side.
 */
function StandardToolingCard({
  client,
  onDone,
}: {
  client: string
  onDone: () => void
}): React.JSX.Element {
  const identity = useIdentity((s) => effectiveIdentity(s))
  const [standard, setStandard] = useState<
    Array<{ server: string; source: string; envRefs: string[] }>
  >([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void invoke('clients.standardTooling', undefined)
      .then((list) => {
        const usable = list.filter((c) => c.source !== client)
        setStandard(usable)
        setChecked(new Set(usable.map((c) => c.server)))
      })
      .catch(() => setStandard([]))
  }, [client])

  async function wire(): Promise<void> {
    if (identity === null || busy) return
    setBusy(true)
    setError(null)
    try {
      // group the checked connections by their copy source (usually one)
      const bySource = new Map<string, string[]>()
      for (const c of standard) {
        if (checked.has(c.server)) bySource.set(c.source, [...(bySource.get(c.source) ?? []), c.server])
      }
      for (const [from, servers] of bySource) {
        const refs = new Set(
          standard.filter((c) => servers.includes(c.server)).flatMap((c) => c.envRefs),
        )
        await invoke('clients.tooling.copy', {
          client,
          from,
          servers,
          tokens: Object.fromEntries(
            Object.entries(tokens).filter(([ref, v]) => refs.has(ref) && v.trim()),
          ),
          identity,
        })
      }
      onDone()
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  if (standard.length === 0) {
    return <div className="cp-empty">No tooling in this dex yet to inherit.</div>
  }
  const single = standard.length === 1
  return (
    <div className="cp-conn">
      {error && <div className="cp-conn-detail warn">{error}</div>}
      {standard.map((conn) => (
        <div key={conn.server} className="cp-ws-ref">
          {single ? (
            <span className="cp-conn-name">{conn.server}</span>
          ) : (
            <label className="cp-conn-name">
              <input
                type="checkbox"
                checked={checked.has(conn.server)}
                onChange={(e) => {
                  const next = new Set(checked)
                  if (e.target.checked) next.add(conn.server)
                  else next.delete(conn.server)
                  setChecked(next)
                }}
              />{' '}
              {conn.server}
            </label>
          )}
          {checked.has(conn.server) &&
            conn.envRefs.map((ref) => (
              <input
                key={ref}
                className="cp-ws-token-input"
                type="password"
                value={tokens[ref] ?? ''}
                placeholder="Paste this client's token"
                onChange={(e) => setTokens({ ...tokens, [ref]: e.target.value })}
              />
            ))}
        </div>
      ))}
      <div className="cp-ws-row" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="button-emphasis"
          disabled={busy || identity === null || checked.size === 0}
          title={identity === null ? 'Set your name and email in Settings first' : undefined}
          onClick={() => void wire()}
        >
          {busy ? 'Wiring…' : 'Wire'}
        </button>
      </div>
    </div>
  )
}

function WorkspacePanel({ info }: { info: ClientInfo }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<WorkspaceResult | null>(null)
  const [status, setStatus] = useState<ClientWorkspaceStatus | null>(null)
  const [conns, setConns] = useState<
    Array<{ server: string; envRefs: string[] }>
  >([])
  // per-connection LIVE probe — the only honest "Connected": a held token can
  // still be revoked server-side, so green must mean a real handshake passed
  const [probes, setProbes] = useState<Record<string, ProbeState>>({})
  const [pasted, setPasted] = useState<Record<string, string>>({})
  const [replacing, setReplacing] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const testConnection = (server: string): void => {
    setProbes((p) => ({ ...p, [server]: { state: 'testing', detail: '' } }))
    void invoke('clients.connections.test', { client: info.slug, server })
      .then((r) =>
        setProbes((p) => ({
          ...p,
          [server]: { state: r.ok ? 'ok' : 'fail', detail: r.detail },
        })),
      )
      .catch((e) =>
        setProbes((p) => ({
          ...p,
          [server]: { state: 'fail', detail: String((e as { message?: string }).message ?? e) },
        })),
      )
  }

  const refreshAll = (probe: boolean): void => {
    if (!info.hasWorkspaceYml) return
    void invoke('clients.workspace.status', { client: info.slug })
      .then(setStatus)
      .catch(() => setStatus(null))
    void invoke('clients.connections', { client: info.slug })
      .then((list) => {
        setConns(list)
        if (probe) for (const c of list) testConnection(c.server)
      })
      .catch(() => setConns([]))
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch per client only
  useEffect(() => refreshAll(true), [info.slug])

  // Re-wire always goes through clients.tokens.set — it materializes WITH this
  // machine's keychain tokens; the bare clients.workspace channel would expand
  // from a shell env that desktop users don't have.
  async function rewire(tokens: Record<string, string>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setResult(await invoke('clients.tokens.set', { client: info.slug, tokens }))
      setPasted({})
      setReplacing(new Set())
      refreshAll(true) // re-probe — status must reflect the new token, not hope
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  // WP-A: open the agent chat panel in THIS client's folder (◈ scoped session).
  // Materialize stale/absent tooling first so the client's own MCP servers
  // attach to the session, then start the chat at the client dir.
  async function chatHere(): Promise<void> {
    try {
      if (info.hasWorkspaceYml && status && (status.drift || !status.generated)) {
        await rewire({})
      }
      const { dir } = await invoke('clients.dirAbs', { client: info.slug })
      await useAgentPanel.getState().openHere(dir)
    } catch {
      // no bridge / start failed — best-effort, the panel just doesn't open
    }
  }

  const pastedReady = Object.entries(pasted).filter(([, v]) => v.trim())
  const PROBE_LABEL: Record<ProbeState['state'], string> = {
    testing: '◌ Testing…',
    ok: '✓ Connected',
    fail: '✗ Failed',
  }
  return (
    <div className="cp-ws">
      <div className="cp-ws-row">
        <button
          type="button"
          className="button-emphasis"
          disabled={busy || !info.hasWorkspaceYml}
          title={
            info.hasWorkspaceYml
              ? "Regenerate .mcp.json / .claude settings / AGENTS.md with this machine's stored tokens (gitignored files only)"
              : 'No workspace.yml in this client'
          }
          onClick={() => void rewire({})}
        >
          {status?.generated ? 'Re-wire' : 'Wire'}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={!info.hasWorkspaceYml}
          title="Open the in-app terminal in this client's folder — then just type claude"
          onClick={() =>
            void invoke('clients.dirAbs', { client: info.slug })
              .then(({ dir }) => useTerminal.getState().openAt(dir))
              .catch(() => {})
          }
        >
          Open in Terminal
        </button>
        <button
          type="button"
          className="button-secondary"
          title="Open the agent chat panel scoped to this client (◈) — wires stale tooling first"
          onClick={() => void chatHere()}
        >
          Chat Here
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="cp-filelink"
          onClick={() => openNote(`${info.dir}/workspace.yml`)}
        >
          workspace.yml
        </button>
      </div>
      {conns.length === 0 && info.hasWorkspaceYml && (
        <StandardToolingCard client={info.slug} onDone={() => refreshAll(true)} />
      )}
      {conns.map((conn) => {
        const probe = probes[conn.server]
        return (
          <div key={conn.server} className="cp-conn">
            <div className="cp-conn-head">
              <span className="cp-conn-name">{conn.server}</span>
              <span
                className={`cp-conn-state ${probe?.state === 'ok' ? 'ok' : probe?.state === 'fail' ? 'warn' : 'dim'}`}
              >
                {probe ? PROBE_LABEL[probe.state] : '○ Not tested'}
              </span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="button-secondary"
                disabled={probe?.state === 'testing'}
                title="Launch this connection with the stored token and verify the handshake"
                onClick={() => testConnection(conn.server)}
              >
                Test
              </button>
            </div>
            {probe?.state === 'fail' && (
              <div className="cp-conn-detail warn">
                {probe.detail} — paste a fresh token below and Save.
              </div>
            )}
            {conn.envRefs.map((ref) => {
              const missing = status?.missingRefs.includes(ref) ?? false
              const editing = missing || replacing.has(ref)
              return (
                <div key={ref} className="cp-ws-ref">
                  <span className={missing ? 'cp-ws-ref-state warn' : 'cp-ws-ref-state ok'}>
                    {missing ? '● Token needed' : '✓ Token held'}
                  </span>
                  <span className="cp-ws-conn">{ref}</span>
                  {editing ? (
                    <input
                      className="cp-ws-token-input"
                      type="password"
                      value={pasted[ref] ?? ''}
                      placeholder="Paste token"
                      onChange={(e) => setPasted({ ...pasted, [ref]: e.target.value })}
                    />
                  ) : (
                    <button
                      type="button"
                      className="button-secondary"
                      title="Paste a new token for this connection (replaces the stored one)"
                      onClick={() => setReplacing(new Set(replacing).add(ref))}
                    >
                      Replace
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {pastedReady.length > 0 && (
        <button
          type="button"
          className="button-emphasis"
          disabled={busy}
          onClick={() => void rewire(Object.fromEntries(pastedReady))}
        >
          Save token{pastedReady.length === 1 ? '' : 's'} &amp; Re-wire
        </button>
      )}
      {status?.drift && !busy && (
        <div className="cp-ws-result warn">Generated files out of date — press Re-wire.</div>
      )}
      {error && <div className="cp-ws-result warn">{error}</div>}
      {result && !error && (
        <div className="cp-ws-result">
          {result.wrote.length > 0 && <div className="ok">Wrote: {result.wrote.join(', ')}</div>}
          {result.missingEnv.length > 0 && (
            <div className="warn">
              Still missing: {result.missingEnv.map((v) => `\${${v}}`).join(', ')} — paste the
              token above.
            </div>
          )}
          {result.ok && result.wrote.length === 0 && (
            <div className="ok">Workspace up to date.</div>
          )}
        </div>
      )}
    </div>
  )
}

/** WP-C: snapshot dialog — optional note + include-tables, one Create action.
 *  ClientPage owns which unit is targeted; identity comes from the parent. */
function SnapshotModal({
  client,
  unit,
  identity,
  onClose,
  onDone,
}: {
  client: string
  unit: string
  identity: Identity | null
  onClose: () => void
  onDone: () => void
}): React.JSX.Element {
  const [note, setNote] = useState('')
  const [tables, setTables] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create(): Promise<void> {
    if (!identity) {
      setError('Set your name and email in Settings before snapshotting (commit attribution).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await invoke('clients.snapshot.create', {
        client,
        unit,
        tables,
        note: note.trim() || undefined,
        identity,
      })
      useToasts.getState().push('Snapshot created', `${r.unit} · ${r.stamp} · ${r.files.length} file(s)`)
      onDone()
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss is a mouse affordance; Cancel button + Esc-free modal
    <div className="cp-modal-backdrop" onClick={onClose}>
      <div
        className="cp-modal"
        role="dialog"
        aria-modal="true"
        // biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation guard, not an interactive control
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cp-modal-title">Snapshot {unit}</div>
        <label className="cp-modal-field">
          Note (optional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="what changed / why"
            // biome-ignore lint/a11y/noAutofocus: single-field modal
            autoFocus
          />
        </label>
        <label className="cp-modal-check">
          <input type="checkbox" checked={tables} onChange={(e) => setTables(e.target.checked)} />
          Also snapshot this client's knowledge_tables/
        </label>
        {error && <div className="cp-modal-error">{error}</div>}
        <div className="cp-modal-actions">
          <button type="button" className="button-quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="button-emphasis"
            onClick={() => void create()}
            disabled={busy}
          >
            {busy ? 'Snapshotting…' : 'Create snapshot'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Group snapshots by unit, preserving the newest-first order from the lib. */
function groupSnapshotsByUnit(snaps: SnapshotSummary[]): Array<[string, SnapshotSummary[]]> {
  const byUnit = new Map<string, SnapshotSummary[]>()
  for (const s of snaps) byUnit.set(s.unit, [...(byUnit.get(s.unit) ?? []), s])
  return [...byUnit.entries()]
}

/** WP-D: add/edit a client login. Secret is required for a new credential and
 *  optional on edit (blank = keep the existing keychain value, §5.13). */
function CredentialModal({
  client,
  existing,
  onClose,
  onDone,
}: {
  client: string
  existing: ClientCredential | null
  onClose: () => void
  onDone: () => void
}): React.JSX.Element {
  const [label, setLabel] = useState(existing?.label ?? '')
  const [username, setUsername] = useState(existing?.username ?? '')
  const [secret, setSecret] = useState('')
  const [url, setUrl] = useState(existing?.url ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(): Promise<void> {
    if (!label.trim() || !username.trim()) {
      setError('Label and username are both required.')
      return
    }
    if (!existing && !secret) {
      setError('A new credential needs a password / secret.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await invoke('clients.credentials.set', {
        client,
        ...(existing ? { id: existing.id } : {}),
        label: label.trim(),
        username: username.trim(),
        ...(secret ? { secret } : {}),
        ...(url.trim() ? { url: url.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      useToasts.getState().push(
        existing ? 'Credential updated' : 'Credential saved',
        `${label.trim()} · kept in your OS keychain, never in the dex`,
      )
      onDone()
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss is a mouse affordance
    <div className="cp-modal-backdrop" onClick={onClose}>
      <div
        className="cp-modal"
        role="dialog"
        aria-modal="true"
        // biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation guard, not a control
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cp-modal-title">{existing ? 'Edit credential' : 'Add credential'}</div>
        <label className="cp-modal-field">
          Label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Platform console"
            // biome-ignore lint/a11y/noAutofocus: first field of the modal
            autoFocus
          />
        </label>
        <label className="cp-modal-field">
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="cp-modal-field">
          Password / secret{existing ? ' (blank = keep current)' : ''}
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} />
        </label>
        <label className="cp-modal-field">
          URL (optional)
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </label>
        <label className="cp-modal-field">
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <div className="cp-modal-error">{error}</div>}
        <div className="cp-modal-actions">
          <button type="button" className="button-quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="button-emphasis"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? 'Saving…' : existing ? 'Save changes' : 'Save credential'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** WP-D: the client's stored logins — masked rows with Reveal / Copy / Edit /
 *  Delete, plus Add. Secrets live in the OS keychain, never in the dex. */
function CredentialsSection({ client }: { client: string }): React.JSX.Element {
  const [creds, setCreds] = useState<ClientCredential[]>([])
  const [refresh, setRefresh] = useState(0)
  const [editing, setEditing] = useState<ClientCredential | 'new' | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string>>({})

  useEffect(() => {
    void invoke('clients.credentials.list', { client })
      .then(setCreds)
      .catch(() => setCreds([]))
  }, [client, refresh])

  async function toggleReveal(id: string): Promise<void> {
    if (revealed[id] !== undefined) {
      setRevealed((r) => {
        const next = { ...r }
        delete next[id]
        return next
      })
      return
    }
    try {
      const { secret } = await invoke('clients.credentials.reveal', { client, id })
      setRevealed((r) => ({ ...r, [id]: secret }))
    } catch {
      // no bridge / gone — leave masked
    }
  }

  async function copySecret(id: string): Promise<void> {
    try {
      const { secret } = await invoke('clients.credentials.reveal', { client, id })
      await navigator.clipboard.writeText(secret)
      useToasts.getState().push('Password copied', 'Cleared from view — paste where you need it')
    } catch {
      // best-effort
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await invoke('clients.credentials.delete', { client, id })
      setRefresh((n) => n + 1)
    } catch {
      // best-effort
    }
  }

  return (
    <section className="cp-section">
      <div className="cp-section-title">
        Credentials
        <button type="button" className="cp-cred-add" onClick={() => setEditing('new')}>
          + Add
        </button>
      </div>
      {creds.length === 0 ? (
        <div className="cp-empty">
          No stored logins. Keep this client's platform credentials here — held in your OS keychain,
          never committed to the dex.
        </div>
      ) : (
        <div className="cp-rows">
          {creds.map((c) => (
            <div key={c.id} className="cp-cred-row">
              <span className="cp-cred-label">{c.label}</span>
              <span className="cp-cred-user">{c.username}</span>
              {c.url && <span className="cp-cred-url">{c.url}</span>}
              <span className="cp-cred-secret">{revealed[c.id] ?? '••••••••'}</span>
              <div className="cp-cred-actions">
                <button type="button" onClick={() => void toggleReveal(c.id)}>
                  {revealed[c.id] !== undefined ? 'Hide' : 'Reveal'}
                </button>
                <button type="button" onClick={() => void copySecret(c.id)}>
                  Copy
                </button>
                <button type="button" onClick={() => setEditing(c)}>
                  Edit
                </button>
                <button type="button" onClick={() => void remove(c.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing !== null && (
        <CredentialModal
          client={client}
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null)
            setRefresh((n) => n + 1)
          }}
        />
      )}
    </section>
  )
}

export function ClientPage({
  info,
  onBack,
}: {
  info: ClientInfo
  onBack: () => void
}): React.JSX.Element {
  const lints = useDex((s) => s.lints) ?? []
  const page = buildClientPage(info, lints)
  const identity = useIdentity((s) => effectiveIdentity(s))
  const oldestDays = page.inbox.oldestMs
    ? Math.floor((Date.now() - page.inbox.oldestMs) / 86_400_000)
    : 0

  // WP-C: snapshot modal target (unit name) + the Versions list
  const [snapUnit, setSnapUnit] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([])
  const [snapRefresh, setSnapRefresh] = useState(0)
  useEffect(() => {
    void invoke('clients.snapshot.list', { client: info.slug })
      .then(setSnapshots)
      .catch(() => setSnapshots([]))
  }, [info.slug, snapRefresh])

  return (
    <div
      className="client-page"
      style={{ '--section-color': sectionTint(info.slug) } as React.CSSProperties}
    >
      <style>{PAGE_CSS}</style>
      <button type="button" className="cp-back button-quiet" onClick={onBack}>
        ← All clients
      </button>
      <div className="cp-header">
        <span className="cp-dot" aria-hidden />
        <span className="cp-title">{page.header.slug}</span>
        {page.header.manager && <span className="cp-manager">manager: {page.header.manager}</span>}
        <span className="cp-tags">
          {page.header.tags.map((tag) => (
            <span key={tag} className="cp-tag">
              #{tag}
            </span>
          ))}
        </span>
      </div>
      <div className="cp-counts">
        {page.header.pipelineCount} pipeline{page.header.pipelineCount === 1 ? '' : 's'} ·{' '}
        {page.header.stageCount} stage{page.header.stageCount === 1 ? '' : 's'} ·{' '}
        {page.header.agentCount} agent{page.header.agentCount === 1 ? '' : 's'}
        {page.header.errorCount > 0 && (
          <>
            {' · '}
            <span className="cp-errors">{page.header.errorCount} schema problem(s)</span>
          </>
        )}
      </div>

      {page.inbox.count > 0 && (
        <div className="cp-attention">
          ⚠ {page.inbox.count} inbox item(s) pending consumption
          {oldestDays > 0 ? ` — oldest ${oldestDays}d` : ''}. Consume by moving each file to its
          proper home.
        </div>
      )}

      {page.pipelines.length > 0 && (
        <section className="cp-section">
          <div className="cp-section-title">Pipelines</div>
          {page.pipelines.map((unit) => (
            <Unit key={unit.name} unit={unit} onSnapshot={setSnapUnit} />
          ))}
        </section>
      )}

      {page.agents.length > 0 && (
        <section className="cp-section">
          <div className="cp-section-title">Agents</div>
          {page.agents.map((unit) => (
            <Unit key={unit.name} unit={unit} onSnapshot={setSnapUnit} />
          ))}
        </section>
      )}

      {snapshots.length > 0 && (
        <section className="cp-section">
          <div className="cp-section-title">Versions</div>
          {groupSnapshotsByUnit(snapshots).map(([unit, snaps]) => (
            <div key={unit} className="cp-versions-unit">
              <div className="cp-versions-unit-name">{unit}</div>
              <div className="cp-rows">
                {snaps.map((s) => (
                  <button
                    key={s.stamp}
                    type="button"
                    className="cp-row"
                    title={s.note ?? 'Open the snapshot manifest'}
                    onClick={() =>
                      openNote(`${info.dir}/_versions/${s.unit}/${s.stamp}/manifest.json`)
                    }
                  >
                    <span className="cp-row-type">{s.fileCount}f</span>
                    {s.stamp}
                    {s.note ? ` — ${s.note}` : ''}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="cp-section">
        <div className="cp-section-title">Knowledge tables</div>
        {page.tables.length === 0 ? (
          <div className="cp-empty">No tables — the AI has nothing to be grounded on yet.</div>
        ) : (
          <div className="cp-rows">
            {page.tables.map((t) => (
              <button key={t.path} type="button" className="cp-row" onClick={() => openNote(t.path)}>
                <span className="cp-row-type">csv</span>
                {t.name}
              </button>
            ))}
          </div>
        )}
      </section>

      {page.workflows.length > 0 && (
        <section className="cp-section">
          <div className="cp-section-title">Automation workflows</div>
          <div className="cp-rows">
            {page.workflows.map((w) => (
              <button key={w.path} type="button" className="cp-row" onClick={() => openNote(w.path)}>
                <span className="cp-row-type">json</span>
                {w.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <CredentialsSection client={info.slug} />

      <section className="cp-section">
        <div className="cp-section-title">Agent tooling</div>
        <WorkspacePanel info={info} />
      </section>

      {snapUnit !== null && (
        <SnapshotModal
          client={info.slug}
          unit={snapUnit}
          identity={identity}
          onClose={() => setSnapUnit(null)}
          onDone={() => {
            setSnapUnit(null)
            setSnapRefresh((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}
