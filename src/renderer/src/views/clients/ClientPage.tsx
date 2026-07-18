/**
 * One client's page (agent-ops epic): header w/ manager + tags + health,
 * pipelines with the ordered 01→NN stage rail, agents, knowledge tables,
 * workflows, inbox attention, and the workspace panel (generate/check via
 * clients.workspace — writes only gitignored files). Every file name is a
 * reader open target (hyperlink-everything).
 */
import { useEffect, useState } from 'react'
import type {
  ClientInfo,
  ClientWorkspaceStatus,
  WorkspaceResult,
} from '../../../../shared/ipc-contract'
import { invoke } from '../../api'
import { useApp } from '../../stores/app'
import { useDex } from '../../stores/dex'
import { useReader } from '../../stores/reader'
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
.cp-unit-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
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
.cp-ws { border: 1px solid var(--hairline); border-radius: 10px; padding: 12px 14px; background: var(--bg-card); }
.cp-ws-conn { font-family: var(--font-mono); font-size: 10px; color: var(--text-2); }
.cp-ws-row { display: flex; align-items: center; gap: 10px; }
.cp-ws-result { margin-top: 8px; font-size: 12px; color: var(--text-2); }
.cp-ws-result .ok { color: var(--ok, #2e6e5e); }
.cp-ws-result .warn { color: var(--rust, #a33f2e); }
.cp-ws-refs { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.cp-ws-ref { display: flex; align-items: center; gap: 10px; }
.cp-ws-ref-state { font-size: 11px; font-weight: 600; white-space: nowrap; }
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

function Unit({ unit }: { unit: UnitSection }): React.JSX.Element {
  return (
    <div className="cp-unit">
      <div className="cp-unit-head">
        <span className="cp-unit-name">{unit.name}</span>
        <span className="cp-unit-kind">{unit.kind}</span>
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

function WorkspacePanel({ info }: { info: ClientInfo }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<WorkspaceResult | null>(null)
  const [status, setStatus] = useState<ClientWorkspaceStatus | null>(null)
  const [pasted, setPasted] = useState<Record<string, string>>({})
  const [replacing, setReplacing] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  // v3 P7 green heartbeat (story 26.8): connected = the in-app MCP host is
  // listening — the wiring the generated .mcp.json points agents at
  const [mcp, setMcp] = useState<{ running: boolean; port: number | null } | null>(null)

  useEffect(() => {
    void invoke('mcp.status', undefined)
      .then((st) => setMcp({ running: st.state === 'running', port: st.port }))
      .catch(() => setMcp({ running: false, port: null }))
  }, [])

  const refreshStatus = (): void => {
    if (!info.hasWorkspaceYml) return
    void invoke('clients.workspace.status', { client: info.slug })
      .then(setStatus)
      .catch(() => setStatus(null))
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch per client only
  useEffect(refreshStatus, [info.slug])

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
      refreshStatus()
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  const pastedReady = Object.entries(pasted).filter(([, v]) => v.trim())
  return (
    <div className="cp-ws">
      <div className="cp-ws-row">
        <span
          className={`agent-dot${mcp?.running ? ' agent-dot-live' : ''}`}
          title={
            mcp?.running
              ? `connected — MCP host on 127.0.0.1:${mcp.port}`
              : 'MCP host not running — agents cannot connect'
          }
          aria-hidden="true"
        />
        <span className="cp-ws-conn">
          {mcp === null ? 'checking…' : mcp.running ? `connected · :${mcp.port}` : 'not connected'}
        </span>
        <button type="button" className="cp-filelink" onClick={() => openNote(`${info.dir}/workspace.yml`)}>
          workspace.yml
        </button>
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
          Re-wire
        </button>
        <button
          type="button"
          className="button-quiet"
          disabled={busy || !info.hasWorkspaceYml}
          title="Open a terminal in this client's directory — then just type claude"
          onClick={() => void invoke('clients.openTerminal', { client: info.slug }).catch(() => {})}
        >
          Open in Terminal
        </button>
      </div>
      {status && (
        <div className="cp-ws-refs">
          {status.declaredRefs.map((ref) => {
            const missing = status.missingRefs.includes(ref)
            const editing = missing || replacing.has(ref)
            return (
              <div key={ref} className="cp-ws-ref">
                <span className={missing ? 'cp-ws-ref-state warn' : 'cp-ws-ref-state ok'}>
                  {missing ? '● needs token' : '✓ token held'}
                </span>
                <span className="cp-ws-conn">{ref}</span>
                {editing ? (
                  <input
                    className="cp-ws-token-input"
                    type="password"
                    value={pasted[ref] ?? ''}
                    placeholder="paste token"
                    onChange={(e) => setPasted({ ...pasted, [ref]: e.target.value })}
                  />
                ) : (
                  // a held token can still be dead server-side (revoked/rotated)
                  <button
                    type="button"
                    className="button-quiet"
                    title="Paste a new token for this connection (replaces the stored one)"
                    onClick={() => setReplacing(new Set(replacing).add(ref))}
                  >
                    Replace
                  </button>
                )}
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
              Save token{pastedReady.length === 1 ? '' : 's'} &amp; re-wire
            </button>
          )}
          {status.drift && !busy && (
            <div className="cp-ws-result warn">generated files out of date — Re-wire</div>
          )}
        </div>
      )}
      {error && <div className="cp-ws-result warn">{error}</div>}
      {result && !error && (
        <div className="cp-ws-result">
          {result.wrote.length > 0 && <div className="ok">wrote: {result.wrote.join(', ')}</div>}
          {result.missingEnv.length > 0 && (
            <div className="warn">
              still missing: {result.missingEnv.map((v) => `\${${v}}`).join(', ')} — paste the
              token above
            </div>
          )}
          {result.ok && result.wrote.length === 0 && (
            <div className="ok">workspace up to date</div>
          )}
        </div>
      )}
    </div>
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
  const oldestDays = page.inbox.oldestMs
    ? Math.floor((Date.now() - page.inbox.oldestMs) / 86_400_000)
    : 0

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
            <Unit key={unit.name} unit={unit} />
          ))}
        </section>
      )}

      {page.agents.length > 0 && (
        <section className="cp-section">
          <div className="cp-section-title">Agents</div>
          {page.agents.map((unit) => (
            <Unit key={unit.name} unit={unit} />
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

      <section className="cp-section">
        <div className="cp-section-title">Agent tooling</div>
        <WorkspacePanel info={info} />
      </section>
    </div>
  )
}
