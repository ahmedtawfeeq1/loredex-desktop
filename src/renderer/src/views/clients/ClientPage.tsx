/**
 * One client's page (agent-ops epic): header w/ manager + tags + health,
 * pipelines with the ordered 01→NN stage rail, agents, knowledge tables,
 * workflows, inbox attention, and the workspace panel (generate/check via
 * clients.workspace — writes only gitignored files). Every file name is a
 * reader open target (hyperlink-everything).
 */
import { useEffect, useMemo, useState } from 'react'
import type {
  ClientCredential,
  ClientInfo,
  ClientWorkspaceStatus,
  CoreApi,
  InboxItem,
  SnapshotSummary,
  WorkspaceResult,
} from '../../../../shared/ipc-contract'
import type { AcpAgent } from '../../../../shared/ipc-contract'
import type { Identity } from '../../../../shared/types'
import { AGENT_META, AGENTS } from '../../agent/AgentPanel'
import { invoke, revealPath, saveExport } from '../../api'
import { Button } from '../../components/Button'
import { useApp } from '../../stores/app'
import { useDex } from '../../stores/dex'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { useAgentPanel } from '../../stores/agentPanel'
import { useReader } from '../../stores/reader'
import { useTerminal } from '../../stores/terminal'
import { useToasts } from '../../stores/toasts'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import { copyVaultPath } from '../../vaultPaths'
import { sectionTint } from '../reader/sectionTint'
import {
  buildClientPage,
  GENUDO_DEFAULT_BASE_URL,
  genudoLabel,
  genudoUrlDecision,
  genudoUrlFieldValue,
  signOutThenChangeEnvironment,
  type GenudoStatus,
  type UnitSection,
} from './client-page'

/** The IPC layer rejects with a typed ErrEnvelope, not an Error — String() on
 *  one renders the useless `[object Object]` a user cannot act on. */
function reason(e: unknown): string {
  if (isErrEnvelope(e)) return e.message
  return e instanceof Error ? e.message : String(e)
}

/**
 * Local scaffolding (+ Pipeline / + Stage / + Agent) is OFF.
 *
 * It was originally off for two reasons. The first — the lib's scaffolder wrote
 * the retired filenames — is fixed as of loredex 2.10.0: it now writes
 * `_instructions.md` and per-stage `_instructions.md` + `stage.yaml`, the same
 * names the pull and the platform's MCP use.
 *
 * The second reason is why it stays off, and it is not a bug to be fixed: the
 * PLATFORM is the source of truth. A stage that exists only on disk does not
 * exist to the agent, so the button would produce folders that look real, lint
 * clean, and change nothing about how the AI behaves. Creating a stage belongs
 * to the platform's MCP (`create_stage`), which writes upstream and re-mirrors
 * down. A button that silently does nothing useful is worse than no button.
 */
const LOCAL_SCAFFOLD_ENABLED = false

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
/* editable client metadata — the manager a client is filed under and its tags.
   Both used to be readable here and changeable only by hand-editing
   _index/*.json, which is the one thing this app exists to remove. */
.cp-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 8px 0 14px; }
.cp-meta-group { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.cp-meta-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-2); }
.cp-meta-input, .cp-meta-select {
  font: 12.5px var(--font-ui); padding: 5px 8px; min-height: 28px;
  border: 1px solid var(--hairline); border-radius: 7px;
  background: var(--bg-inset); color: var(--text-1);
}
.cp-meta-input { width: 148px; }
.cp-meta-input:focus, .cp-meta-select:focus { outline: none; border-color: var(--accent-hi); }
.cp-meta-btn {
  font: 600 12px var(--font-ui); padding: 5px 12px; min-height: 28px;
  border: 1px solid var(--hairline); border-radius: 7px;
  background: var(--bg-card); color: var(--text-1); cursor: pointer;
}
.cp-meta-btn:hover:not(:disabled) { border-color: var(--accent-hi); }
.cp-meta-btn:disabled { opacity: 0.45; cursor: default; }
.cp-tag-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-1); border: 1px solid var(--hairline); border-radius: 12px; padding: 3px 6px 3px 10px; }
.cp-tag-remove { font: 13px var(--font-ui); line-height: 1; color: var(--text-2); background: none; border: 0; border-radius: 50%; width: 18px; height: 18px; cursor: pointer; }
.cp-tag-remove:hover { color: var(--rust-text); background: var(--bg-inset); }
.cp-meta-none { font-size: 12.5px; color: var(--text-3); }
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
.cp-filelink.is-absent { opacity: 0.42; cursor: default; border-style: dashed; }
.cp-filelink.is-absent:hover { color: var(--text-2); border-color: var(--hairline); }
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
.cp-inbox-head { font-weight: 600; margin-bottom: 6px; }
.cp-chat-pick { display: inline-flex; align-items: center; gap: 6px; }
.cp-chat-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 5px; }
.cp-chat-dot.tone-ok { background: var(--ok); }
.cp-chat-dot.tone-auth_required { background: var(--warn); }
.cp-chat-dot.tone-unknown { background: var(--text-3); }
.cp-seg { display: flex; align-items: center; gap: 6px; }
.cp-seg-btn { font-size: 12px; color: var(--text-2); border: 1px solid var(--hairline); border-radius: 6px; padding: 3px 10px; cursor: pointer; }
.cp-seg-btn.is-on { color: var(--text-1); border-color: var(--accent-hi); background: var(--bg-inset); }
.cp-seg-btn:disabled { opacity: 0.4; cursor: default; }
.cp-seg-anchor { font-size: 12px; padding: 3px 6px; border: 1px solid var(--hairline); border-radius: 6px; background: var(--bg-inset); color: var(--text-1); }
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
.cp-conn-scope { font-family: var(--font-mono); font-size: 10px; color: var(--text-2); border: 1px solid var(--hairline); border-radius: 4px; padding: 0 5px; }
.cp-conn-chip { font-size: 11px; font-weight: 650; border-radius: 999px; padding: 1px 9px; border: 1px solid; }
.cp-conn-chip.is-ok { color: var(--ok, #2e6e5e); border-color: var(--ok, #2e6e5e); background: color-mix(in srgb, var(--ok, #2e6e5e) 12%, transparent); }
.cp-conn-chip.is-fail { color: var(--rust, #a33f2e); border-color: var(--rust, #a33f2e); background: color-mix(in srgb, var(--rust, #a33f2e) 12%, transparent); }
.cp-conn-chip.is-testing, .cp-conn-chip.is-untested { color: var(--text-2); border-color: var(--hairline); }
.cp-conn-tools-toggle { margin-top: 8px; font-size: 11.5px; font-weight: 600; color: var(--text-2); cursor: pointer; }
.cp-conn-tools-toggle:hover { color: var(--text-1); }
.cp-conn-tools { list-style: none; margin: 6px 0 0; padding: 0 0 0 12px; display: flex; flex-wrap: wrap; gap: 5px; border-left: 2px solid var(--hairline); }
.cp-conn-tools li { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-2); border: 1px solid var(--hairline); border-radius: 4px; padding: 1px 6px; }
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
  onAddStage,
}: {
  unit: UnitSection
  onSnapshot: (name: string) => void
  onAddStage: (pipeline: string) => void
}): React.JSX.Element {
  return (
    <div className="cp-unit">
      <div className="cp-unit-head">
        <span className="cp-unit-name">{unit.name}</span>
        <span className="cp-unit-kind">{unit.kind}</span>
        <span style={{ flex: 1 }} />
        {unit.kind === 'pipeline' && LOCAL_SCAFFOLD_ENABLED && (
          <button
            type="button"
            className="cp-unit-snapshot"
            title="Add a stage to this pipeline (renumbers if inserted)"
            onClick={() => onAddStage(unit.name)}
          >
            + Stage
          </button>
        )}
        <button
          type="button"
          className="cp-unit-snapshot"
          title="Capture this unit's whole definition into versions/vNN (committed)"
          onClick={() => onSnapshot(unit.name)}
        >
          ⧉ Snapshot
        </button>
      </div>
      <div className="cp-unit-files">
        {/* A pipeline with no actions is normal, not broken. Absent files render
            as disabled rather than as a link into "this note was removed". */}
        {unit.files.map((f) =>
          f.present ? (
            <button
              key={f.label}
              type="button"
              className="cp-filelink"
              onClick={() => openNote(f.path)}
            >
              {f.label}
            </button>
          ) : (
            <span
              key={f.label}
              className="cp-filelink is-absent"
              title={`No ${f.label} for this ${unit.kind} — nothing to open`}
            >
              {f.label}
            </span>
          ),
        )}
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
                title={
                  stage.broken
                    ? 'No stage.yaml — see problems below'
                    : stage.hasInstructions
                      ? undefined
                      : 'No instructions of its own — inherits the pipeline. Opens stage.yaml.'
                }
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

type ProbeState = { state: 'testing' | 'ok' | 'fail'; detail: string; tools?: string[] }

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

/**
 * The shell BOTH platform connections render in — same layout, same green chip,
 * same tools disclosure. They are the same kind of thing (an MCP server for this
 * client) and looked like two different features while one was a bordered card
 * and the other was loose text.
 */
function ConnCard({
  name,
  source,
  state,
  detail,
  tools,
  onTest,
  testing,
  children,
}: {
  name: string
  /** WHERE this server comes from — the thing that decides whether Re-wire
   *  touches it. Both servers are already scoped to this client, so a
   *  "this client only" chip on one of them read as if the other were global. */
  source: 'workspace.yml' | 'keychain'
  state: 'ok' | 'fail' | 'testing' | 'untested'
  detail?: string
  tools: string[]
  onTest: () => void
  testing: boolean
  /** the token row(s), which differ per platform */
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const LABEL: Record<typeof state, string> = {
    ok: '✓ Connected',
    fail: '✗ Failed',
    testing: '◌ Testing…',
    untested: '○ Not tested',
  }
  return (
    <div className="cp-conn">
      <div className="cp-conn-head">
        <span className="cp-conn-name">{name}</span>
        {/* a CHIP, not coloured text — status is glyph + label on a surface, so
            it reads as state rather than as emphasis (§4) */}
        <span className={`cp-conn-chip is-${state}`}>{LABEL[state]}</span>
        <span
          className="cp-conn-scope"
          title={
            source === 'workspace.yml'
              ? 'Declared in this client’s workspace.yml — Re-wire regenerates its .mcp.json'
              : 'Injected by loredex from your OS keychain — into this app’s chats and into the generated .mcp.json, so terminal agents get it too'
          }
        >
          {source === 'workspace.yml' ? 'workspace.yml' : 'keychain · injected'}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="button-secondary"
          disabled={testing}
          title="Real MCP handshake with the stored token — green means an agent would get these tools"
          onClick={onTest}
        >
          {testing ? 'Testing…' : 'Test'}
        </button>
      </div>
      {detail && <div className={`cp-conn-detail ${state === 'fail' ? 'warn' : ''}`}>{detail}</div>}
      {children}
      {tools.length > 0 && (
        <>
          <button
            type="button"
            className="cp-conn-tools-toggle"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? '▾' : '▸'} {tools.length} tools
          </button>
          {open && (
            <ul className="cp-conn-tools">
              {tools.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function WorkspacePanel({ info }: { info: ClientInfo }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<WorkspaceResult | null>(null)
  const [status, setStatus] = useState<ClientWorkspaceStatus | null>(null)
  // BL-6: Chat Here asks which provider instead of silently using the panel's
  const [chatPick, setChatPick] = useState(false)
  const [pulling, setPulling] = useState(false)
  const identity = useIdentity((s) => effectiveIdentity(s))
  const providerAuth = useAgentPanel((s) => s.providerAuth)
  // widened past {server, envRefs} (Task 7): the genudo row needs its own
  // `url` to seed the environment field — a stdio connection has no `url` at
  // all, so every read below narrows with `'url' in conn` first.
  const [conns, setConns] = useState<CoreApi['clients.connections']['out']>([])
  // per-connection LIVE probe — the only honest "Connected": a held token can
  // still be revoked server-side, so green must mean a real handshake passed
  const [probes, setProbes] = useState<Record<string, ProbeState>>({})
  const [pasted, setPasted] = useState<Record<string, string>>({})
  const [replacing, setReplacing] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  // Task 7: sign-in control + the per-client environment override.
  const [genudo, setGenudo] = useState<GenudoStatus | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [urlEditing, setUrlEditing] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  // set only when Save needs the warn-and-offer-sign-out step; the payload it
  // carries is what commitUrl sends once the user confirms (or signs out first)
  const [urlConfirm, setUrlConfirm] = useState<{ payload: string | null } | null>(null)

  const testConnection = (server: string): void => {
    setProbes((p) => ({ ...p, [server]: { state: 'testing', detail: '' } }))
    void invoke('clients.connections.test', { client: info.slug, server })
      .then((r) =>
        setProbes((p) => ({
          ...p,
          [server]: { state: r.ok ? 'ok' : 'fail', detail: r.detail, tools: r.tools },
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
    // Task 7: never a token, never a secret — signedIn/account/expiresAt only.
    void invoke('clients.genudo.status', { client: info.slug })
      .then(setGenudo)
      .catch(() => setGenudo(null))
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

  // Task 7: commit the environment field. Reuses the same result/error state
  // Re-wire does — this is the same kind of workspace.yml write, just of the
  // `url` instead of a token. `identity` is required by the IPC contract; the
  // Change button below is disabled without one, so this is belt-and-braces.
  async function commitUrl(payload: string | null): Promise<void> {
    if (!identity) return
    setUrlBusy(true)
    setError(null)
    try {
      setResult(
        await invoke('clients.genudo.setBaseUrl', { client: info.slug, baseUrl: payload, identity }),
      )
      setUrlEditing(false)
      setUrlConfirm(null)
      refreshAll(true)
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e))
    } finally {
      setUrlBusy(false)
    }
  }

  // WP-A: open the agent chat panel in THIS client's folder (◈ scoped session).
  // Materialize stale/absent tooling first so the client's own MCP servers
  // attach to the session, then start the chat at the client dir.
  // BL-6: the provider is chosen explicitly rather than inheriting whatever the
  // panel happened to be set to (which silently meant Claude).
  async function chatHere(provider: AcpAgent): Promise<void> {
    setChatPick(false)
    try {
      if (info.hasWorkspaceYml && status && (status.drift || !status.generated)) {
        await rewire({})
      }
      const { dir } = await invoke('clients.dirAbs', { client: info.slug })
      await useAgentPanel.getState().openHere(dir, provider)
    } catch (e) {
      // BL-20: rewire/dirAbs failing here used to be silent too, so a failed
      // Chat Here just collapsed the picker. openHere reports its own failures.
      useToasts
        .getState()
        .push('Could not start the chat', reason(e))
    }
  }

  const pastedReady = Object.entries(pasted).filter(([, v]) => v.trim())
  // Task 7: computed once, not per-connection-row — "Sign out" is the only
  // action string that means an ACTIVE session (genudo.signedIn alone is not
  // enough: an EXPIRED session still has signedIn: true, but the label reads
  // "Sign in again", the same primary-CTA case as never having signed in).
  const genudoStatusLabel = genudo ? genudoLabel(genudo) : null
  const genudoActive = genudoStatusLabel?.action === 'Sign out'
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
              ? "Regenerate .mcp.json / .claude settings / AGENTS.md from workspace.yml with this machine's stored tokens (gitignored files only). genudo-old-platform is added from the keychain in the same pass."
              : 'No workspace.yml in this client'
          }
          onClick={() => void rewire({})}
        >
          {status?.generated ? 'Re-wire' : 'Wire'}
        </button>
        {/* WP-PULL: the vault's pipeline folders were empty scaffolding until this
            existed — the real config only ever lived on the platform. */}
        <button
          type="button"
          className="button-emphasis"
          disabled={pulling || !identity}
          title={
            identity
              ? "Pull this client's live pipelines, stages and actions from genudo into the vault"
              : 'Pulling needs an identity — set name and email in Settings'
          }
          onClick={() => {
            if (!identity) return
            setPulling(true)
            void invoke('clients.pull', { client: info.slug, identity })
              .then((r) => {
                const stages = r.pipelines.reduce((n, p) => n + p.stages, 0)
                useToasts
                  .getState()
                  .push(
                    `Pulled ${info.slug}`,
                    `${r.pipelines.length} pipeline${r.pipelines.length === 1 ? '' : 's'}, ${stages} stages, ${r.files.length} files`,
                  )
              })
              .catch((e: unknown) =>
                useToasts
                  .getState()
                  .push('Pull failed', reason(e)),
              )
              .finally(() => setPulling(false))
          }}
        >
          {pulling ? 'Pulling…' : 'Pull from genudo'}
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
        {chatPick ? (
          // BL-6: pick the provider explicitly; the auth dot mirrors the panel's
          // provider chips so an unauthenticated agent is obvious before it
          // fails to spawn.
          <span className="cp-chat-pick" role="group" aria-label="Start chat in which agent">
            {AGENTS.map((a) => (
              <button
                key={a}
                type="button"
                className="button-secondary"
                title={`Chat here in ${AGENT_META[a].label}${
                  providerAuth[a] === 'auth_required' ? ' (needs sign-in)' : ''
                }`}
                onClick={() => void chatHere(a)}
              >
                <span className={`cp-chat-dot tone-${providerAuth[a]}`} aria-hidden />
                {AGENT_META[a].label}
              </button>
            ))}
            <button
              type="button"
              className="button-quiet"
              title="Cancel"
              aria-label="Cancel"
              onClick={() => setChatPick(false)}
            >
              ×
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="button-secondary"
            title="Open the agent chat panel scoped to this client (◈) — wires stale tooling first"
            onClick={() => setChatPick(true)}
          >
            Chat Here
          </button>
        )}
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
        const state =
          probe?.state === 'ok'
            ? 'ok'
            : probe?.state === 'fail'
              ? 'fail'
              : probe?.state === 'testing'
                ? 'testing'
                : 'untested'
        return (
          <ConnCard
            key={conn.server}
            name={conn.server}
            source="workspace.yml"
            state={state}
            testing={probe?.state === 'testing'}
            onTest={() => testConnection(conn.server)}
            tools={probe?.tools ?? []}
            detail={
              probe?.state === 'fail'
                ? // only suggest the token when the failure is actually about
                  // auth — this used to be appended to EVERY failure, sending
                  // people to re-paste a working credential while the real
                  // problem was Node not being on PATH.
                  probe.detail +
                  (/auth failed|401|unauthor|invalid token|forbidden/i.test(probe.detail)
                    ? ' — paste a fresh token below and Save.'
                    : '')
                : undefined
            }
          >
            {/* Task 7: sign-in control. The host comes from THIS connection's
                own declared host (server-side, via genudoBaseUrl — both the
                http shape's url and a still-stdio shape's own
                GENUDO_BASE_URL) — a client pointed at staging runs
                discovery/DCR/the token exchange against staging, not
                silently against production. */}
            {conn.server === 'genudo' && genudo && genudoStatusLabel && (
              <div className="cp-ws-ref">
                <span className={genudoActive ? 'cp-ws-ref-state ok' : 'cp-ws-ref-state warn'}>
                  {genudoActive ? '✓ ' : '● '}
                  {genudoStatusLabel.text}
                </span>
                <Button
                  variant={genudoActive ? 'secondary' : 'primary'}
                  disabled={signingIn}
                  onClick={() => {
                    // captured once, up front — genudoActive itself must not
                    // change mid-flight (nothing refreshes `genudo` until this
                    // resolves), but capturing makes that explicit rather than
                    // relying on it
                    const signingOut = genudoActive
                    setSigningIn(true)
                    void invoke(signingOut ? 'clients.genudo.signOut' : 'clients.genudo.signIn', {
                      client: info.slug,
                    })
                      .then(() => {
                        setSigningIn(false)
                        refreshAll(true)
                      })
                      .catch((e) => {
                        setSigningIn(false)
                        useToasts
                          .getState()
                          .push(signingOut ? 'Genudo sign-out failed' : 'Genudo sign-in failed', reason(e))
                      })
                  }}
                >
                  {signingIn
                    ? genudoActive
                      ? 'Signing out…'
                      : 'Waiting for the browser…'
                    : genudoStatusLabel.action}
                </Button>
              </div>
            )}
            {/* Task 7: the environment override. Both shapes: an already-http
                connection's `url:` line, or a still-stdio (unmigrated)
                connection's own `GENUDO_BASE_URL:` — the fleet migration is
                dry-by-default and has not touched the fleet yet, so gating
                this on the http shape would leave the field permanently
                unsettable for most real clients. Editable value seeds on
                entering edit mode (not kept in sync live) so a background
                refresh mid-edit can never stomp on what the user is typing. */}
            {conn.server === 'genudo' &&
              (() => {
                const currentUrl = 'url' in conn ? conn.url : conn.env.GENUDO_BASE_URL
                return (
                  <div className="cp-ws-ref">
                    <span className="cp-ws-ref-state">Environment</span>
                    <span className="cp-ws-conn">
                      {genudoUrlFieldValue(currentUrl) || 'production (default)'}
                    </span>
                    {urlEditing ? (
                      <>
                        <input
                          className="cp-ws-token-input"
                          type="text"
                          value={urlInput}
                          placeholder={GENUDO_DEFAULT_BASE_URL}
                          onChange={(e) => setUrlInput(e.target.value)}
                        />
                        <Button
                          variant="secondary"
                          disabled={urlBusy}
                          onClick={() => {
                            const decision = genudoUrlDecision(
                              urlInput,
                              currentUrl,
                              genudo?.signedIn ?? false,
                            )
                            if (!decision.changed) {
                              setUrlEditing(false)
                              return
                            }
                            if (decision.warn) {
                              setUrlConfirm({ payload: decision.payload })
                              return
                            }
                            void commitUrl(decision.payload)
                          }}
                        >
                          Save
                        </Button>
                        <Button variant="quiet" disabled={urlBusy} onClick={() => setUrlEditing(false)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={!identity}
                        title={
                          identity
                            ? 'Point this client at a different Genudo host — must be set before Sign in, since that host is where sign-in registers'
                            : 'Changing the environment needs an identity — set name and email in Settings'
                        }
                        onClick={() => {
                          setUrlInput(genudoUrlFieldValue(currentUrl))
                          setUrlEditing(true)
                        }}
                      >
                        Change environment
                      </Button>
                    )}
                  </div>
                )
              })()}
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
          </ConnCard>
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
      {/* Task 7: the environment is where OAuth discovery/DCR/the token
          exchange run — a stored session belongs to whichever host it was
          issued against, so pointing the client somewhere else without
          signing out first leaves it holding a token the new host will
          reject (a silent 401, no obvious cause). */}
      {urlConfirm && genudo && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss is a mouse affordance; Cancel button + Esc-free modal
        <div className="cp-modal-backdrop" onClick={() => setUrlConfirm(null)}>
          <div
            className="cp-modal"
            role="dialog"
            aria-modal="true"
            // biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation guard, not an interactive control
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cp-modal-title">Change Genudo environment?</div>
            {/* "has a Genudo session for" rather than "is signed in to" — this
                modal also opens for an EXPIRED session (warn deliberately
                derives from the raw signedIn flag, not the "is it actually
                usable" label, since an expired session still holds a token
                tied to the old host), and "is signed in" would be a false
                claim in that case. */}
            <div className="cp-modal-field">
              {info.slug} has a Genudo session for the current environment
              {genudo.account ? ` (${genudo.account})` : ''}. Changing the host leaves that session
              holding a token the new host will reject, which shows up later as an unexplained
              sign-in failure. Sign out now, then sign back in once you're ready.
            </div>
            <div className="cp-modal-actions">
              <Button variant="secondary" disabled={urlBusy} onClick={() => setUrlConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={urlBusy}
                onClick={() => {
                  const payload = urlConfirm.payload
                  setUrlBusy(true)
                  // Review finding (2026-07-29): was `.catch(toast).then(commit)`,
                  // which commits UNCONDITIONALLY (a non-rethrowing .catch
                  // resolves the chain) — a failed sign-out still changed the
                  // environment, leaving the client holding a token minted at
                  // the OLD host. signOutThenChangeEnvironment only commits
                  // once sign-out genuinely succeeded.
                  void signOutThenChangeEnvironment(
                    () => invoke('clients.genudo.signOut', { client: info.slug }),
                    () => commitUrl(payload),
                    (e) => {
                      setUrlBusy(false)
                      useToasts.getState().push('Sign-out failed', reason(e))
                    },
                  )
                }}
              >
                Sign out and change
              </Button>
            </div>
          </div>
        </div>
      )}
      <OldPlatformConnection client={info.slug} />
    </div>
  )
}

/**
 * The OLD genudo platform, for a client mid-migration — a second connection
 * beside the new-platform one, with its own token and its own Test.
 *
 * It is NOT part of workspace.yml and deliberately so: that schema models stdio
 * servers only (`command`/`args`/`env`), and the old platform is remote HTTP
 * with a Bearer header. loredex injects it at spawn for THIS client's sessions,
 * so the token stays in the OS keychain instead of being expanded into a
 * `.mcp.json` inside the vault. Other clients' sessions never see it.
 */
function OldPlatformConnection({ client }: { client: string }): React.JSX.Element {
  const [state, setState] = useState<{ hasToken: boolean; url: string } | null>(null)
  const [token, setToken] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [probe, setProbe] = useState<{ ok: boolean; detail: string; tools: string[] } | null>(null)

  const refresh = (): void => {
    void invoke('clients.oldPlatform.get', { client })
      .then(setState)
      .catch(() => setState(null))
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload per client
  useEffect(refresh, [client])

  async function save(): Promise<void> {
    setBusy(true)
    try {
      await invoke('clients.oldPlatform.set', { client, token: token.trim() })
      setToken('')
      setEditing(false)
      refresh()
      // saving is not working — verify at once, as every other credential here
      setProbe(await invoke('clients.oldPlatform.test', { client }))
    } catch (e) {
      setProbe({ ok: false, detail: reason(e), tools: [] })
    }
    setBusy(false)
  }

  const showField = editing || state?.hasToken === false

  return (
    <ConnCard
      name="genudo-old-platform"
      source="keychain"
      state={probe ? (probe.ok ? 'ok' : 'fail') : 'untested'}
      testing={busy}
      tools={probe?.tools ?? []}
      // failures only, exactly like the new-platform card: the chip and the
      // tools toggle already say "connected", and repeating it as a detail line
      // was the visible difference between the two cards
      detail={probe && !probe.ok ? probe.detail : undefined}
      onTest={() => {
        setBusy(true)
        void invoke('clients.oldPlatform.test', { client })
          .then(setProbe)
          .catch((e) => setProbe({ ok: false, detail: reason(e), tools: [] }))
          .finally(() => setBusy(false))
      }}
    >
      <div className="cp-ws-ref">
        <span className={state?.hasToken ? 'cp-ws-ref-state ok' : 'cp-ws-ref-state warn'}>
          {state?.hasToken ? '✓ Token held' : '● Token needed'}
        </span>
        <span className="cp-ws-conn">{state?.url ?? ''}</span>
        {showField ? (
          <>
            <input
              className="cp-ws-token-input"
              type="password"
              placeholder="Paste the old-platform token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button
              type="button"
              className="button-secondary"
              disabled={busy || !token.trim()}
              onClick={() => void save()}
            >
              Save
            </button>
            {state?.hasToken && (
              <button type="button" className="button-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            className="button-secondary"
            title="Paste a new token (replaces the stored one)"
            onClick={() => setEditing(true)}
          >
            Replace
          </button>
        )}
      </div>
    </ConnCard>
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

/** WP-G: create a new pipeline or agent (just a name → one scaffold commit). */
function NewUnitModal({
  client,
  kind,
  identity,
  onClose,
  onDone,
}: {
  client: string
  kind: 'pipeline' | 'agent'
  identity: Identity | null
  onClose: () => void
  onDone: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create(): Promise<void> {
    if (!identity) {
      setError('Set your name and email in Settings first (commit attribution).')
      return
    }
    if (!name.trim()) {
      setError('Give it a name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await invoke(kind === 'pipeline' ? 'clients.scaffold.pipeline' : 'clients.scaffold.agent', {
        client,
        name: name.trim(),
        identity,
      })
      useToasts.getState().push(`${kind === 'pipeline' ? 'Pipeline' : 'Agent'} created`, name.trim())
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
        // biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation guard
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cp-modal-title">New {kind}</div>
        <label className="cp-modal-field">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'pipeline' ? 'e.g. lead reactivation' : 'e.g. front desk'}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
            // biome-ignore lint/a11y/noAutofocus: single-field modal
            autoFocus
          />
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
            {busy ? 'Creating…' : `Create ${kind}`}
          </button>
        </div>
      </div>
    </div>
  )
}

/** WP-G: add a stage — name + where (End / Before NN / After NN, seeded from the
 *  pipeline's current stages). Inserting renumbers the later stages. */
function NewStageModal({
  client,
  pipeline,
  stages,
  identity,
  onClose,
  onDone,
}: {
  client: string
  pipeline: string
  stages: string[] // existing NN values, in order
  identity: Identity | null
  onClose: () => void
  onDone: () => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [where, setWhere] = useState<'end' | 'before' | 'after'>('end')
  const [anchor, setAnchor] = useState(stages[0] ?? '01')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create(): Promise<void> {
    if (!identity) {
      setError('Set your name and email in Settings first.')
      return
    }
    if (!name.trim()) {
      setError('Give the stage a name.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await invoke('clients.scaffold.stage', {
        client,
        pipeline,
        name: name.trim(),
        ...(where === 'before' ? { before: anchor } : {}),
        ...(where === 'after' ? { after: anchor } : {}),
        identity,
      })
      const moved = r.renumbered.length
      useToasts.getState().push('Stage added', moved > 0 ? `${name.trim()} · renumbered ${moved} stage(s)` : name.trim())
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
        // biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation guard
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cp-modal-title">New stage in {pipeline}</div>
        <label className="cp-modal-field">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. qualify"
            // biome-ignore lint/a11y/noAutofocus: first field
            autoFocus
          />
        </label>
        <div className="cp-modal-field">
          Where
          <div className="cp-seg">
            {(['end', 'before', 'after'] as const).map((w) => (
              <button
                key={w}
                type="button"
                className={where === w ? 'cp-seg-btn is-on' : 'cp-seg-btn'}
                onClick={() => setWhere(w)}
                disabled={w !== 'end' && stages.length === 0}
              >
                {w === 'end' ? 'At end' : w === 'before' ? 'Before' : 'After'}
              </button>
            ))}
            {where !== 'end' && stages.length > 0 && (
              <select
                className="cp-seg-anchor"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value)}
              >
                {stages.map((nn) => (
                  <option key={nn} value={nn}>
                    {nn}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
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
            {busy ? 'Adding…' : 'Add stage'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** WP-G: the client's intake queue — each item consumed by moving it to
 *  _randoms/ or deleting it (one commit each; the tree/badge auto-refresh). */
function InboxPanel({
  client,
  identity,
}: {
  client: string
  identity: Identity | null
}): React.JSX.Element | null {
  const [items, setItems] = useState<InboxItem[]>([])
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    void invoke('clients.inbox.list', { client })
      .then(setItems)
      .catch(() => setItems([]))
  }, [client, refresh])

  async function act(
    channel: 'clients.inbox.toRandoms' | 'clients.inbox.delete',
    name: string,
  ): Promise<void> {
    if (!identity) return
    try {
      await invoke(channel, { client, name, identity })
      setRefresh((n) => n + 1)
    } catch {
      // best-effort
    }
  }

  if (items.length === 0) return null
  return (
    <div className="cp-attention">
      <div className="cp-inbox-head">
        ⚠ {items.length} inbox item(s) pending consumption
      </div>
      <div className="cp-rows">
        {items.map((it) => (
          <div key={it.rel} className="cp-cred-row">
            <span className="cp-cred-label">{it.name}</span>
            <div className="cp-cred-actions">
              <button
                type="button"
                onClick={() => openNote(it.rel)}
                title="Open this intake file"
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => copyVaultPath(it.rel)}
                title="Copy this file's absolute path — paste it to an agent or a terminal"
              >
                Copy path
              </button>
              <button type="button" onClick={() => void act('clients.inbox.toRandoms', it.name)}>
                Keep → randoms
              </button>
              <button type="button" onClick={() => void act('clients.inbox.delete', it.name)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const NEW_MANAGER = ' new' // sentinel option — never a real manager name

/**
 * Manager assignment + tag editing, on the client page (reported: the fleet
 * groups by manager and shows tag chips, but neither could be changed anywhere
 * in the app). Writes go straight through — a Save button guarding a
 * one-field change is ceremony; the vault.changed event re-reads the fleet, so
 * the grouping on the Clients view moves with it.
 *
 * Both fields ACCEPT NEW VALUES: picking "New manager…" or typing an unseen tag
 * creates it. There is no separate manager-creation screen because a manager is
 * nothing but a key in products.json.
 */
function ClientMeta({
  info,
  identity,
}: {
  info: ClientInfo
  identity: Identity | null
}): React.JSX.Element {
  // suggestions come from the FLEET the store already holds — every manager and
  // every tag in the dex is in it. An IPC call for this was worse than useless:
  // it duplicated data the renderer had, and when the core host was a version
  // behind it failed silently and the picker offered nothing.
  const fleet = useDex((s) => s.fleet) ?? []
  const vocab = useMemo(() => {
    const managers = new Set<string>()
    const tags = new Set<string>()
    for (const c of fleet) {
      if (c.manager) managers.add(c.manager)
      for (const t of c.tags) tags.add(t)
    }
    const sorted = (s: Set<string>): string[] => [...s].sort((a, b) => a.localeCompare(b))
    return { managers: sorted(managers), tags: sorted(tags) }
  }, [fleet])
  const [busy, setBusy] = useState(false)
  const [naming, setNaming] = useState(false) // "New manager…" chosen
  const [managerDraft, setManagerDraft] = useState('')
  const [tagDraft, setTagDraft] = useState('')

  const blocked = identity === null
  const blockedWhy = blocked ? 'Set your name and email in Settings first' : undefined

  async function saveManager(manager: string | null): Promise<void> {
    if (!identity || busy) return
    setBusy(true)
    try {
      await invoke('clients.manager.set', { client: info.slug, manager, identity })
      setNaming(false)
      setManagerDraft('')
    } catch (e) {
      useToasts.getState().push('Could not assign manager', reason(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveTags(tags: string[]): Promise<void> {
    if (!identity || busy) return
    setBusy(true)
    try {
      await invoke('clients.tags.set', { client: info.slug, tags, identity })
      setTagDraft('')
    } catch (e) {
      useToasts.getState().push('Could not save tags', reason(e))
    } finally {
      setBusy(false)
    }
  }

  const addTag = (): void => {
    const tag = tagDraft.trim().replace(/^#/, '')
    if (!tag || info.tags.includes(tag)) {
      setTagDraft('')
      return
    }
    void saveTags([...info.tags, tag])
  }

  return (
    <div className="cp-meta">
      <div className="cp-meta-group">
        <span className="cp-meta-label">Manager</span>
        {naming ? (
          <>
            <input
              className="cp-meta-input"
              autoFocus
              placeholder="Manager name"
              value={managerDraft}
              onChange={(e) => setManagerDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && managerDraft.trim()) void saveManager(managerDraft)
                if (e.key === 'Escape') setNaming(false)
              }}
            />
            <button
              type="button"
              className="cp-meta-btn"
              disabled={busy || !managerDraft.trim()}
              onClick={() => void saveManager(managerDraft)}
            >
              Assign
            </button>
            <button type="button" className="cp-meta-btn" onClick={() => setNaming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <select
            className="cp-meta-select"
            value={info.manager ?? ''}
            disabled={busy || blocked}
            title={blockedWhy}
            onChange={(e) => {
              const v = e.target.value
              if (v === NEW_MANAGER) {
                setNaming(true)
                return
              }
              void saveManager(v === '' ? null : v)
            }}
          >
            <option value="">Unassigned</option>
            {vocab.managers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            {info.manager && !vocab.managers.includes(info.manager) && (
              <option value={info.manager}>{info.manager}</option>
            )}
            <option value={NEW_MANAGER}>New manager…</option>
          </select>
        )}
      </div>

      <div className="cp-meta-group">
        <span className="cp-meta-label">Tags</span>
        {info.tags.length === 0 && <span className="cp-meta-none">None yet</span>}
        {info.tags.map((tag) => (
          <span key={tag} className="cp-tag-chip">
            #{tag}
            <button
              type="button"
              className="cp-tag-remove"
              aria-label={`Remove tag ${tag}`}
              title={blockedWhy ?? `Remove #${tag}`}
              disabled={busy || blocked}
              onClick={() => void saveTags(info.tags.filter((t) => t !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="cp-meta-input"
          list={`cp-tags-${info.slug}`}
          placeholder="Add tag"
          value={tagDraft}
          disabled={busy || blocked}
          title={blockedWhy}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addTag()
            if (e.key === 'Escape') setTagDraft('')
          }}
          // a typed tag left behind on click-away reads as saved and is not —
          // blur commits it. Clicking Add fires blur first; the second call is
          // a no-op (the write is in flight, and the tag is already in the set)
          onBlur={addTag}
        />
        {/* the dex's existing tags — typing a new one is still allowed, which is
            how a tag is created */}
        <datalist id={`cp-tags-${info.slug}`}>
          {vocab.tags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button
          type="button"
          className="cp-meta-btn"
          disabled={busy || blocked || !tagDraft.trim()}
          title={blockedWhy}
          onClick={addTag}
        >
          Add
        </button>
      </div>
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
  const identity = useIdentity((s) => effectiveIdentity(s))

  // WP-C: snapshot modal target (unit name) + the Versions list
  const [snapUnit, setSnapUnit] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([])
  const [snapRefresh, setSnapRefresh] = useState(0)
  useEffect(() => {
    void invoke('clients.snapshot.list', { client: info.slug })
      .then(setSnapshots)
      .catch(() => setSnapshots([]))
  }, [info.slug, snapRefresh])

  // Knowledge-base → Excel. Core builds the workbook; the native save panel
  // decides where it lands, so nothing is written until the user picks a spot.
  const [exportingKb, setExportingKb] = useState(false)
  async function exportKb(): Promise<void> {
    setExportingKb(true)
    try {
      const r = await invoke('clients.kb.export', { client: info.slug })
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0))
      const saved = await saveExport(r.filename, bytes.buffer as ArrayBuffer)
      if (!saved) return // cancelled — not an error, and not worth a toast
      const rows = r.tables.reduce((n, t) => n + t.rows, 0)
      useToasts
        .getState()
        .push(
          'Knowledge base exported',
          `${r.tables.length} table${r.tables.length === 1 ? '' : 's'} · ${rows} row${rows === 1 ? '' : 's'}${
            r.skipped.length > 0 ? ` · skipped ${r.skipped.map((s) => s.name).join(', ')}` : ''
          }`,
        )
    } catch (e) {
      useToasts.getState().push('Export failed', reason(e))
    } finally {
      setExportingKb(false)
    }
  }

  // WP-G: new-pipeline/agent modal + new-stage modal (pipeline it targets)
  const [newUnit, setNewUnit] = useState<'pipeline' | 'agent' | null>(null)
  const [stageFor, setStageFor] = useState<string | null>(null)
  const stagesOf = (pipeline: string): string[] =>
    page.pipelines.find((p) => p.name === pipeline)?.stages.map((s) => s.nn) ?? []

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
      </div>
      {/* manager + tags are EDITED here (they used to be read-only labels) */}
      <ClientMeta info={info} identity={identity} />
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

      {/* WP-G: the inbox queue with per-item consume actions (self-hides when empty) */}
      <InboxPanel client={info.slug} identity={identity} />

      {/* WP-G: headers always render so an empty client can create its first unit */}
      <section className="cp-section">
        <div className="cp-section-title">
          Pipelines
          {LOCAL_SCAFFOLD_ENABLED && (<button type="button" className="cp-cred-add" onClick={() => setNewUnit('pipeline')}>
            + Pipeline
          </button>)}
        </div>
        {page.pipelines.length === 0 ? (
          <div className="cp-empty">No pipelines yet.</div>
        ) : (
          page.pipelines.map((unit) => (
            <Unit
              key={unit.name}
              unit={unit}
              onSnapshot={setSnapUnit}
              onAddStage={setStageFor}
            />
          ))
        )}
      </section>

      <section className="cp-section">
        <div className="cp-section-title">
          Agents
          {LOCAL_SCAFFOLD_ENABLED && (<button type="button" className="cp-cred-add" onClick={() => setNewUnit('agent')}>
            + Agent
          </button>)}
        </div>
        {page.agents.length === 0 ? (
          <div className="cp-empty">No agents yet.</div>
        ) : (
          page.agents.map((unit) => (
            <Unit
              key={unit.name}
              unit={unit}
              onSnapshot={setSnapUnit}
              onAddStage={setStageFor}
            />
          ))
        )}
      </section>

      {snapshots.length > 0 && (
        <section className="cp-section">
          <div className="cp-section-title">Versions</div>
          {groupSnapshotsByUnit(snapshots).map(([unit, snaps]) => (
            <div key={unit} className="cp-versions-unit">
              <div className="cp-versions-unit-name">{unit}</div>
              <div className="cp-rows">
                {snaps.map((s) => (
                  <button
                    key={s.dir}
                    type="button"
                    className="cp-row"
                    title={s.note ?? 'Open the snapshot manifest'}
                    // `dir` comes from the lib, which knows whether this version
                    // sits in the unit's versions/ or the retired _versions/.
                    // Rebuilding the path here is how the old rows 404'd.
                    onClick={() => openNote(`${s.dir}/manifest.json`)}
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
        <div className="cp-section-title">
          Knowledge tables
          <button
            type="button"
            className="cp-cred-add"
            title="Reveal the knowledge_tables/ folder in your file manager (drop CSVs in)"
            onClick={() => void revealPath(`${info.dir}/knowledge_tables`)}
          >
            Reveal Folder
          </button>
          {page.tables.length > 0 && (
            <button
              type="button"
              className="cp-cred-add"
              disabled={exportingKb}
              title="Download every knowledge table as one Excel workbook, a sheet per table"
              onClick={() => void exportKb()}
            >
              {exportingKb ? 'Building…' : 'Export to Excel'}
            </button>
          )}
        </div>
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
      {newUnit !== null && (
        <NewUnitModal
          client={info.slug}
          kind={newUnit}
          identity={identity}
          onClose={() => setNewUnit(null)}
          onDone={() => setNewUnit(null)}
        />
      )}
      {stageFor !== null && (
        <NewStageModal
          client={info.slug}
          pipeline={stageFor}
          stages={stagesOf(stageFor)}
          identity={identity}
          onClose={() => setStageFor(null)}
          onDone={() => setStageFor(null)}
        />
      )}
    </div>
  )
}
