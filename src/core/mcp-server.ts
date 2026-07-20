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

// ── MCP request log (DESIGN v3 §6.5 / §8 session telemetry) ────────────────
// Read-only, in-memory ring: what agents asked this dex, newest last. Zero
// engine writes — the Agents view renders it verbatim.

export interface McpLogEntry {
  /** ISO time the request arrived */
  at: string
  /** 'initialize' (a client connecting) or the tool name of a tools/call */
  kind: 'initialize' | 'tool'
  name: string
  /** MCP clientInfo.name when the request carries one (initialize) */
  client?: string
  /** per-agent token attribution (story 26.9); absent = the install token */
  agent?: string
}

const MCP_LOG_MAX = 200
const mcpLog: McpLogEntry[] = []

export function mcpRequestLog(): McpLogEntry[] {
  return [...mcpLog]
}

/** test seam */
export function clearMcpRequestLog(): void {
  mcpLog.length = 0
}

function push(entry: McpLogEntry): void {
  mcpLog.push(entry)
  if (mcpLog.length > MCP_LOG_MAX) mcpLog.splice(0, mcpLog.length - MCP_LOG_MAX)
}

/** Record what an authorized JSON-RPC body asks (single or batch). */
export function recordMcpRequest(
  body: unknown,
  at = new Date().toISOString(),
  agent?: string,
): void {
  for (const msg of Array.isArray(body) ? body : [body]) {
    const m = msg as { method?: string; params?: { name?: string; clientInfo?: { name?: string } } }
    const tag = agent ? { agent } : {}
    if (m?.method === 'initialize') {
      const client = m.params?.clientInfo?.name
      push({ at, kind: 'initialize', name: 'initialize', ...(client ? { client } : {}), ...tag })
    } else if (m?.method === 'tools/call' && typeof m.params?.name === 'string') {
      push({ at, kind: 'tool', name: m.params.name, ...tag })
    }
  }
}

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

/** Parity slice C: the "Expose write tools" switch — strip dex-writing verbs
 *  from a server instance (read tools stay). Same _registeredTools seam as
 *  the identity echo below; guarded for unexpected SDK shapes. */
export const WRITE_TOOLS = ['vault_store', 'handoff_consume', 'work_claim', 'work_update', 'work_done'] as const

export function stripWriteTools(mcp: object): void {
  const tools = (mcp as { _registeredTools?: Record<string, unknown> })._registeredTools
  if (!tools) return
  for (const name of WRITE_TOOLS) delete tools[name]
}

/**
 * Our own host's tool names, enumerated from a FRESH server instance via the
 * same `_registeredTools` seam stripWriteTools uses — never a hardcoded array,
 * which would drift as tools are added.
 *
 * There is no long-lived server to read: this host is stateless and builds one
 * MCP server per request (see `handle` below), so the inventory builds its own
 * throwaway instance and mirrors the write-tools switch, making the list match
 * what a session actually gets. Never throws — no config yet (vault picker
 * pending) is an empty list, not a broken Settings page.
 */
export function loredexToolNames(writeTools: boolean): string[] {
  try {
    // held as `object` so the private-field read below is the same widening
    // seam stripWriteTools takes — a direct cast off McpServer is a type error
    const mcp: object = engine.createMcpServer()
    if (!writeTools) stripWriteTools(mcp)
    const tools = (mcp as { _registeredTools?: Record<string, unknown> })._registeredTools
    return tools ? Object.keys(tools).sort() : []
  } catch {
    return []
  }
}

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
  /** read live so the Settings switch applies without a restart */
  writeTools?: () => boolean
  /** per-agent bearer tokens (story 26.9): name → token, read live so mints
   *  apply without a restart */
  agentTokens?: () => Record<string, string>
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

/** Which agent a bearer belongs to: install token → null (unattributed),
 *  a minted per-agent token → its name, anything else → 'reject'. */
export function resolveBearer(
  header: string,
  installToken: string,
  agentTokens: Record<string, string>,
): { agent: string | null } | 'reject' {
  if (header === `Bearer ${installToken}`) return { agent: null }
  for (const [name, token] of Object.entries(agentTokens)) {
    if (header === `Bearer ${token}`) return { agent: name }
  }
  return 'reject'
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  token: string,
  agentTokens: () => Record<string, string>,
  writeTools: () => boolean = () => true,
): Promise<void> {
  try {
    if (!originAllowed(req.headers.origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'forbidden origin' }))
      return
    }
    const who = resolveBearer(req.headers.authorization ?? '', token, agentTokens())
    if (who === 'reject') {
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
    // §6.5 session telemetry — after auth, before dispatch; per-agent when
    // the bearer was a minted agent token (story 26.9)
    recordMcpRequest(body, undefined, who.agent ?? undefined)

    const mcp = engine.createMcpServer()
    if (writeTools() === false) stripWriteTools(mcp)
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
  const agentTokens = opts.agentTokens ?? (() => ({}))
  const writeTools = opts.writeTools ?? (() => true)
  const server = createServer((req, res) => {
    void handle(req, res, opts.token, agentTokens, writeTools)
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

/**
 * Stop the current host (if any) and boot again with fresh opts — the Settings
 * "Apply & retry" path. Lets a user rebind after a port conflict clears, or
 * move to a new port, without relaunching the app.
 */
export async function restartMcpServer(
  opts: McpHostOptions & { portOverride?: number | null; onWarning?: (text: string) => void },
): Promise<McpStatus> {
  await stopMcpServer()
  return bootMcpServer(opts)
}

/**
 * Clean shutdown: close the listener and remove the discovery file.
 *
 * BL-21: the removal is guarded on `server` — only a host that actually BOUND
 * ever wrote the file. A pop-out's core loses the race for the fixed port
 * (state 'port-conflict', nothing written), and it used to delete the file on
 * close anyway. That is the MAIN window's file, and the discovery file is the
 * only way a secondary host reaches the loredex MCP — so closing one pop-out
 * silently stripped MCP tools from every pop-out opened afterwards.
 */
export async function stopMcpServer(): Promise<void> {
  const server = http
  http = null
  if (!server) {
    // never bound → never wrote → not ours to delete
    status = { ...status, state: 'stopped', port: null, discoveryPath: null }
    return
  }
  await new Promise<void>((resolve) => server.close(() => resolve()))
  removeDiscovery(discoveryDirInUse)
  status = { ...status, state: 'stopped', port: null, discoveryPath: null }
}
