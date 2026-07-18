/**
 * Terminal drawer store (terminal-splits blueprint 2026-07-18): create/exit
 * handling over a mocked bridge — load reads+clamps the per-vault prefs
 * (PORT_SWAPPED retry-once), toggle spawns on first open and persists
 * {open,height}, splitActive never leaks a mid-flight pty, closePane kills
 * and collapses (last pane closes the drawer), height drags persist only on
 * commit. The xterm registry is mocked — no DOM, rails.test.ts pattern.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../terminal/xtermRegistry', () => ({
  writeTerm: vi.fn(),
  disposeTerm: vi.fn(),
  disposeAllTerms: vi.fn(),
}))

import { disposeAllTerms, disposeTerm } from '../terminal/xtermRegistry'
import { useTerminal } from './terminal'

const invoke = vi.fn()

beforeEach(() => {
  invoke.mockReset()
  invoke.mockResolvedValue(undefined)
  vi.stubGlobal('window', { loredex: { invoke } })
  useTerminal.setState({
    open: false,
    height: 280,
    root: null,
    activeId: null,
    resizing: false,
    exited: {},
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('load', () => {
  it('reads settings.terminal.get and clamps the stored height into the band', async () => {
    invoke.mockResolvedValue({ open: true, height: 9000 })
    await useTerminal.getState().load()
    expect(invoke).toHaveBeenCalledWith('settings.terminal.get', undefined)
    expect(useTerminal.getState()).toMatchObject({ open: true, height: 600 })
  })

  it('retries ONCE on PORT_SWAPPED (first-attach port swap drops early invokes)', async () => {
    invoke
      .mockRejectedValueOnce({ code: 'PORT_SWAPPED', message: 'port swapped' })
      .mockResolvedValueOnce({ open: true, height: 300 })
    await useTerminal.getState().load()
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(useTerminal.getState()).toMatchObject({ open: true, height: 300 })
  })

  it('any other load failure leaves the closed/280 defaults (no core yet)', async () => {
    invoke.mockRejectedValue(new Error('no core'))
    await useTerminal.getState().load()
    expect(useTerminal.getState()).toMatchObject({ open: false, height: 280 })
  })
})

describe('toggle (spawn-on-first-open)', () => {
  it('first open spawns via term.create (NO cwd field) then persists {open,height}', async () => {
    invoke.mockImplementation((ch: string) =>
      ch === 'term.create' ? Promise.resolve({ id: 't1' }) : Promise.resolve(undefined),
    )
    await useTerminal.getState().toggle()
    // exact arg — a cwd key here would break the "vault root by default" contract
    expect(invoke).toHaveBeenCalledWith('term.create', { cols: 80, rows: 24 })
    expect(invoke).toHaveBeenCalledWith('settings.terminal.set', { open: true, height: 280 })
    expect(useTerminal.getState()).toMatchObject({
      open: true,
      root: { kind: 'term', id: 't1' },
      activeId: 't1',
    })
  })

  it('a failed spawn reverts the optimistic open and persists nothing', async () => {
    invoke.mockImplementation((ch: string) =>
      ch === 'term.create' ? Promise.reject(new Error('no core')) : Promise.resolve(undefined),
    )
    await useTerminal.getState().toggle()
    expect(useTerminal.getState()).toMatchObject({ open: false, root: null })
    expect(invoke).not.toHaveBeenCalledWith('settings.terminal.set', expect.anything())
  })

  it('with a live tree toggle only flips visibility — no new pty, ptys survive', async () => {
    useTerminal.setState({ open: true, root: { kind: 'term', id: 't1' }, activeId: 't1' })
    await useTerminal.getState().toggle()
    expect(useTerminal.getState()).toMatchObject({ open: false, root: { kind: 'term', id: 't1' } })
    expect(invoke).not.toHaveBeenCalledWith('term.create', expect.anything())
    expect(invoke).not.toHaveBeenCalledWith('term.kill', expect.anything())
    expect(invoke).toHaveBeenCalledWith('settings.terminal.set', { open: false, height: 280 })
  })

  it('a second toggle while the first create is pending spawns NO second pty and means "close"', async () => {
    let resolveCreate!: (v: { id: string }) => void
    invoke.mockImplementation((ch: string) =>
      ch === 'term.create'
        ? new Promise<{ id: string }>((r) => {
            resolveCreate = r
          })
        : Promise.resolve(undefined),
    )
    const first = useTerminal.getState().toggle()
    await useTerminal.getState().toggle() // double-tap ⌃` before the shell is up
    expect(useTerminal.getState().open).toBe(false) // the second press meant close
    resolveCreate({ id: 't1' })
    await first
    expect(invoke.mock.calls.filter((c) => c[0] === 'term.create')).toHaveLength(1)
    expect(invoke).not.toHaveBeenCalledWith('term.kill', expect.anything())
    // the lone pty still lands in the tree, ready for the next open
    expect(useTerminal.getState()).toMatchObject({ open: false, root: { kind: 'term', id: 't1' } })
  })

  it('a create resolving after a vault-switch reset kills the dead-core pty (no zombie pane)', async () => {
    let resolveCreate!: (v: { id: string }) => void
    invoke.mockImplementation((ch: string) =>
      ch === 'term.create'
        ? new Promise<{ id: string }>((r) => {
            resolveCreate = r
          })
        : Promise.resolve(undefined),
    )
    const inFlight = useTerminal.getState().toggle()
    await useTerminal.getState().reset() // vault switch mid-spawn
    resolveCreate({ id: 'tz' })
    await inFlight
    expect(invoke).toHaveBeenCalledWith('term.kill', { id: 'tz' })
    expect(useTerminal.getState()).toMatchObject({ open: false, root: null })
  })

  it('a persist failure degrades silently — the session state stays applied', async () => {
    invoke.mockImplementation((ch: string) => {
      if (ch === 'term.create') return Promise.resolve({ id: 't1' })
      return Promise.reject(new Error('core gone'))
    })
    await useTerminal.getState().toggle()
    expect(useTerminal.getState()).toMatchObject({ open: true, activeId: 't1' })
  })
})

describe('splitActive', () => {
  it('spawns a pty and splits the active pane; the new pane becomes active', async () => {
    invoke.mockImplementation((ch: string) =>
      ch === 'term.create' ? Promise.resolve({ id: 't2' }) : Promise.resolve(undefined),
    )
    useTerminal.setState({ open: true, root: { kind: 'term', id: 't1' }, activeId: 't1' })
    await useTerminal.getState().splitActive('row')
    expect(useTerminal.getState().root).toEqual({
      kind: 'split',
      dir: 'row',
      ratio: 0.5,
      a: { kind: 'term', id: 't1' },
      b: { kind: 'term', id: 't2' },
    })
    expect(useTerminal.getState().activeId).toBe('t2')
  })

  it('a refused spawn (cap / no core) leaves the tree unchanged', async () => {
    invoke.mockImplementation((ch: string) =>
      ch === 'term.create' ? Promise.reject(new Error('cap')) : Promise.resolve(undefined),
    )
    const root = { kind: 'term', id: 't1' } as const
    useTerminal.setState({ open: true, root, activeId: 't1' })
    await useTerminal.getState().splitActive('column')
    expect(useTerminal.getState().root).toBe(root)
  })

  it('kills the fresh pty when the target pane vanished across the await (no leak)', async () => {
    let resolveCreate!: (v: { id: string }) => void
    invoke.mockImplementation((ch: string) =>
      ch === 'term.create'
        ? new Promise<{ id: string }>((r) => {
            resolveCreate = r
          })
        : Promise.resolve(undefined),
    )
    useTerminal.setState({ open: true, root: { kind: 'term', id: 't1' }, activeId: 't1' })
    const inFlight = useTerminal.getState().splitActive('row')
    useTerminal.setState({ root: null, activeId: null }) // pane closed mid-flight
    resolveCreate({ id: 't9' })
    await inFlight
    expect(invoke).toHaveBeenCalledWith('term.kill', { id: 't9' })
    expect(useTerminal.getState().root).toBeNull()
  })

  it('with no tree yet it delegates to toggle (palette row is never dead)', async () => {
    invoke.mockImplementation((ch: string) =>
      ch === 'term.create' ? Promise.resolve({ id: 't1' }) : Promise.resolve(undefined),
    )
    await useTerminal.getState().splitActive('row')
    expect(useTerminal.getState()).toMatchObject({
      open: true,
      root: { kind: 'term', id: 't1' },
    })
  })
})

describe('closePane', () => {
  it('kills the pty, disposes the xterm, and collapses to the sibling', async () => {
    useTerminal.setState({
      open: true,
      root: {
        kind: 'split',
        dir: 'row',
        ratio: 0.5,
        a: { kind: 'term', id: 't1' },
        b: { kind: 'term', id: 't2' },
      },
      activeId: 't2',
    })
    await useTerminal.getState().closePane('t2')
    expect(invoke).toHaveBeenCalledWith('term.kill', { id: 't2' })
    expect(disposeTerm).toHaveBeenCalledWith('t2')
    expect(useTerminal.getState()).toMatchObject({
      open: true, // drawer stays up while panes remain
      root: { kind: 'term', id: 't1' },
      activeId: 't1', // active fell back to the survivor
    })
  })

  it('closing the LAST pane hides the drawer, clears its exit chip, persists', async () => {
    useTerminal.setState({
      open: true,
      root: { kind: 'term', id: 't1' },
      activeId: 't1',
      exited: { t1: 0 },
    })
    await useTerminal.getState().closePane('t1')
    expect(useTerminal.getState()).toMatchObject({
      open: false,
      root: null,
      activeId: null,
      exited: {},
    })
    expect(invoke).toHaveBeenCalledWith('settings.terminal.set', { open: false, height: 280 })
  })
})

describe('drawer height (drag/commit/reset)', () => {
  it('dragHeight clamps to the 120–600 band and does NOT persist (live drag)', () => {
    useTerminal.getState().dragHeight(50)
    expect(useTerminal.getState().height).toBe(120)
    useTerminal.getState().dragHeight(9000)
    expect(useTerminal.getState().height).toBe(600)
    expect(invoke).not.toHaveBeenCalledWith('settings.terminal.set', expect.anything())
  })

  it('commitHeight persists the current {open,height} (drag-end)', () => {
    useTerminal.getState().dragHeight(400)
    useTerminal.getState().commitHeight()
    expect(invoke).toHaveBeenCalledWith('settings.terminal.set', { open: false, height: 400 })
  })

  it('resetHeight returns to the 280 default and persists (double-click)', () => {
    useTerminal.setState({ height: 555 })
    useTerminal.getState().resetHeight()
    expect(useTerminal.getState().height).toBe(280)
    expect(invoke).toHaveBeenCalledWith('settings.terminal.set', { open: false, height: 280 })
  })
})

describe('reset (vault switch)', () => {
  it('kills every pane pty, disposes all xterms, returns to defaults', async () => {
    useTerminal.setState({
      open: true,
      height: 500,
      root: {
        kind: 'split',
        dir: 'column',
        ratio: 0.3,
        a: { kind: 'term', id: 't1' },
        b: { kind: 'term', id: 't2' },
      },
      activeId: 't2',
      exited: { t1: 1 },
    })
    await useTerminal.getState().reset()
    expect(invoke).toHaveBeenCalledWith('term.kill', { id: 't1' })
    expect(invoke).toHaveBeenCalledWith('term.kill', { id: 't2' })
    expect(disposeAllTerms).toHaveBeenCalled()
    expect(useTerminal.getState()).toMatchObject({
      open: false,
      height: 280,
      root: null,
      activeId: null,
      exited: {},
    })
  })
})

describe('runCommand (B1 one-click login)', () => {
  it('spawns a shell on a cold drawer then writes the newline-terminated command', async () => {
    invoke.mockImplementation((ch: string) =>
      ch === 'term.create' ? Promise.resolve({ id: 't1' }) : Promise.resolve(undefined),
    )
    await useTerminal.getState().runCommand('claude /login')
    expect(invoke).toHaveBeenCalledWith('term.create', { cols: 80, rows: 24 })
    expect(invoke).toHaveBeenCalledWith('term.input', { id: 't1', data: 'claude /login\n' })
    expect(useTerminal.getState().open).toBe(true)
  })

  it('reuses the active pty (no second spawn) and opens a closed-but-alive drawer', async () => {
    useTerminal.setState({ root: { kind: 'term', id: 't9' }, activeId: 't9', open: false })
    await useTerminal.getState().runCommand('codex login')
    expect(invoke).not.toHaveBeenCalledWith('term.create', expect.anything())
    expect(invoke).toHaveBeenCalledWith('term.input', { id: 't9', data: 'codex login\n' })
    expect(useTerminal.getState().open).toBe(true)
  })

  it('no-ops when the spawn is refused (no core) — never throws', async () => {
    invoke.mockRejectedValue(new Error('no core'))
    await expect(useTerminal.getState().runCommand('claude /login')).resolves.toBeUndefined()
    expect(invoke).not.toHaveBeenCalledWith('term.input', expect.anything())
  })
})
