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

const { DEFAULT_PANEL_WIDTH, useAgentPanel } = await import('./agentPanel')

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
