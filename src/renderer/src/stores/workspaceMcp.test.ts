/**
 * Tools are loaded per server and expanded by default, so `load()` must fetch
 * them for every INSTALLED row without being asked. A not-installed row must not
 * be probed — that would spawn nothing and just render a confusing error.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('../api', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))

const { useWorkspaceMcp } = await import('./workspaceMcp')

const ROWS = [
  { id: 'loredex', label: 'loredex', enabled: true, installed: true, mode: null },
  { id: 'n8n', label: 'n8n', enabled: true, installed: false, mode: 'documentation' },
]

const SKILLS = {
  installed: false,
  command: '/plugin install x',
  plugin: 'p',
  terminal: { installed: false, command: 'claude mcp add n8n-mcp' },
}

describe('useWorkspaceMcp', () => {
  beforeEach(() => {
    invoke.mockReset()
    useWorkspaceMcp.setState({ rows: [], tools: {}, skills: null, busy: false })
  })

  it('loads rows and probes tools only for installed servers', async () => {
    invoke.mockImplementation((ch: string) => {
      if (ch === 'workspace.mcp.list') return Promise.resolve(ROWS)
      if (ch === 'workspace.skills.status') return Promise.resolve(SKILLS)
      if (ch === 'workspace.mcp.tools')
        return Promise.resolve({ ok: true, tools: ['vault_search'], detail: '1 tools' })
      return Promise.resolve(undefined)
    })
    await useWorkspaceMcp.getState().load()
    const s = useWorkspaceMcp.getState()
    expect(s.rows).toHaveLength(2)
    expect(s.tools.loredex?.tools).toEqual(['vault_search'])
    expect(s.tools.n8n).toBeUndefined() // not installed → never probed
    const probed = invoke.mock.calls.filter((c) => c[0] === 'workspace.mcp.tools')
    expect(probed).toHaveLength(1)
  })

  it('surfaces the fallback command when the install fails', async () => {
    invoke.mockResolvedValue({ ok: false, detail: 'npm not found', command: 'npm install ...' })
    const res = await useWorkspaceMcp.getState().install()
    expect(res.ok).toBe(false)
    expect(res.command).toContain('npm install')
  })

  it('never hard-fails the settings page when a channel throws', async () => {
    invoke.mockRejectedValue(new Error('no core'))
    await useWorkspaceMcp.getState().load()
    const s = useWorkspaceMcp.getState()
    expect(s.busy).toBe(false)
    expect(s.rows).toEqual([])
  })

  it('records a probe failure as a not-ok tools entry rather than throwing', async () => {
    invoke.mockRejectedValue(new Error('probe died'))
    await useWorkspaceMcp.getState().loadTools('n8n')
    expect(useWorkspaceMcp.getState().tools.n8n).toMatchObject({ ok: false, tools: [] })
  })
})
