/**
 * Agents (DESIGN v3 §5/§6.5, story 26.5) — the roster + read-only live
 * session feed. Two honest sources, zero new engine writes:
 *   • roster: git attribution from the activity feed — one row per identity,
 *     what they last wrote and when; the green live treatment (sacred to
 *     agents, §1) lights on a write within the live window.
 *   • session feed: the in-app MCP host's request ring (agents.sessions
 *     channel) — every initialize/tools-call, mono `❯` lines, newest first.
 * The feed polls while the view is mounted (5 s); nothing here writes.
 */
import { useEffect, useState } from 'react'
import type { ActivityEvent, McpLogEntry, McpStatus } from '../../../../shared/types'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import { AgentChip } from '../../components/AgentChip'
import { Button } from '../../components/Button'
import { invoke } from '../../api'
import { useApp } from '../../stores/app'
import { relativeTime } from '../feed/feed-logic'
import { useDashboardData } from '../home/dashboard-data'

/** A write inside this window renders the agent live (green dot + glow). */
export const LIVE_WINDOW_MS = 10 * 60 * 1000

export interface AgentRow {
  name: string
  email: string
  lastAt: string
  lastSummary: string
  lastPath?: string
  live: boolean
}

/** One roster row per identity, newest write first. Pure. */
export function rosterFrom(feed: readonly ActivityEvent[], nowMs: number): AgentRow[] {
  const rows = new Map<string, AgentRow>()
  for (const e of feed) {
    if (e.kind === 'sync' || !e.actor.name) continue
    if (rows.has(e.actor.name)) continue
    rows.set(e.actor.name, {
      name: e.actor.name,
      email: e.actor.email,
      lastAt: e.at,
      lastSummary: e.summary,
      ...(e.subject.path ? { lastPath: e.subject.path } : {}),
      live: nowMs - Date.parse(e.at) < LIVE_WINDOW_MS,
    })
  }
  return [...rows.values()]
}

const TIME = new Intl.DateTimeFormat('en-US', {
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function SessionLine({ entry }: { entry: McpLogEntry }): React.JSX.Element {
  return (
    <div className="session-line">
      <span className="session-time">{TIME.format(new Date(entry.at))}</span>
      <span className="session-text">
        ❯ {entry.agent ? `[${entry.agent}] ` : ''}
        {entry.kind === 'initialize'
          ? `session start${entry.client ? ` · ${entry.client}` : ''}`
          : entry.name}
      </span>
    </div>
  )
}

/** Per-agent MCP tokens (story 26.9): mint shows the token ONCE — put it in
 *  that agent's MCP config Authorization header; its calls then attribute in
 *  the session feed. Revoke kills the token immediately (host reads live). */
export function AgentTokensCard(): React.JSX.Element {
  const [names, setNames] = useState<string[]>([])
  const [name, setName] = useState('')
  const [minted, setMinted] = useState<{ name: string; token: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async (): Promise<void> => {
    try {
      setNames(await invoke('agents.tokens.list', undefined))
    } catch {
      /* core not ready */
    }
  }
  useEffect(() => {
    void load()
  }, [])

  return (
    <section aria-label="Agent tokens" className="agent-tokens">
      <div className="today-sect">
        <span className="today-sect-label">per-agent tokens · mcp</span>
      </div>
      {names.map((n) => (
        <div className="dexreg-row" key={n}>
          <span className="dexreg-name">{n}</span>
          <span className="dexreg-meta">calls attribute as [{n}]</span>
          <Button
            variant="danger"
            className="button-small"
            title="Revoke — this agent's token stops working immediately"
            onClick={() =>
              void invoke('agents.tokens.revoke', { name: n }).then(load)
            }
          >
            Revoke
          </Button>
        </div>
      ))}
      {minted && (
        <div className="agent-token-once">
          <span className="mono">{minted.token}</span>
          <span className="settings-hint">
            {minted.name}'s token — copy it NOW into that agent's MCP config (Authorization:
            Bearer …); it is never shown again.
          </span>
        </div>
      )}
      <div className="dexreg-create">
        <input
          className="settings-input"
          placeholder="agent name (claude, codex, …)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          variant="primary"
          disabled={name.trim() === ''}
          onClick={() =>
            void invoke('agents.tokens.mint', { name: name.trim() })
              .then(({ token }) => {
                setMinted({ name: name.trim(), token })
                setName('')
                setError(null)
                return load()
              })
              .catch((e) => setError(isErrEnvelope(e) ? e.message : String(e)))
          }
        >
          Mint token
        </Button>
      </div>
      {error && <div className="note-error">{error}</div>}
    </section>
  )
}

export function AgentsView(): React.JSX.Element {
  const activity = useDashboardData((s) => s.activity)
  const loadDash = useDashboardData((s) => s.load)
  const dash = useDashboardData((s) => s.dash)
  const setView = useApp((s) => s.setView)
  const [log, setLog] = useState<McpLogEntry[] | null>(null)
  const [mcp, setMcp] = useState<McpStatus | null>(null)

  useEffect(() => {
    if (!dash) void loadDash()
  }, [dash, loadDash])

  // read-only session poll — only while this view is mounted
  useEffect(() => {
    let alive = true
    const tick = async (): Promise<void> => {
      try {
        const res = await invoke('agents.sessions', undefined)
        if (alive) {
          setLog(res.log)
          setMcp(res.mcp)
        }
      } catch {
        /* core not ready — next tick retries */
      }
    }
    void tick()
    const timer = setInterval(() => void tick(), 5000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const nowMs = Date.now()
  const roster = rosterFrom(activity ?? [], nowMs)
  const recent = [...(log ?? [])].reverse().slice(0, 40)
  const mcpLine =
    mcp === null
      ? 'checking…'
      : mcp.state === 'running'
        ? `listening on 127.0.0.1:${mcp.port}`
        : mcp.state === 'port-conflict'
          ? 'port conflict — fix in Settings'
          : 'stopped'

  return (
    <div className="agents">
      <div className="plan-head">
        <div className="ops-titlewrap">
          <h1 className="ops-title">Agents</h1>
          <span className="ops-subtitle">
            roster from git attribution · session feed from the MCP host · read-only
          </span>
        </div>
      </div>

      <div className="agents-layout">
        <section aria-label="Roster">
          <div className="today-sect">
            <span className="today-sect-label">roster · {roster.length}</span>
          </div>
          {roster.length === 0 ? (
            <div className="ops-clear">No attributed writes yet — agents appear as they work.</div>
          ) : (
            roster.map((row) => (
              <div className="agent-row" key={row.name}>
                <AgentChip name={row.name} meta={relativeTime(row.lastAt, nowMs)} live={row.live} />
                <span className="agent-row-doing" title={row.lastSummary}>
                  {row.lastSummary}
                </span>
                {row.lastPath && (
                  <span className="agent-row-path" title={row.lastPath}>
                    {row.lastPath}
                  </span>
                )}
                <Button variant="quiet" onClick={() => setView('feed')}>
                  History
                </Button>
              </div>
            ))
          )}
        </section>

        <section aria-label="Live session feed" className="session-panel">
          <div className="today-sect">
            <span className="today-sect-label">session feed · mcp</span>
            <span className="today-sect-note">{mcpLine}</span>
          </div>
          {recent.length === 0 ? (
            <div className="ops-clear">
              No MCP requests this session — agent tool calls stream here live.
            </div>
          ) : (
            <div className="session-log">
              {recent.map((entry, i) => (
                <SessionLine key={`${entry.at}/${i}`} entry={entry} />
              ))}
            </div>
          )}
          <AgentTokensCard />
        </section>
      </div>
    </div>
  )
}
