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
import { Button } from '../../components/Button'
import { invoke } from '../../api'
import { useApp } from '../../stores/app'
import { useSettingsTab } from '../../stores/settingsTab'
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

/** Doing-now cell: latest MCP call attributed to this agent inside the live
 *  window; else the last git write while live; else idle. Pure. */
export function doingNow(
  row: AgentRow,
  log: readonly McpLogEntry[],
  nowMs: number,
): { text: string; live: boolean } {
  if (row.live) {
    const call = [...log]
      .reverse()
      .find(
        (e) =>
          e.kind === 'tool' &&
          (e.agent ?? '') === row.name &&
          nowMs - Date.parse(e.at) < LIVE_WINDOW_MS,
      )
    return { text: call ? call.name : row.lastSummary, live: true }
  }
  return { text: `idle · last seen ${relativeTime(row.lastAt, nowMs)}`, live: false }
}

/** [MCP]/[GIT] merged session feed, chronological. Pure. */
export function sessionLines(
  log: readonly McpLogEntry[],
  feed: readonly ActivityEvent[],
  agent: string | null,
): Array<{ at: string; src: 'MCP' | 'GIT'; text: string }> {
  const mcp = log
    .filter((e) => !agent || (e.agent ?? '') === agent)
    .map((e) => ({
      at: e.at,
      src: 'MCP' as const,
      text:
        e.kind === 'initialize'
          ? `session start${e.client ? ` · ${e.client}` : ''}`
          : `${e.agent ? `[${e.agent}] ` : ''}${e.name}`,
    }))
  const git = feed
    .filter((e) => e.kind !== 'sync' && (!agent || e.actor.name === agent))
    .map((e) => ({ at: e.at, src: 'GIT' as const, text: e.summary }))
  return [...mcp, ...git].sort((a, b) => a.at.localeCompare(b.at)).slice(-40)
}

export function AgentsView(): React.JSX.Element {
  const activity = useDashboardData((s) => s.activity)
  const loadDash = useDashboardData((s) => s.load)
  const dash = useDashboardData((s) => s.dash)
  const setView = useApp((s) => s.setView)
  const [log, setLog] = useState<McpLogEntry[] | null>(null)
  const [mcp, setMcp] = useState<McpStatus | null>(null)
  const [watch, setWatch] = useState<string | null>(null)

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
  const liveCount = roster.filter((r) => r.live).length
  const lines = sessionLines(log ?? [], activity ?? [], watch)
  const mcpLine =
    mcp === null
      ? 'checking…'
      : mcp.state === 'running'
        ? `127.0.0.1:${mcp.port}`
        : mcp.state === 'port-conflict'
          ? 'port conflict — fix in Settings'
          : 'stopped'

  // reference 06 "everywhere else" chips — live data when we have it
  const doing = roster.find((r) => r.live)
  const filed = (activity ?? []).find((e) => e.kind === 'route')
  const consumed = (activity ?? []).find((e) => e.kind === 'consume')

  return (
    <div className="agents-v3">
      <div className="agents-main">
        <div className="agents-head">
          <span className="agents-title">Agents</span>
          <span className={`live-chip${liveCount > 0 ? '' : ' is-idle'}`}>
            <span className="live-chip-dot" />
            {liveCount} LIVE
          </span>
          <Button
            className="agents-connect"
            onClick={() => {
              useSettingsTab.getState().setSection('mcp-server')
              setView('settings')
            }}
          >
            ＋ Connect an agent
          </Button>
        </div>

        <div className="agents-table" role="table" aria-label="Agent roster">
          <div className="agents-thead" role="row">
            <span className="at-dot" />
            <span className="at-agent">AGENT</span>
            <span className="at-machine">EMAIL</span>
            <span className="at-doing">DOING NOW</span>
            <span className="at-wrote">LAST WROTE</span>
            <span className="at-act" />
          </div>
          {roster.length === 0 ? (
            <div className="agents-empty">
              No attributed writes yet — agents appear as they work.
            </div>
          ) : (
            roster.map((row) => {
              const now = doingNow(row, log ?? [], nowMs)
              const wrote = `${relativeTime(row.lastAt, nowMs)} · ${
                row.lastPath?.split('/').pop()?.replace(/\.md$/i, '') ?? row.lastSummary
              }`
              return (
                <div className={`agents-tr${row.live ? '' : ' is-idle'}`} role="row" key={row.name}>
                  <span className={`at-dot ${row.live ? 'is-live' : ''}`} />
                  <span className="at-agent" title={row.email}>
                    {row.name}
                  </span>
                  <span className="at-machine" title={row.email}>
                    {row.email}
                  </span>
                  <span className="at-doing" title={now.text}>
                    {now.text}
                  </span>
                  <span className="at-wrote" title={row.lastPath ?? ''}>
                    {wrote}
                  </span>
                  <button
                    type="button"
                    className={`at-act${row.live ? ' is-watch' : ''}`}
                    onClick={() => (row.live ? setWatch(watch === row.name ? null : row.name) : setView('feed'))}
                  >
                    {row.live ? (watch === row.name ? 'all' : 'watch') : 'log'}
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="rail-label agents-elsewhere-label">EVERYWHERE ELSE</div>
        <div className="agents-elsewhere">
          <span className="ew-chip">
            work card →{' '}
            {doing ? (
              <span className="ew-live">● {doing.name} {relativeTime(doing.lastAt, nowMs)}</span>
            ) : (
              'agent chip on in-progress cards'
            )}
          </span>
          <span className="ew-chip">
            note byline →{' '}
            {filed ? `filed by ${filed.actor.name} ${filed.at.slice(11, 16)}` : 'filed by <agent> · time'}
          </span>
          <span className="ew-chip">
            activity →{' '}
            {consumed ? `${consumed.actor.name} ${consumed.summary}`.slice(0, 34) : 'every consume · file · status'}
          </span>
        </div>
      </div>

      <div className="agents-session">
        <div className="session-head">
          <span className="session-head-label">
            {watch ? `LIVE SESSION · ${watch.toUpperCase()}` : `SESSION FEED · MCP ${mcpLine}`}
          </span>
          <span className="session-readonly">read-only</span>
        </div>
        {lines.length === 0 ? (
          <div className="agents-empty">
            No MCP requests this session — agent tool calls stream here live.
          </div>
        ) : (
          <div className="session-log-v3">
            {lines.map((l, i) => (
              <div className="session-line-v3" key={`${l.at}/${i}`}>
                <span className="session-time">{l.at.slice(11, 16)}</span>{' '}
                <span className={l.src === 'MCP' ? 'session-src-mcp' : 'session-src-git'}>
                  [{l.src}]
                </span>{' '}
                {l.text}
              </div>
            ))}
          </div>
        )}
        <div className="session-foot">
          trust = seeing what the agent read before it acted. source: in-app MCP log + git
          attribution — zero new engine writes.
        </div>
        <AgentTokensCard />
      </div>
    </div>
  )
}
