/**
 * Story 1.6 MCP host tests: real HTTP smoke (initialize + tool call parity with
 * the engine facade — the one-engine proof, AC6), security posture (origin,
 * token), discovery file lifecycle (chmod 600, cleanup), loud port conflict.
 */
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formatVaultIdentity } from '../shared/identity'
import { discoveryPath } from './discovery'
import * as engine from './engine'
import { bootMcpServer, getMcpStatus, originAllowed, stopMcpServer } from './mcp-server'

const FIXTURE_VAULT = resolve(import.meta.dirname, '../../tests/fixtures/vault')
const TOKEN = 'test-token-0123456789abcdef0123456789abcdef'
const PORT = 52917 // test-only port, away from the preferred 52017

let discoveryDir: string

beforeAll(async () => {
  discoveryDir = mkdtempSync(join(tmpdir(), 'loredex-discovery-'))
  engine.initEngine(FIXTURE_VAULT)
  const status = await bootMcpServer({ port: PORT, token: TOKEN, discoveryDir })
  expect(status.state).toBe('running')
})

afterAll(async () => {
  await stopMcpServer()
  rmSync(discoveryDir, { recursive: true, force: true })
})

function url(): URL {
  return new URL(`http://127.0.0.1:${PORT}/`)
}

describe('origin validation', () => {
  it('allows absent and localhost origins, rejects the rest', () => {
    expect(originAllowed(undefined)).toBe(true)
    expect(originAllowed('http://localhost:5173')).toBe(true)
    expect(originAllowed('http://127.0.0.1:52017')).toBe(true)
    expect(originAllowed('https://evil.example.com')).toBe(false)
    expect(originAllowed('file:///etc/passwd')).toBe(false)
    expect(originAllowed('not a url')).toBe(false)
  })

  it('rejects a cross-site origin with 403 before any MCP handling', async () => {
    const res = await fetch(url(), {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example.com',
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    expect(res.status).toBe(403)
  })
})

describe('bearer token', () => {
  it('rejects a missing or wrong token with 401', async () => {
    const bare = await fetch(url(), { method: 'POST', body: '{}' })
    expect(bare.status).toBe(401)
    const wrong = await fetch(url(), {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong' },
      body: '{}',
    })
    expect(wrong.status).toBe(401)
  })
})

describe('discovery file', () => {
  it('is written chmod 600 with the exact {port, token, engineVersion, schemaVersion} shape', () => {
    const path = discoveryPath(discoveryDir)
    expect(getMcpStatus().discoveryPath).toBe(path)
    const mode = statSync(path).mode & 0o777
    expect(mode).toBe(0o600)
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    expect(Object.keys(parsed).sort()).toEqual(['engineVersion', 'port', 'schemaVersion', 'token'])
    expect(parsed['port']).toBe(PORT)
    expect(parsed['token']).toBe(TOKEN)
    expect(parsed['engineVersion']).toBe(engine.engineVersion())
    expect(parsed['schemaVersion']).toBe(engine.schemaVersion())
  })
})

describe('MCP over real HTTP (one-engine proof)', () => {
  it('initializes, lists tools, and vault_search matches the engine facade + echoes identity', async () => {
    const client = new Client({ name: 'smoke', version: '0.0.1' })
    const transport = new StreamableHTTPClientTransport(url(), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    })
    await client.connect(transport) // runs MCP initialize

    const tools = await client.listTools()
    const names = tools.tools.map((t) => t.name)
    expect(names).toContain('vault_search')
    expect(names).toContain('vault_note')

    const result = await client.callTool({
      name: 'vault_search',
      arguments: { query: 'rate limiting' },
    })
    const text = (result.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n')

    // same engine, same vault: every hit the UI's vault.search returns is in the MCP text
    const hits = engine.search('rate limiting')
    expect(hits.length).toBeGreaterThan(0)
    for (const hit of hits) expect(text).toContain(hit.path)

    // FR14: the response carries the exact badge identity line
    expect(text).toContain(`vault: ${formatVaultIdentity(engine.identity())}`)

    await client.close()
  })
})

describe('loud-failure port policy', () => {
  it('reports port-conflict (never listen(0)) and warns when the port is taken', async () => {
    const squatter = createServer()
    const busyPort = 52918
    await new Promise<void>((r) => squatter.listen(busyPort, '127.0.0.1', () => r()))
    const warnings: string[] = []
    // module hosts a single server: stop the running one first, then re-boot
    await stopMcpServer()
    expect(existsSync(discoveryPath(discoveryDir))).toBe(false) // cleanup on shutdown
    const status = await bootMcpServer({
      port: busyPort,
      token: TOKEN,
      discoveryDir,
      onWarning: (t) => warnings.push(t),
    })
    expect(status.state).toBe('port-conflict')
    expect(status.port).toBeNull()
    expect(status.message).toContain(String(busyPort))
    expect(warnings).toHaveLength(1)
    expect(existsSync(discoveryPath(discoveryDir))).toBe(false) // no stale discovery
    await new Promise<void>((r) => squatter.close(() => r()))
    // restore the running server for any later suites in this file
    await bootMcpServer({ port: PORT, token: TOKEN, discoveryDir })
  })

  it("BL-21: a host that lost the port never deletes the winner's discovery file", async () => {
    // The real setup is two PROCESSES: the main window's core binds and writes
    // the file, a pop-out's core loses the port and writes nothing. Here the
    // module is the pop-out's core: stop it, let a squatter hold the port, and
    // boot into a conflict so `http` stays null — exactly the pop-out's state.
    await stopMcpServer()
    const squatter = createServer()
    await new Promise<void>((r) => squatter.listen(PORT, '127.0.0.1', () => r()))

    // the winner's file, as the main window's core would have left it
    const winnerFile = JSON.stringify({ port: PORT, token: 'winner-token' })
    writeFileSync(discoveryPath(discoveryDir), winnerFile)

    const losing = await bootMcpServer({ port: PORT, token: TOKEN, discoveryDir })
    expect(losing.state).toBe('port-conflict')

    // the pop-out window closes → its core shuts down
    await stopMcpServer()

    // the file must still be the WINNER's: before the guard, this shutdown
    // deleted it and every later pop-out lost its loredex MCP tools
    expect(existsSync(discoveryPath(discoveryDir))).toBe(true)
    expect(readFileSync(discoveryPath(discoveryDir), 'utf8')).toBe(winnerFile)

    await new Promise<void>((r) => squatter.close(() => r()))
    await bootMcpServer({ port: PORT, token: TOKEN, discoveryDir })
  })
})
