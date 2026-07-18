/**
 * ACP agent sessions (acp blueprint 2026-07-18). The core host owns every
 * adapter process (OS-resource rule, terminals.ts is the model): acp.start
 * allocates the id and returns immediately; boot + protocol handshake run
 * async and stream state as acp.* CoreEvents. A prompt turn is an outstanding
 * JSON-RPC request held here for minutes — it never rides an invoke.
 * SECURITY: NEVER log adapter stdout (the ACP wire), stderr (may carry
 * tokens — StderrRing only) or chat content anywhere in this module. Error
 * paths log sessionIds/codes only.
 */
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Readable, Writable } from 'node:stream'
import type {
  AuthMethod,
  ClientConnection,
  ClientContext,
  McpServer,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionModeState,
  SessionNotification,
  ToolCallContent,
  ToolCallLocation,
  Usage,
} from '@agentclientprotocol/sdk'
import {
  type AcpAgent,
  type AcpAuthMethod,
  type AcpSessionState,
  type AcpToolContent,
  type AcpToolLocation,
  type CoreEvent,
  ipcError,
} from '../shared/ipc-contract'
import { spawnAdapter, StderrRing } from './acp-spawn'
import { getMcpStatus } from './mcp-server'
import { mintAgentToken, revokeAgentToken } from './settings'

/** Batch window for acp.chunk — the terminals.ts ~8ms precedent. */
const FLUSH_MS = 8
/** ponytail ceiling: adapters are heavy — each carries a native CLI child. */
const MAX_ACP_SESSIONS = 4

const CANCELLED: RequestPermissionResponse = { outcome: { outcome: 'cancelled' } }

interface AcpSession {
  agent: AcpAgent
  child: ReturnType<typeof spawnAdapter> | null // null until boot spawns it
  connection: ClientConnection | null // sdk connection handle, closed on stop
  agentCtx: ClientContext | null // typed context for agent-side requests
  acpSessionId: string | null // the ADAPTER's session/new id (≠ our id)
  state: AcpSessionState
  stderr: StderrRing
  turnActive: boolean
  cancelling: boolean
  /** chunk batching (terminals.ts flush shape, keyed by role) */
  buf: { role: 'agent' | 'thought'; text: string } | null
  timer: NodeJS.Timeout | null
  pendingPermissions: Map<string, (outcome: RequestPermissionResponse) => void>
  tokenName: string | null // minted MCP agent-token name, revoked on stop
  authMethods: AcpAuthMethod[] | null // from InitializeResponse; attached on the auth path
  emit: (e: CoreEvent) => void
}

/** Module-level registry so handlers.ts and the core cleanup hooks both reach
 *  it without plumbing — one core host per vault means one registry. */
const sessions = new Map<string, AcpSession>()

/** Lazy sdk import (terminals.ts loadPty pattern) so plain-node vitest never
 *  loads it; unit tests vi.mock('@agentclientprotocol/sdk'). */
let sdkModule: typeof import('@agentclientprotocol/sdk') | null = null
async function loadSdk(): Promise<typeof import('@agentclientprotocol/sdk')> {
  if (!sdkModule) sdkModule = await import('@agentclientprotocol/sdk')
  return sdkModule
}

/** clientInfo version — our own package.json (out/main/../../ in a build,
 *  repo root under vitest). Informational only, so a miss degrades quietly. */
function appVersion(): string {
  try {
    const pkg = createRequire(import.meta.url)('../../package.json') as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** JSON-RPC error code off an sdk RequestError without importing the class
 *  (the sdk is lazy-loaded); -32000 is the protocol's "Authentication
 *  required". */
function errCode(err: unknown): number | null {
  const c = (err as { code?: unknown } | null)?.code
  return typeof c === 'number' ? c : null
}

function errFirstLine(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split('\n')[0]
}

/** Bounded error detail: first line of the failure + the stderr tail. */
function errDetail(err: unknown, ring: StderrRing): string {
  const first = errFirstLine(err)
  const tail = ring.tail()
  return tail ? `${first} — ${tail}` : first
}

function flushChunks(sessionId: string): void {
  const s = sessions.get(sessionId)
  if (!s) return
  if (s.timer) {
    clearTimeout(s.timer)
    s.timer = null
  }
  if (!s.buf) return
  const { role, text } = s.buf
  s.buf = null
  s.emit({ kind: 'acp.chunk', sessionId, role, text })
}

function appendChunk(sessionId: string, role: 'agent' | 'thought', text: string): void {
  const s = sessions.get(sessionId)
  if (!s) return
  if (s.buf && s.buf.role === role) {
    s.buf.text += text
  } else {
    flushChunks(sessionId) // role changed — earlier run lands first
    s.buf = { role, text }
  }
  if (!s.timer) s.timer = setTimeout(() => flushChunks(sessionId), FLUSH_MS)
}

/** Answer every held permission request — the protocol requires a response;
 *  a dead/cancelled session default-rejects (outcome 'cancelled'). */
function cancelPendingPermissions(s: AcpSession): void {
  for (const resolve of s.pendingPermissions.values()) resolve(CANCELLED)
  s.pendingPermissions.clear()
}

function revokeToken(s: AcpSession): void {
  if (!s.tokenName) return
  try {
    revokeAgentToken(s.tokenName)
  } catch {
    // best-effort — a leaked name stays visible/revocable in Settings
  }
  s.tokenName = null
}

/** Long-job law made literal: allocate + return sync; boot streams the rest. */
export function acpStart(
  emit: (e: CoreEvent) => void,
  arg: { agent: AcpAgent; cwd: string },
): { sessionId: string } {
  let isDir = false
  try {
    isDir = statSync(arg.cwd).isDirectory()
  } catch {
    isDir = false // missing/unreadable path — same envelope as a file path
  }
  if (!isDir) {
    // the path never rides the message; detail carries it for debugging
    throw ipcError('ACP_CWD_INVALID', 'agent cwd is not a directory', { cwd: arg.cwd })
  }
  if (sessions.size >= MAX_ACP_SESSIONS) {
    throw ipcError('INTERNAL', `agent session limit reached (${MAX_ACP_SESSIONS})`)
  }
  const sessionId = randomUUID()
  const s: AcpSession = {
    agent: arg.agent,
    child: null,
    connection: null,
    agentCtx: null,
    acpSessionId: null,
    state: 'starting',
    stderr: new StderrRing(),
    turnActive: false,
    cancelling: false,
    buf: null,
    timer: null,
    pendingPermissions: new Map(),
    tokenName: null,
    authMethods: null,
    emit,
  }
  sessions.set(sessionId, s)
  emit({ kind: 'acp.session', sessionId, agent: arg.agent, state: 'starting' })
  void boot(sessionId, arg.agent, arg.cwd).catch((err) => {
    const cur = sessions.get(sessionId)
    if (!cur) return // stopped/reaped across the async gap
    // Delete-then-kill so the child 'exit' handler no-ops; the child dies in
    // BOTH terminal states — auth_required recovery is "log in via the
    // embedded terminal, start a new session" (v1 ceiling: no authenticate
    // flow, keeping a half-booted adapter alive buys nothing).
    sessions.delete(sessionId)
    if (cur.timer) clearTimeout(cur.timer)
    cancelPendingPermissions(cur)
    cur.connection?.close()
    cur.child?.kill()
    revokeToken(cur)
    if (errCode(err) === -32000) {
      cur.state = 'auth_required'
      emit({
        kind: 'acp.session',
        sessionId,
        agent: arg.agent,
        state: 'auth_required',
        detail: errFirstLine(err), // the adapter's own words; renderer adds the login hint
        // captured from initialize before session/new rejected — Phase-2 login
        ...(cur.authMethods ? { authMethods: cur.authMethods } : {}),
      })
    } else {
      cur.state = 'error'
      emit({
        kind: 'acp.session',
        sessionId,
        agent: arg.agent,
        state: 'error',
        detail: errDetail(err, cur.stderr),
      })
    }
  })
  return { sessionId }
}

/** Spawn → ndJsonStream → sdk client → initialize → session/new → 'ready'.
 *  Every await is followed by a liveness guard: acpStop can land mid-boot. */
async function boot(sessionId: string, agent: AcpAgent, cwd: string): Promise<void> {
  const s = sessions.get(sessionId)
  if (!s) return
  const child = spawnAdapter(agent, cwd)
  s.child = child
  child.stderr.on('data', (chunk: Buffer) => s.stderr.push(chunk))
  // spawn failure fires 'error', not 'exit' — unhandled it would CRASH the
  // core host (EventEmitter throw). Same guard-then-delete shape as 'exit'.
  child.on('error', (err) => {
    const cur = sessions.get(sessionId)
    if (!cur) return
    cur.state = 'error'
    sessions.delete(sessionId)
    if (cur.timer) clearTimeout(cur.timer)
    cancelPendingPermissions(cur)
    revokeToken(cur)
    cur.emit({
      kind: 'acp.session',
      sessionId,
      agent,
      state: 'error',
      detail: err.message.split('\n')[0],
    })
  })
  child.on('exit', () => {
    const cur = sessions.get(sessionId)
    if (!cur) return // acpStop deleted first — its kill triggered this exit
    flushChunks(sessionId) // pending output lands BEFORE the exit event
    cur.state = 'exited'
    sessions.delete(sessionId)
    if (cur.timer) clearTimeout(cur.timer)
    cancelPendingPermissions(cur) // default-reject on session death
    revokeToken(cur)
    cur.emit({
      kind: 'acp.session',
      sessionId,
      agent,
      state: 'exited',
      detail: cur.stderr.tail() || undefined,
    })
  })
  // The ACP wire: newline-delimited JSON over the child's stdio. Types ride
  // the node→web bridge.
  const sdk = await loadSdk()
  if (!sessions.has(sessionId)) return
  const stream = sdk.ndJsonStream(
    Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
    Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
  )
  const connection = sdk
    .client({ name: 'loredex' })
    .onNotification(sdk.methods.client.session.update, (ctx) => routeUpdate(sessionId, ctx.params))
    .onRequest(sdk.methods.client.session.requestPermission, (ctx) =>
      routePermission(sessionId, ctx.params),
    )
    .connect(stream)
  s.connection = connection
  s.agentCtx = connection.agent
  // v1 capability minimalism: no fs, no terminal caps — both adapters then
  // self-service file IO and run their own commands. Agent-written .md files
  // ride the vault watcher; non-.md writes produce NO vault.changed
  // (watcher filters to .md) — accepted v1 ceiling.
  const init = await connection.agent.request(sdk.methods.agent.initialize, {
    protocolVersion: sdk.PROTOCOL_VERSION,
    // auth: {} makes adapters return authMethods (captured for the Phase-2
    // login UI). The ONLY handshake change — still no fs/terminal caps (v1).
    clientCapabilities: { auth: {} },
    clientInfo: { name: 'loredex', version: appVersion() },
  })
  // capture BEFORE the liveness guard so the -32000 catch has it even if the
  // session is torn down across the next await
  if (init.authMethods) s.authMethods = init.authMethods.map(mapAuthMethod)
  if (!sessions.has(sessionId)) return
  // MCP auto-attach: core-local server + adapter http support → one bearer
  // minted per session, attributed in the Agents view. The token never
  // crosses the renderer seam.
  const httpOk = init.agentCapabilities?.mcpCapabilities?.http === true
  const mcp = getMcpStatus()
  let mcpServers: McpServer[] = []
  if (httpOk && mcp.state === 'running' && mcp.port !== null) {
    s.tokenName = `acp:${agent}:${sessionId.slice(0, 8)}`
    mcpServers = [
      {
        type: 'http',
        name: 'loredex',
        url: `http://127.0.0.1:${mcp.port}/`,
        headers: [{ name: 'Authorization', value: `Bearer ${mintAgentToken(s.tokenName)}` }],
      },
    ]
  }
  const created = await connection.agent.request(sdk.methods.agent.session.new, {
    cwd,
    mcpServers,
  })
  if (!sessions.has(sessionId)) return
  s.acpSessionId = created.sessionId
  s.state = 'ready'
  // surface the attached MCP servers on ready — name/url ONLY. The headers
  // array carries the per-session bearer token and MUST NOT reach the renderer,
  // so it is never mapped here (A7 security invariant).
  const attachedMcp = mcpServers.map((m) => ({
    name: m.name,
    ...('url' in m && m.url ? { url: m.url } : {}),
  }))
  s.emit({
    kind: 'acp.session',
    sessionId,
    agent,
    state: 'ready',
    ...(attachedMcp.length ? { mcpServers: attachedMcp } : {}),
  })
  // initial modes (NewSessionResponse.modes) — the full set + current id, so
  // the session-info view can render the switcher without waiting for a change
  if (created.modes) s.emit(mapModeState(sessionId, created.modes))
}

/** InitializeResponse authMethod → the captured shape (Phase-2 login). `type`
 *  is the union discriminator ('env_var'/'terminal'); the default agent method
 *  carries none. */
function mapAuthMethod(m: AuthMethod): AcpAuthMethod {
  const type = (m as { type?: string }).type
  return {
    id: m.id,
    name: m.name,
    ...(m.description != null ? { description: m.description } : {}),
    ...(type ? { type } : {}),
  }
}

/** NewSessionResponse.modes (SessionModeState) → the initial acp.mode event. */
function mapModeState(sessionId: string, modes: SessionModeState): CoreEvent {
  return {
    kind: 'acp.mode',
    sessionId,
    currentModeId: modes.currentModeId,
    availableModes: modes.availableModes.map((m) => ({
      id: m.id,
      name: m.name,
      ...(m.description != null ? { description: m.description } : {}),
    })),
  }
}

/** ToolCall/ToolCallUpdate.content → AcpToolContent[]: diffs and text survive,
 *  terminal + non-text content blocks are dropped. Undefined when nothing maps
 *  (so the event stays clean and the renderer renders no diff panel). */
function mapToolContent(
  content: Array<ToolCallContent> | null | undefined,
): AcpToolContent[] | undefined {
  if (!content) return undefined
  const out: AcpToolContent[] = []
  for (const c of content) {
    if (c.type === 'diff') {
      out.push({
        kind: 'diff',
        path: c.path,
        ...(c.oldText != null ? { oldText: c.oldText } : {}),
        newText: c.newText,
      })
    } else if (c.type === 'content' && c.content.type === 'text') {
      out.push({ kind: 'text', text: c.content.text })
    }
    // type 'terminal' + non-text content blocks (image/audio/resource) → skip
  }
  return out.length ? out : undefined
}

/** ToolCall/ToolCallUpdate.locations → AcpToolLocation[] (ABSOLUTE paths). */
function mapToolLocations(
  locations: Array<ToolCallLocation> | null | undefined,
): AcpToolLocation[] | undefined {
  if (!locations || locations.length === 0) return undefined
  return locations.map((l) => ({ path: l.path, ...(l.line != null ? { line: l.line } : {}) }))
}

/** PromptResponse.usage (Usage) → the acp.usage turn half. `cached` = cache
 *  READ tokens (the cost-savings figure); cachedWriteTokens is dropped (one
 *  display field — v1 ceiling). */
function mapTurnUsage(u: Usage): {
  total: number
  input: number
  output: number
  cached?: number
  thought?: number
} {
  return {
    total: u.totalTokens,
    input: u.inputTokens,
    output: u.outputTokens,
    ...(u.cachedReadTokens != null ? { cached: u.cachedReadTokens } : {}),
    ...(u.thoughtTokens != null ? { thought: u.thoughtTokens } : {}),
  }
}

/** What one session/update maps to: a batched chunk, an immediate CoreEvent
 *  (caller flushes chunks first — ordering law), or nothing. */
export type UpdateAction =
  | { act: 'chunk'; role: 'agent' | 'thought'; text: string }
  | { act: 'event'; event: CoreEvent }
  | { act: 'ignore' }

/** Pure protocol→event mapping for session/update — exported for unit tests
 *  (the batching/emit side effects stay in routeUpdate). Unknown variants map
 *  to 'ignore' defensively: the sdk union is open-ended and a crash here would
 *  take the whole session down for cosmetic data. */
export function mapUpdate(sessionId: string, update: SessionNotification['update']): UpdateAction {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
    case 'agent_thought_chunk': {
      // text ContentBlocks only — non-text blocks dropped in v1
      if (update.content.type !== 'text') return { act: 'ignore' }
      return {
        act: 'chunk',
        role: update.sessionUpdate === 'agent_thought_chunk' ? 'thought' : 'agent',
        text: update.content.text,
      }
    }
    case 'tool_call':
    case 'tool_call_update': {
      const content = mapToolContent(update.content)
      const locations = mapToolLocations(update.locations)
      return {
        act: 'event',
        event: {
          kind: 'acp.tool',
          sessionId,
          toolCallId: update.toolCallId,
          title: update.title ?? undefined,
          toolKind: update.kind ?? undefined,
          status: update.status ?? undefined,
          ...(content ? { content } : {}),
          ...(locations ? { locations } : {}),
        },
      }
    }
    case 'available_commands_update':
      return {
        act: 'event',
        event: {
          kind: 'acp.commands',
          sessionId,
          commands: update.availableCommands.map((c) => ({
            name: c.name,
            description: c.description,
            ...(c.input?.hint ? { hint: c.input.hint } : {}),
          })),
        },
      }
    case 'current_mode_update':
      // only the id changed — the full set arrived with the initial acp.mode
      return {
        act: 'event',
        event: { kind: 'acp.mode', sessionId, currentModeId: update.currentModeId },
      }
    case 'usage_update':
      // context half: window fill + cumulative cost (turn half rides acpPrompt)
      return {
        act: 'event',
        event: {
          kind: 'acp.usage',
          sessionId,
          context: { used: update.used, size: update.size },
          ...(update.cost
            ? { cost: { amount: update.cost.amount, currency: update.cost.currency } }
            : {}),
        },
      }
    case 'plan':
      return {
        act: 'event',
        event: {
          kind: 'acp.plan',
          sessionId,
          entries: update.entries.map((e) => ({
            content: e.content,
            priority: e.priority,
            status: e.status,
          })),
        },
      }
    default:
      // user_message_chunk (we render the submitted text ourselves),
      // plan_update/plan_removed, config_option_update, session_info_update and
      // any future/unstable variants — deliberately ignored. Unknown variants
      // must map here (never throw): a crash would kill the session for cosmetic
      // data. The sdk union is open-ended.
      return { act: 'ignore' }
  }
}

function routeUpdate(sessionId: string, note: SessionNotification): void {
  const s = sessions.get(sessionId)
  if (!s) return
  const action = mapUpdate(sessionId, note.update)
  if (action.act === 'chunk') {
    appendChunk(sessionId, action.role, action.text)
  } else if (action.act === 'event') {
    flushChunks(sessionId) // ordering law: chunks land BEFORE the tool/plan row
    s.emit(action.event)
  }
}

/** Pure request→event mapping for session/request_permission — exported for
 *  unit tests. Options ride through verbatim, ordered as received; NO
 *  auto-allow of any kind. */
export function mapPermissionEvent(
  sessionId: string,
  requestId: string,
  params: RequestPermissionRequest,
): CoreEvent {
  // the proposed change rides toolCall.content/locations (same ToolCallUpdate
  // shape a tool_call carries) — A3 surfaces the before/after diff in the modal
  const content = mapToolContent(params.toolCall.content)
  const locations = mapToolLocations(params.toolCall.locations)
  return {
    kind: 'acp.permission',
    sessionId,
    requestId,
    title: params.toolCall.title ?? 'Tool call',
    toolKind: params.toolCall.kind ?? undefined,
    options: params.options.map((o) => ({ optionId: o.optionId, name: o.name, kind: o.kind })),
    ...(content ? { content } : {}),
    ...(locations ? { locations } : {}),
  }
}

/** session/request_permission — the returned Promise is held until the
 *  renderer answers via acp.permission (or the session dies → default
 *  reject). NO auto-allow of any kind. */
function routePermission(
  sessionId: string,
  params: RequestPermissionRequest,
): Promise<RequestPermissionResponse> {
  const s = sessions.get(sessionId)
  if (!s) return Promise.resolve(CANCELLED) // session death default-rejects
  // A request the adapter already put on the wire can land AFTER acpCancel ran
  // (it was not yet in pendingPermissions, so cancelPendingPermissions missed
  // it). Auto-reject it instead of surfacing a stale modal for a turn the user
  // already Stopped — an ignored modal would block the turn forever. cancelling
  // is reset at the next acpPrompt, so a fresh turn surfaces normally.
  if (s.cancelling) return Promise.resolve(CANCELLED)
  const requestId = randomUUID()
  flushChunks(sessionId) // ordering law: chunks land BEFORE the request
  s.emit(mapPermissionEvent(sessionId, requestId, params))
  return new Promise((resolve) => {
    s.pendingPermissions.set(requestId, resolve)
  })
}

/** Fire-and-forget the minutes-long session/prompt request; the turn closes
 *  with an acp.turnEnd event (long-job law — never an invoke result). */
export function acpPrompt(sessionId: string, text: string): void {
  const s = sessions.get(sessionId)
  if (!s) throw ipcError('ACP_UNKNOWN', 'unknown agent session')
  if (s.state !== 'ready' || !s.agentCtx || !s.acpSessionId) {
    throw ipcError('ACP_NOT_READY', 'agent session is not ready')
  }
  if (s.turnActive) throw ipcError('ACP_BUSY', 'a turn is already in flight')
  s.turnActive = true
  s.cancelling = false
  // ceiling: one turn in flight per session (ACP_BUSY above)
  const sdk = sdkModule! // state 'ready' implies boot loaded it
  void s.agentCtx
    .request(sdk.methods.agent.session.prompt, {
      sessionId: s.acpSessionId,
      prompt: [{ type: 'text', text }],
    })
    .then((res) => {
      const cur = sessions.get(sessionId)
      if (!cur) return
      flushChunks(sessionId)
      cur.turnActive = false
      // turn-half usage (best-effort, @experimental) lands BEFORE turnEnd so the
      // renderer folds it in as the turn closes; codex may omit it entirely
      if (res.usage) cur.emit({ kind: 'acp.usage', sessionId, turn: mapTurnUsage(res.usage) })
      cur.emit({ kind: 'acp.turnEnd', sessionId, stopReason: res.stopReason })
    })
    .catch((err: unknown) => {
      const cur = sessions.get(sessionId)
      if (!cur) return // stopped/exited — the session event already told the story
      flushChunks(sessionId)
      cur.turnActive = false
      if (errCode(err) === -32000) {
        // token expired mid-flight — same recovery as boot: log in, new session
        cur.state = 'auth_required'
        cur.emit({
          kind: 'acp.session',
          sessionId,
          agent: cur.agent,
          state: 'auth_required',
          detail: errFirstLine(err),
        })
      } else if (!cur.cancelling) {
        // a deliberate cancel may surface as a rejected prompt on some
        // adapters — that is not an error, the turnEnd below is the answer
        cur.state = 'error'
        cur.emit({
          kind: 'acp.session',
          sessionId,
          agent: cur.agent,
          state: 'error',
          detail: errDetail(err, cur.stderr),
        })
      }
      cur.emit({ kind: 'acp.turnEnd', sessionId, stopReason: 'cancelled' })
    })
}

/** Renderer's answer to an acp.permission event. Unknown requestId is a
 *  no-op — the turn may have been cancelled across the invoke (termKill's
 *  idempotence rule). optionId null = dismissed = rejected. */
export function acpPermission(
  sessionId: string,
  requestId: string,
  optionId: string | null,
): void {
  const s = sessions.get(sessionId)
  if (!s) throw ipcError('ACP_UNKNOWN', 'unknown agent session')
  const resolve = s.pendingPermissions.get(requestId)
  if (!resolve) return
  s.pendingPermissions.delete(requestId)
  resolve(optionId === null ? CANCELLED : { outcome: { outcome: 'selected', optionId } })
}

/** session/cancel notification; the outstanding prompt then resolves with
 *  stopReason 'cancelled' → normal turnEnd path. Unknown id no-op. */
export function acpCancel(sessionId: string): void {
  const s = sessions.get(sessionId)
  if (!s) return
  s.cancelling = true
  // protocol requirement: answer EVERY pending permission before cancelling
  cancelPendingPermissions(s)
  if (s.agentCtx && s.acpSessionId && sdkModule) {
    void s.agentCtx
      .notify(sdkModule.methods.agent.session.cancel, { sessionId: s.acpSessionId })
      .catch(() => {
        // connection may be mid-teardown — the child exit path reports that
      })
  }
}

/** session/set_mode (A7): switch the agent's operating mode. Keyed by OUR
 *  sessionId; the ADAPTER's id rides the request. The adapter may confirm via
 *  a current_mode_update (→ acp.mode) — we don't emit optimistically here (the
 *  renderer does that). Unknown / not-ready throws the same envelopes as
 *  acpPrompt so a stale UI can't wedge the session. */
export async function acpSetMode(sessionId: string, modeId: string): Promise<void> {
  const s = sessions.get(sessionId)
  if (!s) throw ipcError('ACP_UNKNOWN', 'unknown agent session')
  if (s.state !== 'ready' || !s.agentCtx || !s.acpSessionId) {
    throw ipcError('ACP_NOT_READY', 'agent session is not ready')
  }
  const sdk = sdkModule! // state 'ready' implies boot loaded it
  await s.agentCtx.request(sdk.methods.agent.session.setMode, {
    sessionId: s.acpSessionId,
    modeId,
  })
}

/** Idempotent: stop can race the adapter's own exit — unknown id is a no-op.
 *  Delete from the map FIRST so the child 'exit' handler no-ops. */
export function acpStop(sessionId: string, silent = false): void {
  const s = sessions.get(sessionId)
  if (!s) return
  sessions.delete(sessionId)
  if (s.timer) clearTimeout(s.timer)
  cancelPendingPermissions(s)
  s.connection?.close()
  s.child?.kill()
  revokeToken(s)
  if (!silent) {
    s.emit({ kind: 'acp.session', sessionId, agent: s.agent, state: 'exited' })
  }
}

/** Quit hook + port-reattach reap (core/index.ts, beside killAllTerminals):
 *  leave no orphan adapters. silent=true from the cleanup sites — a dying
 *  core / ownerless renderer has nobody listening. */
export function killAllAcpSessions(silent = false): void {
  for (const id of [...sessions.keys()]) acpStop(id, silent)
}
