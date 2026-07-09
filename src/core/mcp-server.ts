/**
 * In-app MCP host (story 1.6) — loredex-obsidian's LoredexHttpServer pattern
 * ported into the core host: Streamable HTTP, 127.0.0.1 only, per-install
 * bearer token, Origin validation (MCP spec MUST). Stateless: one MCP server +
 * transport per request, so vault state is always fresh and the tools are the
 * exact set the CLI stdio host serves (one engine, F6 by construction).
 *
 * Loud-failure port policy: EADDRINUSE never falls back to listen(0) — it
 * becomes a 'port-conflict' status + git.warning so the sync panel shows it.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { formatVaultIdentity } from '../shared/identity'
import type { McpStatus } from '../shared/types'
import { removeDiscovery, writeDiscovery } from './discovery'
import * as engine from './engine'

export const PREFERRED_MCP_PORT = 52017

/** Absent Origin (CLI/agent clients) or a localhost origin is fine; anything else is rejected. */
export function originAllowed(origin: string | undefined): boolean {
  if (origin === undefined || origin === 'null') return true
  try {
    const { hostname, protocol } = new URL(origin)
    if (protocol !== 'http:' && protocol !== 'https:') return false
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
  } catch {
    return false
  }
}

type ToolResult = { content?: Array<Record<string, unknown>> }
type RegisteredToolLike = { handler?: unknown }

/**
 * FR14: every tool response echoes the vault identity — the same line the
 * chrome badge shows. The SDK has no response middleware, so each registered
 * tool's dispatch-time `handler` is wrapped (guarded: unexpected SDK shapes
 * degrade to no echo rather than break tools).
 */
export function withIdentityEcho(mcp: object, line: string): void {
  const tools = (mcp as { _registeredTools?: Record<string, RegisteredToolLike> })._registeredTools
  if (!tools) return
  for (const tool of Object.values(tools)) {
    const original = tool.handler
    if (typeof original !== 'function') continue
    tool.handler = async (...args: unknown[]): Promise<ToolResult> => {
      const result = (await original.apply(tool, args)) as ToolResult
      if (Array.isArray(result.content)) {
        result.content = [...result.content, { type: 'text', text: `vault: ${line}` }]
      }
      return result
    }
  }
}

interface McpHostOptions {
  port: number
  token: string
  /** override for tests (real runs use ~/.loredex) */
  discoveryDir?: string
}

let http: Server | null = null
let status: McpStatus = {
  state: 'stopped',
  port: null,
  preferredPort: PREFERRED_MCP_PORT,
  portOverride: null,
  message: null,
  discoveryPath: null,
}
let discoveryDirInUse: string | undefined

export function getMcpStatus(): McpStatus {
  return status
}

async function handle(req: IncomingMessage, res: ServerResponse, token: string): Promise<void> {
  try {
    if (!originAllowed(req.headers.origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'forbidden origin' }))
      return
    }
    if ((req.headers.authorization ?? '') !== `Bearer ${token}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }
    if (req.method !== 'POST') {
      // stateless mode: no SSE stream to resume, no sessions to delete
      res.writeHead(405).end()
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))

    const mcp = engine.createMcpServer()
    withIdentityEcho(mcp, formatVaultIdentity(engine.identity()))
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      void transport.close()
      void mcp.close()
    })
    await mcp.connect(transport)
    await transport.handleRequest(req, res, body)
  } catch {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'internal error' }))
    }
  }
}

/**
 * Claim the port (settings override, else 52017), write the discovery file on
 * success. Returns the resulting status; a conflict is reported, never worked
 * around. `onWarning` feeds the git.warning event channel (sync panel).
 */
export async function bootMcpServer(
  opts: McpHostOptions & { portOverride?: number | null; onWarning?: (text: string) => void },
): Promise<McpStatus> {
  if (http) return status
  status = {
    ...status,
    portOverride: opts.portOverride ?? null,
    state: 'stopped',
    message: null,
  }
  const server = createServer((req, res) => {
    void handle(req, res, opts.token)
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(opts.port, '127.0.0.1', () => resolve())
    })
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    const message =
      code === 'EADDRINUSE'
        ? `MCP server port ${opts.port} is already in use — agents cannot reach this vault. Set a different port in Settings and reopen the vault.`
        : `MCP server failed to start on port ${opts.port}: ${e instanceof Error ? e.message : String(e)}`
    status = { ...status, state: 'port-conflict', port: null, message, discoveryPath: null }
    opts.onWarning?.(message)
    return status
  }
  http = server
  discoveryDirInUse = opts.discoveryDir
  const discoveryPath = writeDiscovery(
    {
      port: opts.port,
      token: opts.token,
      engineVersion: engine.engineVersion(),
      schemaVersion: engine.schemaVersion(),
    },
    opts.discoveryDir,
  )
  status = { ...status, state: 'running', port: opts.port, message: null, discoveryPath }
  return status
}

/** Clean shutdown: close the listener and remove the discovery file. */
export async function stopMcpServer(): Promise<void> {
  const server = http
  http = null
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  removeDiscovery(discoveryDirInUse)
  status = { ...status, state: 'stopped', port: null, discoveryPath: null }
}
