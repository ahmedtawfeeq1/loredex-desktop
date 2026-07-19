// @vitest-environment jsdom
/**
 * Agent panel store (acp blueprint 2026-07-18, step 4.3): the acp.* event
 * routing over a captured onEvent handler — chunk runs grow the last
 * same-role bubble after the rAF-coalesced commit, tool rows upsert by
 * toolCallId AFTER pending chunks flush (renderer mirror of the core ordering
 * law), plans replace, turnEnd clears busy, permissions queue FIFO — plus the
 * rails-pattern load (PORT_SWAPPED retry-once) and the resetGen race that
 * must never list a session from a torn-down core. Bridge fully mocked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreEvent } from '../../../shared/ipc-contract'
import type { AcpSessionView } from './agentPanel'

// window.loredex must be live BEFORE the store module evaluates — its
// module-scope onEvent subscription is guarded by it (App boot order in
// prod). Hence the assignment first and the dynamic import below.
const invoke = vi.fn()
let emit: (e: CoreEvent) => void = () => {
  throw new Error('onEvent handler was never registered')
}
window.loredex = {
  invoke,
  onEvent: (cb: (e: CoreEvent) => void) => {
    emit = cb
    return () => {}
  },
} as unknown as typeof window.loredex

// value imports MUST ride this dynamic import (never a static one) — a static
// import hoists above the window.loredex assignment above, so the store's
// onEvent subscription guard would see no bridge and emit would stay unset
const { DEFAULT_PANEL_WIDTH, lastUserText, quoteForChat, useAgentPanel, visibleSessions } =
  await import('./agentPanel')

const session = (id: string, over: Partial<AcpSessionView> = {}): AcpSessionView => ({
  sessionId: id,
  agent: 'claude',
  title: 'New session',
  state: 'ready',
  busy: false,
  items: [],
  plan: [],
  ...over,
})

const items = (id: string): AcpSessionView['items'] =>
  useAgentPanel.getState().sessions.find((s) => s.sessionId === id)?.items ?? []

beforeEach(async () => {
  invoke.mockReset()
  invoke.mockResolvedValue(undefined)
  await useAgentPanel.getState().reset() // clears sessions + module-scope sinks/queues
  invoke.mockClear()
  vi.useFakeTimers() // rAF + the setTimeout fallback both ride the fake clock
})

afterEach(() => {
  vi.runOnlyPendingTimers() // fire any scheduled commit so the sink flag resets
  vi.useRealTimers()
})

describe('load (rails pattern)', () => {
  it('maps settings.agentPanel.get onto {open, width}', async () => {
    invoke.mockResolvedValueOnce({ open: true, width: 420 })
    await useAgentPanel.getState().load()
    expect(invoke).toHaveBeenCalledWith('settings.agentPanel.get', undefined)
    expect(useAgentPanel.getState()).toMatchObject({ open: true, width: 420 })
  })

  it('retries ONCE on PORT_SWAPPED (first-attach port swap drops early invokes)', async () => {
    invoke
      .mockRejectedValueOnce({ code: 'PORT_SWAPPED', message: 'port swapped' })
      .mockResolvedValueOnce({ open: true, width: 300 })
    await useAgentPanel.getState().load()
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(useAgentPanel.getState()).toMatchObject({ open: true, width: 300 })
  })

  it('any other failure leaves the closed/340 defaults (no core yet)', async () => {
    invoke.mockRejectedValue(new Error('no core'))
    await useAgentPanel.getState().load()
    expect(useAgentPanel.getState()).toMatchObject({ open: false, width: DEFAULT_PANEL_WIDTH })
  })
})

describe('openHere', () => {
  it('opens the panel, starts with the picked agent (no cwd key = vault root), selects', async () => {
    invoke.mockImplementation((ch: string) =>
      ch === 'acp.start' ? Promise.resolve({ sessionId: 's1' }) : Promise.resolve(undefined),
    )
    await useAgentPanel.getState().openHere()
    // exact arg — a cwd key here would break the "vault root by default" contract
    expect(invoke).toHaveBeenCalledWith('acp.start', { agent: 'claude' })
    expect(useAgentPanel.getState()).toMatchObject({
      open: true,
      activeId: 's1',
      sessions: [{ sessionId: 's1', agent: 'claude', title: 'New session', state: 'starting' }],
    })
  })

  it('passes an explicit cwd through', async () => {
    invoke.mockImplementation((ch: string) =>
      ch === 'acp.start' ? Promise.resolve({ sessionId: 's2' }) : Promise.resolve(undefined),
    )
    await useAgentPanel.getState().openHere('/some/project')
    expect(invoke).toHaveBeenCalledWith('acp.start', { agent: 'claude', cwd: '/some/project' })
  })

  it('a reset() across the awaited acp.start stops the orphan and never lists it', async () => {
    let resolveStart!: (v: { sessionId: string }) => void
    invoke.mockImplementation((ch: string) =>
      ch === 'acp.start'
        ? new Promise<{ sessionId: string }>((r) => {
            resolveStart = r
          })
        : Promise.resolve(undefined),
    )
    const inFlight = useAgentPanel.getState().openHere()
    await useAgentPanel.getState().reset() // vault switch mid-start
    resolveStart({ sessionId: 'sz' })
    await inFlight
    expect(invoke).toHaveBeenCalledWith('acp.stop', { sessionId: 'sz' })
    expect(useAgentPanel.getState().sessions).toEqual([])
  })

  it('a refused start (cap / no core) is silent — the panel stays open, nothing listed', async () => {
    invoke.mockRejectedValue({ code: 'INTERNAL', message: 'agent session limit reached (4)' })
    await useAgentPanel.getState().openHere()
    expect(useAgentPanel.getState()).toMatchObject({ open: true, sessions: [] })
  })

  it('replays acp.session events that raced AHEAD of the acp.start ack (fast-fail: gemini ENOENT)', async () => {
    // the fast-fail race: spawn ENOENT fires 'starting' + terminal 'error'
    // BEFORE `await invoke('acp.start')` resolves and registers the session
    let resolveStart!: (v: { sessionId: string }) => void
    invoke.mockImplementation((ch: string) =>
      ch === 'acp.start'
        ? new Promise<{ sessionId: string }>((r) => {
            resolveStart = r
          })
        : Promise.resolve(undefined),
    )
    useAgentPanel.setState({ agent: 'gemini' })
    const inFlight = useAgentPanel.getState().openHere()
    // core emitted BOTH while the session is not yet known (mid-await)
    emit({ kind: 'acp.session', sessionId: 'g1', agent: 'gemini', state: 'starting' })
    emit({
      kind: 'acp.session',
      sessionId: 'g1',
      agent: 'gemini',
      state: 'error',
      detail: 'gemini CLI not found — install @google/gemini-cli',
    })
    // buffered, not applied — the session isn't registered yet
    expect(useAgentPanel.getState().sessions).toEqual([])
    resolveStart({ sessionId: 'g1' })
    await inFlight
    // the buffered 'error' is replayed on registration → a CLEAN error state
    // (pre-fix this dropped the event and stranded the session in 'starting')
    expect(useAgentPanel.getState().sessions[0]).toMatchObject({
      sessionId: 'g1',
      state: 'error',
      detail: 'gemini CLI not found — install @google/gemini-cli',
    })
  })

  it('an unknown-session event OUTSIDE any start window is still dropped (no leak/replay)', async () => {
    // no start in flight → a late event for a closed session must not buffer
    emit({ kind: 'acp.session', sessionId: 'gone', agent: 'gemini', state: 'error', detail: 'x' })
    // a subsequent unrelated start must NOT inherit the stale buffered event
    invoke.mockImplementation((ch: string) =>
      ch === 'acp.start' ? Promise.resolve({ sessionId: 's1' }) : Promise.resolve(undefined),
    )
    await useAgentPanel.getState().openHere()
    expect(useAgentPanel.getState().sessions).toEqual([
      expect.objectContaining({ sessionId: 's1', state: 'starting' }),
    ])
  })
})

describe('continueIn (B2 cross-provider continuation)', () => {
  // seed the store with an active claude session on a persisted conversation
  const seedActive = (): void => {
    useAgentPanel.setState({
      open: true,
      sessions: [
        session('c1', {
          agent: 'claude',
          conversationId: 'conv-1',
          title: 'Rename the intro',
          items: [{ type: 'user', text: 'rename it' }],
        }),
      ],
      activeId: 'c1',
    })
  }

  it('agent.continue on the active conversation lists the new provider session bound to the same conv', async () => {
    seedActive()
    invoke.mockImplementation((ch: string) =>
      ch === 'agent.continue'
        ? Promise.resolve({ sessionId: 'x1' })
        : // the follow-up hydrate load — empty so it never clobbers
          Promise.resolve({ messages: [] }),
    )
    await useAgentPanel.getState().continueIn('codex')
    expect(invoke).toHaveBeenCalledWith('agent.continue', {
      conversationId: 'conv-1',
      provider: 'codex',
    })
    const st = useAgentPanel.getState()
    expect(st.activeId).toBe('x1')
    expect(st.agent).toBe('codex') // the picker follows the new active provider
    expect(st.sessions.map((s) => s.sessionId)).toEqual(['c1', 'x1'])
    // the new session is the SAME logical thread: same conversationId + title
    expect(st.sessions.find((s) => s.sessionId === 'x1')).toMatchObject({
      agent: 'codex',
      conversationId: 'conv-1',
      title: 'Rename the intro',
      state: 'starting',
    })
  })

  it('is a no-op when the active session has no persisted conversation (no-db session)', async () => {
    useAgentPanel.setState({
      sessions: [session('c1', { agent: 'claude', conversationId: undefined })],
      activeId: 'c1',
    })
    await useAgentPanel.getState().continueIn('codex')
    expect(invoke).not.toHaveBeenCalledWith('agent.continue', expect.anything())
    expect(useAgentPanel.getState().sessions).toHaveLength(1)
  })

  it('a reset() across the awaited agent.continue stops the orphan and never lists it', async () => {
    seedActive()
    let resolveContinue!: (v: { sessionId: string }) => void
    invoke.mockImplementation((ch: string) =>
      ch === 'agent.continue'
        ? new Promise<{ sessionId: string }>((r) => {
            resolveContinue = r
          })
        : Promise.resolve({ messages: [] }),
    )
    const inFlight = useAgentPanel.getState().continueIn('codex')
    await useAgentPanel.getState().reset() // vault switch mid-continue
    resolveContinue({ sessionId: 'orphan' })
    await inFlight
    expect(invoke).toHaveBeenCalledWith('acp.stop', { sessionId: 'orphan' })
    expect(useAgentPanel.getState().sessions).toEqual([])
  })
})

describe('event routing — chunks (rAF-coalesced sink)', () => {
  it('same-role chunks coalesce into ONE growing bubble on the next frame', () => {
    useAgentPanel.setState({ sessions: [session('s1', { busy: true })], activeId: 's1' })
    emit({ kind: 'acp.chunk', sessionId: 's1', role: 'agent', text: 'Hel' })
    emit({ kind: 'acp.chunk', sessionId: 's1', role: 'agent', text: 'lo' })
    expect(items('s1')).toEqual([]) // nothing commits mid-frame
    vi.advanceTimersByTime(20)
    expect(items('s1')).toEqual([{ type: 'agent', text: 'Hello' }])
  })

  it('a role switch pushes a new item instead of growing the last', () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    emit({ kind: 'acp.chunk', sessionId: 's1', role: 'agent', text: 'answer' })
    vi.advanceTimersByTime(20)
    emit({ kind: 'acp.chunk', sessionId: 's1', role: 'thought', text: 'hmm' })
    emit({ kind: 'acp.chunk', sessionId: 's1', role: 'thought', text: '…' })
    vi.advanceTimersByTime(20)
    expect(items('s1')).toEqual([
      { type: 'agent', text: 'answer' },
      { type: 'thought', text: 'hmm…' },
    ])
  })

  it('chunks for a session no longer listed are dropped, not crashed on', () => {
    emit({ kind: 'acp.chunk', sessionId: 'ghost', role: 'agent', text: 'boo' })
    vi.advanceTimersByTime(20)
    expect(useAgentPanel.getState().sessions).toEqual([])
  })
})

describe('event routing — tool upsert (ordering law)', () => {
  it('a tool event flushes pending chunks FIRST, then appends the tool row', () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    emit({ kind: 'acp.chunk', sessionId: 's1', role: 'agent', text: 'reading ' })
    // NO timer advance — the tool event itself must commit the chunk run
    emit({
      kind: 'acp.tool',
      sessionId: 's1',
      toolCallId: 't1',
      title: 'Read README',
      toolKind: 'read',
      status: 'pending',
    })
    expect(items('s1')).toEqual([
      { type: 'agent', text: 'reading ' },
      { type: 'tool', toolCallId: 't1', title: 'Read README', toolKind: 'read', status: 'pending' },
    ])
  })

  it('a second event with the same toolCallId updates in place (sparse fields keep what we had)', () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    emit({ kind: 'acp.tool', sessionId: 's1', toolCallId: 't1', title: 'Read README', status: 'pending' })
    emit({ kind: 'acp.tool', sessionId: 's1', toolCallId: 't1', status: 'completed' })
    expect(items('s1')).toEqual([
      { type: 'tool', toolCallId: 't1', title: 'Read README', toolKind: undefined, status: 'completed' },
    ])
  })

  it('an update for an unseen toolCallId pushes a row with defaults', () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    emit({ kind: 'acp.tool', sessionId: 's1', toolCallId: 't9' })
    expect(items('s1')).toEqual([
      { type: 'tool', toolCallId: 't9', title: 'Tool call', toolKind: undefined, status: 'pending' },
    ])
  })
})

describe('event routing — plan, turnEnd, session state', () => {
  it('acp.plan REPLACES the plan (never appends)', () => {
    useAgentPanel.setState({
      sessions: [session('s1', { plan: [{ content: 'old', priority: 'low', status: 'pending' }] })],
    })
    emit({
      kind: 'acp.plan',
      sessionId: 's1',
      entries: [{ content: 'new step', priority: 'high', status: 'in_progress' }],
    })
    expect(useAgentPanel.getState().sessions[0].plan).toEqual([
      { content: 'new step', priority: 'high', status: 'in_progress' },
    ])
  })

  it('acp.turnEnd flushes pending chunks and clears busy', () => {
    useAgentPanel.setState({ sessions: [session('s1', { busy: true })] })
    emit({ kind: 'acp.chunk', sessionId: 's1', role: 'agent', text: 'done.' })
    emit({ kind: 'acp.turnEnd', sessionId: 's1', stopReason: 'end_turn' })
    expect(useAgentPanel.getState().sessions[0]).toMatchObject({
      busy: false,
      items: [{ type: 'agent', text: 'done.' }],
    })
  })

  it('acp.session error merges state+detail and clears busy (mid-turn death has no turnEnd)', () => {
    useAgentPanel.setState({ sessions: [session('s1', { busy: true })] })
    emit({ kind: 'acp.session', sessionId: 's1', agent: 'claude', state: 'error', detail: 'spawn ENOENT' })
    expect(useAgentPanel.getState().sessions[0]).toMatchObject({
      state: 'error',
      detail: 'spawn ENOENT',
      busy: false,
    })
  })

  it('acp.session ready keeps busy (state refresh mid-turn is not a turn end)', () => {
    useAgentPanel.setState({ sessions: [session('s1', { busy: true })] })
    emit({ kind: 'acp.session', sessionId: 's1', agent: 'claude', state: 'ready' })
    expect(useAgentPanel.getState().sessions[0].busy).toBe(true)
  })

  it('session events for unknown ids are ignored', () => {
    useAgentPanel.setState({ sessions: [session('s1')] })
    emit({ kind: 'acp.session', sessionId: 'ghost', agent: 'codex', state: 'exited' })
    expect(useAgentPanel.getState().sessions).toEqual([session('s1')])
  })
})

describe('event routing — usage (context, cost, and turn all replace)', () => {
  it('context + cost + turn all REPLACE (latest wins — the turn snapshot is cumulative)', () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    emit({
      kind: 'acp.usage',
      sessionId: 's1',
      context: { used: 1000, size: 200000 },
      cost: { amount: 0.05, currency: 'USD' },
      turn: { total: 300, input: 200, output: 100, cached: 50 },
    })
    emit({
      kind: 'acp.usage',
      sessionId: 's1',
      context: { used: 2500, size: 200000 },
      cost: { amount: 0.09, currency: 'USD' },
      turn: { total: 400, input: 250, output: 150, thought: 20 },
    })
    expect(useAgentPanel.getState().sessions[0].usage).toEqual({
      context: { used: 2500, size: 200000 }, // replaced, not summed
      cost: { amount: 0.09, currency: 'USD' }, // replaced
      // turn is a cumulative snapshot → the latest wholly replaces the prior one
      // (no summing, no field-level merge of the earlier snapshot's `cached`)
      turn: { total: 400, input: 250, output: 150, thought: 20 },
    })
  })

  it('a turn-only event keeps the prior context/cost (an absent half never clobbers)', () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    emit({ kind: 'acp.usage', sessionId: 's1', context: { used: 10, size: 100 } })
    emit({ kind: 'acp.usage', sessionId: 's1', turn: { total: 5, input: 3, output: 2 } })
    expect(useAgentPanel.getState().sessions[0].usage).toEqual({
      context: { used: 10, size: 100 }, // survived the turn-only event
      turn: { total: 5, input: 3, output: 2 },
    })
  })

  it('a session with no usage event leaves usage undefined (codex may emit none)', () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    expect(useAgentPanel.getState().sessions[0].usage).toBeUndefined()
  })

  it('usage for an unknown session is ignored', () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    emit({ kind: 'acp.usage', sessionId: 'ghost', context: { used: 1, size: 2 } })
    expect(useAgentPanel.getState().sessions[0].usage).toBeUndefined()
  })
})

describe('event routing — commands + mode + MCP (A7)', () => {
  it('acp.commands REPLACES the session commands (never appends)', () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    emit({
      kind: 'acp.commands',
      sessionId: 's1',
      commands: [
        { name: 'plan', description: 'Make a plan', hint: 'what to plan' },
        { name: 'review', description: 'Review code' },
      ],
    })
    expect(useAgentPanel.getState().sessions[0].commands).toEqual([
      { name: 'plan', description: 'Make a plan', hint: 'what to plan' },
      { name: 'review', description: 'Review code' },
    ])
    emit({ kind: 'acp.commands', sessionId: 's1', commands: [{ name: 'test', description: 'Run tests' }] })
    expect(useAgentPanel.getState().sessions[0].commands).toEqual([
      { name: 'test', description: 'Run tests' },
    ])
  })

  it('the initial acp.mode carries the full set; a later id-only update keeps availableModes', () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    emit({
      kind: 'acp.mode',
      sessionId: 's1',
      currentModeId: 'code',
      availableModes: [
        { id: 'code', name: 'Code' },
        { id: 'plan', name: 'Plan', description: 'Read-only planning' },
      ],
    })
    expect(useAgentPanel.getState().sessions[0].mode).toEqual({
      currentModeId: 'code',
      availableModes: [
        { id: 'code', name: 'Code' },
        { id: 'plan', name: 'Plan', description: 'Read-only planning' },
      ],
    })
    // current_mode_update: only the id — the earlier set survives
    emit({ kind: 'acp.mode', sessionId: 's1', currentModeId: 'plan' })
    expect(useAgentPanel.getState().sessions[0].mode).toEqual({
      currentModeId: 'plan',
      availableModes: [
        { id: 'code', name: 'Code' },
        { id: 'plan', name: 'Plan', description: 'Read-only planning' },
      ],
    })
  })

  it('commands / mode for an unknown session are ignored', () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    emit({ kind: 'acp.commands', sessionId: 'ghost', commands: [{ name: 'x', description: 'y' }] })
    emit({ kind: 'acp.mode', sessionId: 'ghost', currentModeId: 'z' })
    expect(useAgentPanel.getState().sessions[0].commands).toBeUndefined()
    expect(useAgentPanel.getState().sessions[0].mode).toBeUndefined()
  })

  it('acp.session ready surfaces the attached MCP servers (name/url, no token); a later state keeps them', () => {
    useAgentPanel.setState({ sessions: [session('s1', { state: 'starting' })], activeId: 's1' })
    emit({
      kind: 'acp.session',
      sessionId: 's1',
      agent: 'claude',
      state: 'ready',
      mcpServers: [{ name: 'loredex', url: 'http://127.0.0.1:5599/' }],
    })
    expect(useAgentPanel.getState().sessions[0].mcpServers).toEqual([
      { name: 'loredex', url: 'http://127.0.0.1:5599/' },
    ])
    // a later non-ready event carries no list — the surfaced servers survive
    emit({ kind: 'acp.session', sessionId: 's1', agent: 'claude', state: 'error', detail: 'boom' })
    expect(useAgentPanel.getState().sessions[0].mcpServers).toEqual([
      { name: 'loredex', url: 'http://127.0.0.1:5599/' },
    ])
  })
})

describe('setMode (A7)', () => {
  const withModes = (id: string) =>
    session(id, {
      mode: {
        currentModeId: 'code',
        availableModes: [
          { id: 'code', name: 'Code' },
          { id: 'plan', name: 'Plan' },
        ],
      },
    })

  it('optimistically switches the current mode and invokes agent.setMode', async () => {
    useAgentPanel.setState({ sessions: [withModes('s1')], activeId: 's1' })
    await useAgentPanel.getState().setMode('s1', 'plan')
    expect(invoke).toHaveBeenCalledWith('agent.setMode', { sessionId: 's1', modeId: 'plan' })
    expect(useAgentPanel.getState().sessions[0].mode?.currentModeId).toBe('plan')
    // the available set is untouched by a switch
    expect(useAgentPanel.getState().sessions[0].mode?.availableModes).toHaveLength(2)
  })

  it('reverts the current mode when agent.setMode rejects (not-ready / dead core)', async () => {
    useAgentPanel.setState({ sessions: [withModes('s1')], activeId: 's1' })
    invoke.mockRejectedValue({ code: 'ACP_NOT_READY', message: 'agent session is not ready' })
    await useAgentPanel.getState().setMode('s1', 'plan')
    expect(useAgentPanel.getState().sessions[0].mode?.currentModeId).toBe('code')
  })

  it('is a no-op when the mode is unchanged or the session has no modes', async () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    await useAgentPanel.getState().setMode('s1', 'plan') // no modes at all
    useAgentPanel.setState({ sessions: [withModes('s1')], activeId: 's1' })
    await useAgentPanel.getState().setMode('s1', 'code') // already on it
    expect(invoke).not.toHaveBeenCalledWith('agent.setMode', expect.anything())
  })
})

describe('provider filter + login-state chips (A6)', () => {
  it('setFilter narrows the DERIVED visible list to that provider; "all" shows every session', () => {
    useAgentPanel.setState({
      sessions: [session('s1', { agent: 'claude' }), session('s2', { agent: 'codex' })],
    })
    // default is 'all' — every session shows
    expect(useAgentPanel.getState().filter).toBe('all')
    const all = useAgentPanel.getState().sessions
    expect(visibleSessions(all, 'all').map((v) => v.sessionId)).toEqual(['s1', 's2'])

    useAgentPanel.getState().setFilter('codex')
    expect(useAgentPanel.getState().filter).toBe('codex')
    expect(visibleSessions(all, 'codex').map((v) => v.sessionId)).toEqual(['s2'])
    // the filter is a VIEW filter only — it never drops a live session
    expect(useAgentPanel.getState().sessions).toHaveLength(2)
  })

  it('a ready session marks its provider signed-in; auth_required flags it', () => {
    useAgentPanel.setState({ sessions: [session('s1', { agent: 'codex' })], activeId: 's1' })
    // fresh default: every provider unknown until one reports in
    expect(useAgentPanel.getState().providerAuth).toEqual({
      claude: 'unknown',
      codex: 'unknown',
      gemini: 'unknown',
    })
    emit({ kind: 'acp.session', sessionId: 's1', agent: 'codex', state: 'ready' })
    expect(useAgentPanel.getState().providerAuth.codex).toBe('ok')
    emit({ kind: 'acp.session', sessionId: 's1', agent: 'codex', state: 'auth_required' })
    expect(useAgentPanel.getState().providerAuth.codex).toBe('auth_required')
    // claude was never touched
    expect(useAgentPanel.getState().providerAuth.claude).toBe('unknown')
  })

  it('non-auth states (error / exited / starting) never clobber a known login verdict', () => {
    useAgentPanel.setState({
      sessions: [session('s1', { agent: 'claude' })],
      activeId: 's1',
      providerAuth: { claude: 'ok', codex: 'unknown', gemini: 'unknown' },
    })
    emit({ kind: 'acp.session', sessionId: 's1', agent: 'claude', state: 'error', detail: 'boom' })
    // an error says nothing about auth — the 'ok' verdict survives
    expect(useAgentPanel.getState().providerAuth.claude).toBe('ok')
  })

  it('reset restores filter "all" and unknown login state', async () => {
    useAgentPanel.setState({
      filter: 'codex',
      providerAuth: { claude: 'ok', codex: 'auth_required', gemini: 'unknown' },
    })
    await useAgentPanel.getState().reset()
    expect(useAgentPanel.getState().filter).toBe('all')
    expect(useAgentPanel.getState().providerAuth).toEqual({
      claude: 'unknown',
      codex: 'unknown',
      gemini: 'unknown',
    })
  })
})

describe('add-to-chat (A8)', () => {
  it('quoteForChat renders a source-attributed blockquote; multi-line stays fully quoted', () => {
    expect(quoteForChat('the selected words', 'notes/x.md')).toBe(
      '> from [notes/x.md]: the selected words\n',
    )
    expect(quoteForChat('first line\nsecond line', 'a/b.md')).toBe(
      '> from [a/b.md]: first line\n> second line\n',
    )
  })

  it('addContext opens the panel and pre-fills the draft — it never sends', () => {
    useAgentPanel.setState({ open: false, draft: '' })
    useAgentPanel.getState().addContext('hello world', 'notes/x.md')
    expect(useAgentPanel.getState().open).toBe(true)
    expect(useAgentPanel.getState().draft).toBe('> from [notes/x.md]: hello world\n')
    // add-to-chat STAGES only — no prompt rides the invoke
    expect(invoke).not.toHaveBeenCalledWith('acp.prompt', expect.anything())
  })

  it('a second addContext stacks onto the existing draft (blank-line separated)', () => {
    useAgentPanel.setState({ open: true, draft: '' })
    useAgentPanel.getState().addContext('one', 'a.md')
    useAgentPanel.getState().addContext('two', 'b.md')
    expect(useAgentPanel.getState().draft).toBe('> from [a.md]: one\n\n> from [b.md]: two\n')
  })

  it('an empty / whitespace selection is a no-op (nothing to quote, draft untouched)', () => {
    useAgentPanel.setState({ open: false, draft: 'kept' })
    useAgentPanel.getState().addContext('   ', 'a.md')
    expect(useAgentPanel.getState()).toMatchObject({ open: false, draft: 'kept' })
  })

  it('setDraft replaces the composer draft; reset clears it', async () => {
    useAgentPanel.getState().setDraft('typed text')
    expect(useAgentPanel.getState().draft).toBe('typed text')
    await useAgentPanel.getState().reset()
    expect(useAgentPanel.getState().draft).toBe('')
  })
})

describe('send', () => {
  it('titles the session from the first prompt words, pushes the user item, prompts', async () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    await useAgentPanel.getState().send('one two three four five six seven')
    expect(invoke).toHaveBeenCalledWith('acp.prompt', {
      sessionId: 's1',
      text: 'one two three four five six seven',
    })
    expect(useAgentPanel.getState().sessions[0]).toMatchObject({
      title: 'one two three four five six', // 6-word cap
      busy: true,
      items: [{ type: 'user', text: 'one two three four five six seven' }],
    })
  })

  it('caps the derived title at 48 chars and keeps an existing title', async () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    await useAgentPanel.getState().send('x'.repeat(60))
    expect(useAgentPanel.getState().sessions[0].title).toBe('x'.repeat(48))
    emit({ kind: 'acp.turnEnd', sessionId: 's1', stopReason: 'end_turn' })
    await useAgentPanel.getState().send('a different prompt')
    expect(useAgentPanel.getState().sessions[0].title).toBe('x'.repeat(48)) // first prompt wins
  })

  it('no-ops while busy, not-ready, or on whitespace (belt and braces)', async () => {
    useAgentPanel.setState({ sessions: [session('s1', { busy: true })], activeId: 's1' })
    await useAgentPanel.getState().send('hi')
    useAgentPanel.setState({ sessions: [session('s1', { state: 'starting' })], activeId: 's1' })
    await useAgentPanel.getState().send('hi')
    await useAgentPanel.getState().send('   ')
    expect(invoke).not.toHaveBeenCalledWith('acp.prompt', expect.anything())
  })

  it('an envelope rejection (ACP_BUSY / dead core) reverts busy and surfaces as detail', async () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    invoke.mockRejectedValue({ code: 'ACP_BUSY', message: 'a turn is already in flight' })
    await useAgentPanel.getState().send('go')
    expect(useAgentPanel.getState().sessions[0]).toMatchObject({
      busy: false,
      detail: 'a turn is already in flight',
    })
  })
})

describe('retry (chat-completeness)', () => {
  it('lastUserText returns the most recent user turn, stripping a trailing attachment marker', () => {
    expect(lastUserText([])).toBeNull()
    expect(
      lastUserText([
        { type: 'user', text: 'first' },
        { type: 'agent', text: 'reply' },
        { type: 'user', text: 'second question' },
        { type: 'tool', toolCallId: 't', title: 'x', status: 'completed' },
      ]),
    ).toBe('second question')
    // a trailing "📎 …" marker line is dropped (attachments are transient)
    expect(lastUserText([{ type: 'user', text: 'look at this\n\n📎 shot.png' }])).toBe('look at this')
    // an attachment-only bubble strips to '' → nothing meaningful to resend
    expect(lastUserText([{ type: 'user', text: '📎 shot.png' }])).toBe('')
  })

  it('re-sends the last user turn as a fresh prompt when idle', async () => {
    useAgentPanel.setState({
      sessions: [
        session('s1', {
          title: 'kept',
          items: [
            { type: 'user', text: 'do the thing' },
            { type: 'agent', text: 'did it' },
          ],
        }),
      ],
      activeId: 's1',
    })
    await useAgentPanel.getState().retry()
    expect(invoke).toHaveBeenCalledWith('acp.prompt', { sessionId: 's1', text: 'do the thing' })
    // a retry appends a NEW user bubble (standard chat retry), keeps the title
    expect(items('s1').filter((i) => i.type === 'user')).toHaveLength(2)
    expect(useAgentPanel.getState().sessions[0].title).toBe('kept')
  })

  it('is a no-op while busy, not-ready, or with no user turn', async () => {
    useAgentPanel.setState({
      sessions: [session('s1', { busy: true, items: [{ type: 'user', text: 'x' }] })],
      activeId: 's1',
    })
    await useAgentPanel.getState().retry() // busy
    useAgentPanel.setState({
      sessions: [session('s1', { state: 'starting', items: [{ type: 'user', text: 'x' }] })],
      activeId: 's1',
    })
    await useAgentPanel.getState().retry() // not ready
    useAgentPanel.setState({ sessions: [session('s1', { items: [] })], activeId: 's1' })
    await useAgentPanel.getState().retry() // no user turn
    expect(invoke).not.toHaveBeenCalledWith('acp.prompt', expect.anything())
  })
})

describe('B4 — attachments (paste / attach / images)', () => {
  it('addAttachment stages chips; removeAttachment drops one by index', () => {
    const st = useAgentPanel.getState()
    st.addAttachment({ type: 'image', mimeType: 'image/png', dataB64: 'AA', name: 'shot.png' })
    st.addAttachment({ type: 'resource', path: '/tmp/a.md', name: 'a.md' })
    expect(useAgentPanel.getState().attachments.map((a) => a.name)).toEqual(['shot.png', 'a.md'])
    useAgentPanel.getState().removeAttachment(0)
    expect(useAgentPanel.getState().attachments.map((a) => a.name)).toEqual(['a.md'])
  })

  it('send maps staged attachments to the contract shape, clears the tray, marks the bubble', async () => {
    useAgentPanel.setState({
      sessions: [session('s1')],
      activeId: 's1',
      attachments: [
        { type: 'image', mimeType: 'image/png', dataB64: 'IMG', name: 'shot.png' },
        { type: 'resource', path: '/tmp/notes/a.md', name: 'a.md' },
      ],
    })
    await useAgentPanel.getState().send('here you go')
    // the display-only `name` is stripped; the contract attachments ride the prompt
    expect(invoke).toHaveBeenCalledWith('acp.prompt', {
      sessionId: 's1',
      text: 'here you go',
      attachments: [
        { type: 'image', mimeType: 'image/png', dataB64: 'IMG' },
        { type: 'resource', path: '/tmp/notes/a.md' },
      ],
    })
    const s = useAgentPanel.getState()
    expect(s.attachments).toEqual([]) // tray cleared as the turn fired
    // the thread bubble records what rode along (clean text + a mono marker line)
    expect(s.sessions[0].items).toEqual([
      { type: 'user', text: 'here you go\n\n📎 shot.png, a.md' },
    ])
  })

  it('an attachment-only turn sends (empty text) with a marker bubble + derived title', async () => {
    useAgentPanel.setState({
      sessions: [session('s1')],
      activeId: 's1',
      attachments: [{ type: 'image', mimeType: 'image/png', dataB64: 'IMG', name: 'diagram.png' }],
    })
    await useAgentPanel.getState().send('')
    expect(invoke).toHaveBeenCalledWith('acp.prompt', {
      sessionId: 's1',
      text: '',
      attachments: [{ type: 'image', mimeType: 'image/png', dataB64: 'IMG' }],
    })
    expect(useAgentPanel.getState().sessions[0]).toMatchObject({
      title: '📎 diagram.png',
      items: [{ type: 'user', text: '📎 diagram.png' }],
    })
  })

  it('no attachments → the prompt carries no attachments key (back-compat)', async () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    await useAgentPanel.getState().send('plain turn')
    expect(invoke).toHaveBeenCalledWith('acp.prompt', { sessionId: 's1', text: 'plain turn' })
  })

  it('an empty draft with an empty tray is a no-op', async () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1', attachments: [] })
    await useAgentPanel.getState().send('   ')
    expect(invoke).not.toHaveBeenCalledWith('acp.prompt', expect.anything())
  })

  it('acp.session ready surfaces imageInput; reset clears the tray', async () => {
    useAgentPanel.setState({ sessions: [session('s1', { state: 'starting' })], activeId: 's1' })
    emit({ kind: 'acp.session', sessionId: 's1', agent: 'claude', state: 'ready', imageInput: true })
    expect(useAgentPanel.getState().sessions[0].imageInput).toBe(true)
    useAgentPanel.setState({
      attachments: [{ type: 'resource', path: '/x', name: 'x' }],
    })
    await useAgentPanel.getState().reset()
    expect(useAgentPanel.getState().attachments).toEqual([])
  })
})

describe('permission FIFO', () => {
  const perm = (requestId: string): CoreEvent => ({
    kind: 'acp.permission',
    sessionId: 's1',
    requestId,
    title: 'Write notes/a.md',
    toolKind: 'edit',
    options: [{ optionId: 'y', name: 'Allow', kind: 'allow_once' }],
  })

  it('surfaces the first request, queues the rest, advances on respond', () => {
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    emit(perm('r1'))
    emit(perm('r2'))
    expect(useAgentPanel.getState().permission).toMatchObject({ requestId: 'r1' })
    useAgentPanel.getState().respondPermission('y')
    expect(invoke).toHaveBeenCalledWith('acp.permission', {
      sessionId: 's1',
      requestId: 'r1',
      optionId: 'y',
    })
    expect(useAgentPanel.getState().permission).toMatchObject({ requestId: 'r2' })
    // dismissing is rejecting: null rides the invoke as the cancelled outcome
    useAgentPanel.getState().respondPermission(null)
    expect(invoke).toHaveBeenCalledWith('acp.permission', {
      sessionId: 's1',
      requestId: 'r2',
      optionId: null,
    })
    expect(useAgentPanel.getState().permission).toBeNull()
  })

  it('requests for sessions not in the list are ignored', () => {
    emit(perm('r1')) // no session seeded
    expect(useAgentPanel.getState().permission).toBeNull()
  })

  const permFor = (sessionId: string, requestId: string): CoreEvent => ({
    kind: 'acp.permission',
    sessionId,
    requestId,
    title: 'Write notes/a.md',
    options: [{ optionId: 'y', name: 'Allow', kind: 'allow_once' }],
  })

  it('a session dying while its permission is surfaced advances to the next queued session', () => {
    useAgentPanel.setState({ sessions: [session('s1'), session('s2')], activeId: 's1' })
    emit(permFor('s1', 'r1')) // surfaces
    emit(permFor('s2', 'r2')) // queues
    expect(useAgentPanel.getState().permission).toMatchObject({ sessionId: 's1', requestId: 'r1' })
    // s1's adapter crashes mid-turn — no turnEnd, core already answered r1
    emit({ kind: 'acp.session', sessionId: 's1', agent: 'claude', state: 'exited' })
    // the dead session's modal is replaced by the healthy session's request
    expect(useAgentPanel.getState().permission).toMatchObject({ sessionId: 's2', requestId: 'r2' })
  })

  it('a dying session’s queued request is purged, never surfaced behind a healthy one', () => {
    useAgentPanel.setState({ sessions: [session('s1'), session('s2')], activeId: 's1' })
    emit(permFor('s1', 'r1')) // surfaces
    emit(permFor('s2', 'r2')) // queues
    // s2 dies while queued behind s1's surfaced modal — surfaced modal untouched
    emit({ kind: 'acp.session', sessionId: 's2', agent: 'claude', state: 'exited' })
    expect(useAgentPanel.getState().permission).toMatchObject({ sessionId: 's1', requestId: 'r1' })
    // answering s1 must NOT surface s2's stale request — the queue was purged
    useAgentPanel.getState().respondPermission('y')
    expect(useAgentPanel.getState().permission).toBeNull()
  })

  it('WP-B: remember persists an always-allow rule for the (client, kind)', () => {
    useAgentPanel.setState({ sessions: [session('s1', { clientSlug: 'acme' })], activeId: 's1' })
    emit(perm('r1')) // toolKind 'edit'
    // the modal's toggle threads remember=true into the allow answer
    useAgentPanel.getState().respondPermission('y', true)
    expect(invoke).toHaveBeenCalledWith('agent.permissions.set', {
      client: 'acme',
      toolKind: 'edit',
      decision: 'allow',
    })
  })

  it('WP-B: does NOT persist a rule without a client scope or on a reject', () => {
    // no clientSlug on the session → no rule even with remember
    useAgentPanel.setState({ sessions: [session('s1')], activeId: 's1' })
    emit(perm('r1'))
    useAgentPanel.getState().respondPermission('y', true)
    expect(invoke).not.toHaveBeenCalledWith('agent.permissions.set', expect.anything())
  })

  it('WP-B: the pending badge is DERIVED — a multi-purge can never desync it (risk #2)', () => {
    // s1: 1 surfaced + 2 queued; s1 dies → ALL of s1's requests vanish → count 0
    useAgentPanel.setState({ sessions: [session('s1'), session('s2')], activeId: 's1' })
    emit(permFor('s1', 'r1')) // surfaces
    emit(permFor('s1', 'r2')) // queues
    emit(permFor('s1', 'r3')) // queues
    expect(useAgentPanel.getState().pendingPermissions).toBe(3)
    emit({ kind: 'acp.session', sessionId: 's1', agent: 'claude', state: 'exited' })
    expect(useAgentPanel.getState().pendingPermissions).toBe(0)
    expect(useAgentPanel.getState().permission).toBeNull()
  })
})

describe('reset (vault switch)', () => {
  it('stops every session (failures swallowed — old core may be dead), restores defaults', async () => {
    useAgentPanel.setState({
      open: true,
      width: 400,
      agent: 'codex',
      sessions: [session('a'), session('b')],
      activeId: 'b',
    })
    emit({
      kind: 'acp.permission',
      sessionId: 'a',
      requestId: 'r1',
      title: 'T',
      options: [{ optionId: 'y', name: 'Allow', kind: 'allow_once' }],
    })
    invoke.mockRejectedValue(new Error('core gone'))
    await useAgentPanel.getState().reset()
    expect(invoke).toHaveBeenCalledWith('acp.stop', { sessionId: 'a' })
    expect(invoke).toHaveBeenCalledWith('acp.stop', { sessionId: 'b' })
    expect(useAgentPanel.getState()).toMatchObject({
      open: false,
      width: DEFAULT_PANEL_WIDTH,
      agent: 'claude',
      sessions: [],
      activeId: null,
      permission: null,
    })
  })
})
