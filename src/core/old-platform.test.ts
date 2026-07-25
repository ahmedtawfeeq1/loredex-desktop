/**
 * The old genudo platform is PER CLIENT: one client's token must never reach
 * another client's session, and only presence may cross the IPC seam.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.mock('./client-tokens', () => ({
  storeClientToken: async (ref: string, tok: string) => void store.set(ref, tok),
  readClientToken: async (ref: string) => store.get(ref) ?? null,
  deleteClientToken: async (ref: string) => void store.delete(ref),
}))

let probe: { ok: boolean; tools: string[]; detail: string } = { ok: true, tools: [], detail: '' }
const probed: { url: string; headers: Record<string, string> }[] = []
vi.mock('./mcp-tools', () => ({
  probeHttpTools: async (url: string, headers: Record<string, string>) => {
    probed.push({ url, headers })
    return probe
  },
}))

const mod = await import('./old-platform')

beforeEach(() => {
  store.clear()
  probed.length = 0
  probe = { ok: true, tools: [], detail: '' }
})

describe('old-platform token storage', () => {
  it('scopes the keychain ref to the client', () => {
    expect(mod.oldPlatformRef('beananza-coffee')).toBe(
      'clients/beananza-coffee/GENUDO_OLD_PLATFORM_TOKEN',
    )
  })

  it('reports presence only — never the token', async () => {
    await mod.setOldPlatformToken('beananza-coffee', 'gnd_secret')
    const status = await mod.oldPlatformStatus('beananza-coffee')
    expect(status).toEqual({ hasToken: true })
    expect(JSON.stringify(status)).not.toContain('gnd_secret')
  })

  it('trims a pasted token — a trailing newline would 401', async () => {
    await mod.setOldPlatformToken('c', ' gnd_x\n')
    expect(store.get(mod.oldPlatformRef('c'))).toBe('gnd_x')
  })

  it('clearing removes it', async () => {
    await mod.setOldPlatformToken('c', 'gnd_x')
    await mod.clearOldPlatformToken('c')
    expect((await mod.oldPlatformStatus('c')).hasToken).toBe(false)
  })
})

describe('oldPlatformServer — what a session gets', () => {
  it('is null without a token: omitted, never half-built', async () => {
    expect(await mod.oldPlatformServer('beananza-coffee')).toBeNull()
  })

  it('is null for a vault-root session (no client)', async () => {
    await mod.setOldPlatformToken('beananza-coffee', 'gnd_x')
    expect(await mod.oldPlatformServer(null)).toBeNull()
  })

  /** The whole point: this is a per-client connection. */
  it('never leaks one client’s token into another client’s session', async () => {
    await mod.setOldPlatformToken('beananza-coffee', 'gnd_beananza')
    expect(await mod.oldPlatformServer('al-hazem-tech')).toBeNull()
    const mine = await mod.oldPlatformServer('beananza-coffee')
    expect(mine?.headers[0].value).toBe('Bearer gnd_beananza')
  })

  it('is an http server with a Bearer header, named apart from the new platform', async () => {
    await mod.setOldPlatformToken('c', 'gnd_x')
    expect(await mod.oldPlatformServer('c')).toEqual({
      type: 'http',
      // NOT `genudo` — an agent mid-migration must never confuse the two
      name: 'genudo-old-platform',
      url: mod.OLD_PLATFORM_URL,
      headers: [{ name: 'Authorization', value: 'Bearer gnd_x' }],
    })
  })
})

describe('syncOldPlatformMcp — what an EXTERNAL agent gets', () => {
  function clientDir(mcpJson?: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), 'oldp-'))
    mkdirSync(dir, { recursive: true })
    if (mcpJson !== undefined) writeFileSync(join(dir, '.mcp.json'), JSON.stringify(mcpJson, null, 2))
    return dir
  }
  const read = (dir: string): { mcpServers: Record<string, unknown> } =>
    JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'))

  it('writes the http server the terminal can actually use', async () => {
    await mod.setOldPlatformToken('c', 'gnd_x')
    const dir = clientDir({ mcpServers: {} })
    await mod.syncOldPlatformMcp(dir, 'c')
    expect(read(dir).mcpServers['genudo-old-platform']).toEqual({
      type: 'http',
      url: mod.OLD_PLATFORM_URL,
      headers: { Authorization: 'Bearer gnd_x' },
    })
  })

  it('leaves the workspace.yml servers untouched — merge, never rewrite', async () => {
    await mod.setOldPlatformToken('c', 'gnd_x')
    const dir = clientDir({ mcpServers: { genudo: { command: 'npx', args: ['-y', 'genudo-mcp-client'] } } })
    await mod.syncOldPlatformMcp(dir, 'c')
    expect(read(dir).mcpServers.genudo).toEqual({ command: 'npx', args: ['-y', 'genudo-mcp-client'] })
  })

  /** Byte-stable, or every --check reports drift and the Re-wire warning sticks. */
  it('writes sorted keys with a trailing newline, like the lib', async () => {
    await mod.setOldPlatformToken('c', 'gnd_x')
    const dir = clientDir({ mcpServers: {} })
    await mod.syncOldPlatformMcp(dir, 'c')
    const raw = readFileSync(join(dir, '.mcp.json'), 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(raw.indexOf('"headers"')).toBeLessThan(raw.indexOf('"type"'))
  })

  it('clearing the token removes it — Clear must reach the terminal too', async () => {
    const dir = clientDir({
      mcpServers: { 'genudo-old-platform': { type: 'http', url: 'x' }, genudo: { command: 'npx' } },
    })
    await mod.syncOldPlatformMcp(dir, 'c')
    const servers = read(dir).mcpServers
    expect(servers['genudo-old-platform']).toBeUndefined()
    expect(servers.genudo).toBeDefined()
  })

  it('no token and no entry: nothing to do, no write', async () => {
    const dir = clientDir({ mcpServers: { genudo: { command: 'npx' } } })
    await mod.syncOldPlatformMcp(dir, 'c')
    expect(readFileSync(join(dir, '.mcp.json'), 'utf8')).toBe(
      JSON.stringify({ mcpServers: { genudo: { command: 'npx' } } }, null, 2),
    )
  })

  it('unwired client (no .mcp.json) is a no-op, not a crash', async () => {
    await mod.setOldPlatformToken('c', 'gnd_x')
    await expect(mod.syncOldPlatformMcp(clientDir(), 'c')).resolves.toBeUndefined()
  })
})

describe('testOldPlatform — a real handshake', () => {
  it('refuses before making a pointless request', async () => {
    const res = await mod.testOldPlatform('c')
    expect(res.ok).toBe(false)
    expect(probed).toHaveLength(0)
  })

  it('probes the endpoint with the stored token', async () => {
    await mod.setOldPlatformToken('c', 'gnd_x')
    probe = { ok: true, tools: ['list_pipelines', 'get_stage'], detail: '2 tools' }
    const res = await mod.testOldPlatform('c')
    expect(probed[0]).toEqual({
      url: mod.OLD_PLATFORM_URL,
      headers: { Authorization: 'Bearer gnd_x' },
    })
    expect(res.ok).toBe(true)
    expect(res.detail).toBe('Connected — 2 tools')
  })

  it('names the credential on a rejection instead of blaming the feature', async () => {
    await mod.setOldPlatformToken('c', 'gnd_stale')
    probe = { ok: false, tools: [], detail: 'HTTP 401 Unauthorized' }
    expect((await mod.testOldPlatform('c')).detail).toMatch(/not valid for the old platform/i)
  })

  it('passes a non-auth failure through as-is', async () => {
    await mod.setOldPlatformToken('c', 'gnd_x')
    probe = { ok: false, tools: [], detail: 'getaddrinfo ENOTFOUND' }
    expect((await mod.testOldPlatform('c')).detail).toBe('getaddrinfo ENOTFOUND')
  })
})
