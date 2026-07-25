/**
 * The registry decides WHICH workspace servers a session gets. The rules that
 * matter: a server that is not installed is omitted rather than half-built (a
 * broken entry would fail the whole session), the n8n key rides only in env, and
 * stdio is emitted regardless of what the adapter advertises — the Claude
 * adapter reports {http, sse} and honours stdio anyway (verified 2026-07-20).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

let entry: string | null = null
let env: Record<string, string> = { MCP_MODE: 'stdio' }
vi.mock('./n8n-install', () => ({ n8nEntryPath: () => entry }))
vi.mock('./n8n-config', () => ({
  n8nEnv: () => env,
  n8nStatus: () => ({ hasKey: 'N8N_API_KEY' in env, url: env.N8N_API_URL ?? null }),
}))
let langsmith: { url: string; header: { name: string; value: string } } | null = null
vi.mock('./langsmith-config', () => ({ langsmithHttp: () => langsmith }))

const { buildWorkspaceServers } = await import('./workspace-mcp')

/** Enabled map for the servers a case cares about; the rest default off, so a
 *  new server in the registry cannot silently join every existing assertion. */
const on = (
  v: Partial<Record<'loredex' | 'n8n' | 'langsmith', boolean>>,
): Record<'loredex' | 'n8n' | 'langsmith', boolean> => ({
  loredex: false,
  n8n: false,
  langsmith: false,
  ...v,
})

const CTX = { loredex: null, httpOk: true, enabled: on({ loredex: true, n8n: true }) }

/** The ACP McpServer union only exposes `args`/`env`/`headers` on the arm that
 *  has them; these tests assert across arms, so they read the payload as a bag. */
type Bag = Record<string, unknown>
const bags = (servers: unknown[]): Bag[] => servers as Bag[]

describe('buildWorkspaceServers', () => {
  beforeEach(() => {
    entry = null
    env = { MCP_MODE: 'stdio' }
    langsmith = null
  })

  it('omits n8n entirely when it is not installed', () => {
    expect(buildWorkspaceServers(CTX)).toEqual([])
  })

  it('emits a stdio server once installed', () => {
    entry = '/ud/mcp/n8n-mcp/node_modules/n8n-mcp/dist/mcp/stdio-wrapper.js'
    const [server] = bags(buildWorkspaceServers(CTX))
    expect(server.name).toBe('n8n')
    expect(server).not.toHaveProperty('type') // stdio is the untagged union arm
    expect(server.args).toEqual([entry])
    expect(server.env).toContainEqual({ name: 'MCP_MODE', value: 'stdio' })
    expect(server.env).toContainEqual({ name: 'ELECTRON_RUN_AS_NODE', value: '1' })
  })

  it('carries the key ONLY inside env, never elsewhere in the payload', () => {
    entry = '/ud/entry.js'
    env = { MCP_MODE: 'stdio', N8N_API_URL: 'https://n8n.example.com', N8N_API_KEY: 'sek' }
    const [server] = bags(buildWorkspaceServers(CTX))
    const { env: serverEnv, ...rest } = server
    expect(JSON.stringify(rest)).not.toContain('sek')
    expect(serverEnv).toContainEqual({ name: 'N8N_API_KEY', value: 'sek' })
  })

  it('omits a server the user has disabled', () => {
    entry = '/ud/entry.js'
    expect(buildWorkspaceServers({ ...CTX, enabled: on({ loredex: true }) })).toEqual([])
  })

  it('emits the loredex http server when this window owns the host', () => {
    const [server] = bags(
      buildWorkspaceServers({
        ...CTX,
        loredex: { url: 'http://127.0.0.1:52017/', token: 'tok' },
        enabled: on({ loredex: true }),
      }),
    )
    expect(server).toMatchObject({ type: 'http', name: 'loredex', url: 'http://127.0.0.1:52017/' })
    expect(server.headers).toContainEqual({ name: 'Authorization', value: 'Bearer tok' })
  })
})

describe('buildWorkspaceServers — langsmith (remote, 2026-07-23)', () => {
  beforeEach(() => {
    entry = null
    env = { MCP_MODE: 'stdio' }
    langsmith = null
  })

  it('is omitted without a stored key — an unauthenticated entry fails every call', () => {
    expect(buildWorkspaceServers({ ...CTX, enabled: on({ langsmith: true }) })).toEqual([])
  })

  it('emits a streamable-http server with the X-Api-Key header once a key is stored', () => {
    langsmith = {
      url: 'https://api.smith.langchain.com/mcp',
      header: { name: 'X-Api-Key', value: 'lsv2_pt_secret' },
    }
    const [server] = bags(buildWorkspaceServers({ ...CTX, enabled: on({ langsmith: true }) }))
    expect(server).toMatchObject({
      type: 'http',
      name: 'langsmith',
      url: 'https://api.smith.langchain.com/mcp',
    })
    expect(server.headers).toContainEqual({ name: 'X-Api-Key', value: 'lsv2_pt_secret' })
  })

  it('is omitted when the adapter cannot do http, rather than emitted and broken', () => {
    langsmith = { url: 'https://x/mcp', header: { name: 'X-Api-Key', value: 'k' } }
    expect(
      buildWorkspaceServers({ ...CTX, httpOk: false, enabled: on({ langsmith: true }) }),
    ).toEqual([])
  })

  it('is omitted when disabled, key or no key', () => {
    langsmith = { url: 'https://x/mcp', header: { name: 'X-Api-Key', value: 'k' } }
    expect(buildWorkspaceServers({ ...CTX, enabled: on({}) })).toEqual([])
  })
})
