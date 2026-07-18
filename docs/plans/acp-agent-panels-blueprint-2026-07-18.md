# Blueprint: ACP agent panels (Claude Code + Codex inside Loredex)

2026-07-18. Implements Part 2 of `docs/research/embedded-terminal-and-agent-panels-2026-07-18.md`.
Four ordered build agents. Each section lists exact files, signatures, insertion points, and acceptance checks.
Minimal v1 — deliberate deferrals listed at the end. The shipped `term.*` family
(`src/core/terminals.ts` + `src/renderer/src/stores/terminal.ts`) is the model for every
pattern here; when in doubt, copy it.

## Global decisions (read first, all agents)

- **Protocol client**: `@agentclientprotocol/sdk@1.2.1` (exact pin) — the same lib both
  official adapters depend on, so wire types match bit-for-bit. Adapters are **dependencies,
  never npx-at-runtime**: `@agentclientprotocol/claude-agent-acp@0.59.0` and
  `@agentclientprotocol/codex-acp@1.1.4`, exact pins (they release weekly — upgrades are
  deliberate). The sdk peer-deps zod `^3.25||^4`; add `zod@^4.4.3` (dedupes with the
  vendored loredex engine's `zod ^4.4.3`).
- **Runtime for adapters**: claude-agent-acp requires node ≥22; the user's system node may
  be v20. Spawn adapters as `process.execPath` (the Electron binary — the core host is a
  utilityProcess fork of it) with `ELECTRON_RUN_AS_NODE: '1'` in the child env. Electron
  43.1.0 embeds Node 24 — never rely on the user's node.
- **Long-job law shape**: `acp.start` allocates the sessionId core-side (`randomUUID()`,
  terminals.ts:80 pattern) and **returns `{ sessionId }` immediately**; spawn + `initialize`
  + `session/new` run async and stream state as `acp.session` CoreEvents. This survives slow
  adapter boots and the codex unauthenticated path without ever touching the 10s invoke
  timeout (`src/shared/ipc-client.ts:29`). `acp.prompt` likewise returns void immediately;
  the outstanding `session/prompt` JSON-RPC request (minutes-long) lives in the core host and
  the turn closes with an `acp.turnEnd` event carrying the stopReason.
- **v1 capability minimalism** (verified against adapter source): `initialize` advertises
  `clientCapabilities: {}` — **no fs, no terminal, no experimental caps** — plus
  `clientInfo: { name: 'loredex', version: <app version> }`. Consequences, documented here
  once: both adapters then self-service file IO (claude via the Agent SDK's own Read/Write/
  Edit tools, codex via its sandbox) and run their own commands (reported as `tool_call`
  `kind: "execute"` rows). Agent-written `.md` files are picked up by the vault watcher
  automatically; **non-`.md` writes produce NO `vault.changed`** (watcher.ts:59 filters to
  `.md`) — accepted v1 ceiling, noted in code. We still receive diff-shaped tool content, we
  just don't render diffs in v1 (deferred). We MUST serve `session/update` and
  `session/request_permission` — failing to answer a permission request stalls the turn.
- **Auth is graceful, never a crash**: v1 never calls `authenticate`. Any JSON-RPC error
  code **-32000 "Authentication required"** (from `session/new` or mid-turn) transitions the
  session to state `auth_required` with the adapter's message as `detail`; the panel renders
  it with a per-agent hint ("run `claude /login` / `codex login` in the terminal" — we ship
  an embedded terminal). Codex on this class of machine usually has `~/.codex/auth.json` and
  just works; tokens expire, so the path must exist.
- **MCP auto-attach: YES** — everything needed is core-local. If `getMcpStatus()` reports a
  running server AND the adapter's `initialize` result has `mcpCapabilities.http === true`
  (verified true for both adapters), `session/new` gets
  `mcpServers: [{ type: 'http', name: 'loredex', url: 'http://127.0.0.1:<port>/', headers:
  [{ name: 'Authorization', value: 'Bearer <token>' }] }]` where token =
  `mintAgentToken('acp:<agent>:<sessionId8>')` — the session shows attributed in the Agents
  view telemetry, and the token never crosses the renderer seam. `revokeAgentToken` on
  session stop (best-effort; leaked names stay visible/revocable in Settings). Server not
  running → `mcpServers: []` (the field is required by the protocol, empty is legal).
- **Security laws**: adapter stdout is the protocol — never logged. stderr may carry
  tokens/URLs — kept ONLY in a per-session ring buffer (last 4 KB), surfaced as a 4-line
  tail on error (engine.ts:357–365 pattern), never logged wholesale (terminals.ts:5–8 rule).
  Env for spawned adapters is an **explicit allowlist** (the opposite of terminals.ts:78's
  full inherit, which is correct only for the user's own shell). Chat text/chunks never hit
  console/log either.
- **Ceilings** (each gets a short code comment): `MAX_ACP_SESSIONS = 4` (adapters are heavy
  — a native CLI child each); one turn in flight per session (`ACP_BUSY` otherwise); one
  agent bubble grows per contiguous chunk run (no messageId bubble-splitting); chunks render
  as plain text `white-space: pre-wrap` (markdown rendering deferred); panel width fixed at
  340px (persisted field exists, drag deferred).
- **Packaging**: both adapters ship native binaries (`@anthropic-ai/claude-agent-sdk-darwin-*`
  optional deps, `@openai/codex`) — executables can't run from inside app.asar, so
  electron-builder must `asarUnpack` them (node-pty precedent, electron-builder.yml:19).
- **Lifecycle**: sessions die with their adapter process. `killAllAcpSessions()` joins BOTH
  core cleanup sites — the `process.on('exit')` hook (core/index.ts:223) and the
  `portAttached` reap (core/index.ts:254). Vault switch kills the whole core host
  (main/index.ts applyVault), so core-side vault cleanup is free; the renderer store's
  `reset()` joins App.tsx's `onVaultChanged` block like every other store.
- **Keybinding**: panel toggle is `⌘J` (`combo: { key: 'j', meta: true }`) — free in the
  registry, VS Code panel muscle memory, and `meta` matches ⌘ OR ⌃ per shortcuts.ts:44.
- **SDK API surface note for Agent 2**: the map of the modern client API
  (`client({ name }).onRequest(...).onNotification(...).connect(stream)`, requests via
  `ctx.request(methods.agent.…)`, `ndJsonStream(output, input)`, `RequestError` with
  `authRequired` = -32000, `PROTOCOL_VERSION = 1`) was verified against the published 1.2.1
  tarball — but **confirm exact method/builder names against the installed
  `node_modules/@agentclientprotocol/sdk/dist/*.d.ts` before writing code**. The deprecated
  `ClientSideConnection(toClient, stream)` legacy API is the fallback if the modern builder
  differs.

---

## Agent 1 — deps, adapter spawn plumbing, contract family

### 1.1 `package.json` — dependencies

Add to `dependencies` (exact pins except zod):

```json
"@agentclientprotocol/sdk": "1.2.1",
"@agentclientprotocol/claude-agent-acp": "0.59.0",
"@agentclientprotocol/codex-acp": "1.1.4",
"zod": "^4.4.3"
```

Run `npm install`. Do NOT touch `engines` (the adapters run under Electron's embedded node,
not the user's).

### 1.2 `electron-builder.yml` — asarUnpack

Extend the existing `asarUnpack` block (line 19) — the adapters and their native binaries
must be spawnable from disk:

```yaml
asarUnpack:
  - '**/node_modules/node-pty/**'
  # ACP agent panels: adapter entry JS + native claude/codex binaries are
  # spawned as real processes — nothing executable can live inside app.asar.
  - '**/node_modules/@agentclientprotocol/**'
  - '**/node_modules/@anthropic-ai/claude-agent-sdk*/**'
  - '**/node_modules/@openai/codex/**'
```

### 1.3 `src/shared/ipc-contract.ts` — the `acp.*` family

**Shared types** — add near the other exported unions (e.g. above the CoreApi map):

```ts
/** ACP agent panels (acp blueprint 2026-07-18) */
export type AcpAgent = 'claude' | 'codex'
export type AcpSessionState = 'starting' | 'ready' | 'auth_required' | 'error' | 'exited'
export interface AcpPermissionOption {
  optionId: string
  name: string
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'
}
export interface AcpPlanEntry {
  content: string
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'in_progress' | 'completed'
}
```

**Invoke half** — insert directly after `'settings.terminal.set'` (line 305), with the
governing comment:

```ts
/** ACP agent panels (acp blueprint 2026-07-18): adapter processes live in the
 *  CORE HOST. All acp.* invokes are cheap — acp.start allocates the id and
 *  returns before the adapter finishes booting; a prompt turn is an
 *  outstanding JSON-RPC request held core-side for minutes and must NEVER
 *  ride an invoke. Session state, chunks, tool calls, permission requests
 *  and turn ends all stream as CoreEvents. cwd omitted → open vault root. */
'acp.start': { in: { agent: AcpAgent; cwd?: string }; out: { sessionId: string } }
'acp.prompt': { in: { sessionId: string; text: string }; out: void }
'acp.cancel': { in: { sessionId: string }; out: void }
/** optionId null = dismissed → outcome 'cancelled' (dismissing is rejecting) */
'acp.permission': {
  in: { sessionId: string; requestId: string; optionId: string | null }
  out: void
}
'acp.stop': { in: { sessionId: string }; out: void }
/** Per-vault panel prefs (settings.terminal pattern): app.db app_settings
 *  row `agentPanel`; get degrades to closed/340 while no vault/db is open. */
'settings.agentPanel.get': { in: void; out: { open: boolean; width: number } }
'settings.agentPanel.set': { in: { open: boolean; width: number }; out: void }
```

**Event half** — append to the CoreEvent union after `term.exit` (line 422):

```ts
/** ACP agent panels (acp blueprint 2026-07-18): the async half of the acp.*
 *  family. acp.chunk is batched ~8ms core-side and always flushed BEFORE any
 *  other event for the same session (ordering law). detail on acp.session
 *  carries the auth message / stderr tail — bounded, never wholesale logs. */
| { kind: 'acp.session'; sessionId: string; agent: AcpAgent; state: AcpSessionState; detail?: string }
| { kind: 'acp.chunk'; sessionId: string; role: 'agent' | 'thought'; text: string }
| {
    kind: 'acp.tool'
    sessionId: string
    toolCallId: string
    title?: string
    toolKind?: string
    status?: 'pending' | 'in_progress' | 'completed' | 'failed'
  }
| { kind: 'acp.plan'; sessionId: string; entries: AcpPlanEntry[] }
| {
    kind: 'acp.permission'
    sessionId: string
    requestId: string
    title: string
    toolKind?: string
    options: AcpPermissionOption[]
  }
| { kind: 'acp.turnEnd'; sessionId: string; stopReason: string }
```

**Codes** — append to `IpcCode` after `'TERM_UNKNOWN'` (line 481):

```ts
// ACP agent panels (acp blueprint 2026-07-18)
| 'ACP_CWD_INVALID'
| 'ACP_UNKNOWN'
| 'ACP_NOT_READY'
| 'ACP_BUSY'
```

(Session cap uses a plain `INTERNAL` envelope — the terminals.ts:65 precedent.)

### 1.4 New file `src/core/acp-spawn.ts` — adapter resolution, env, stderr ring

Module header comment: adapter stdout is the ACP wire — NEVER log it; stderr may carry
tokens — ring buffer only.

```ts
import { createRequire } from 'node:module'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { AcpAgent } from '../shared/ipc-contract'

const ADAPTER_PKG: Record<AcpAgent, string> = {
  claude: '@agentclientprotocol/claude-agent-acp',
  codex: '@agentclientprotocol/codex-acp',
}

/** Resolve the adapter's bin entry (dist/index.js for both, verified against
 *  the published tarballs) from OUR node_modules — a pinned dependency, never
 *  npx/PATH. require.resolve of package.json dodges "main" vs "bin" drift. */
export function adapterEntry(agent: AcpAgent): string

/** Explicit env allowlist — the OPPOSITE of the pty's full inherit
 *  (terminals.ts:78 is the user's own shell; an adapter gets only what it
 *  needs). HOME is the credential root (keychain / ~/.claude / ~/.codex),
 *  PATH for the agent's own subprocesses, the rest is shell hygiene.
 *  API keys pass through ONLY if already set in our env. */
export function adapterEnv(): NodeJS.ProcessEnv
// keys: HOME, PATH, USER, LOGNAME, SHELL, TMPDIR, LANG, ELECTRON_RUN_AS_NODE: '1'
// passthrough if present: ANTHROPIC_API_KEY, CLAUDE_CODE_EXECUTABLE,
//                         CODEX_API_KEY, OPENAI_API_KEY, CODEX_PATH

/** Bounded stderr tail for error surfacing (engine.ts:357 pattern). */
export class StderrRing {
  constructor(cap?: number) // default 4096 bytes
  push(chunk: Buffer | string): void
  /** last 4 non-empty lines, joined — the acp.session error detail */
  tail(): string
}

export function spawnAdapter(agent: AcpAgent, cwd: string): ChildProcessWithoutNullStreams
// spawn(process.execPath, [adapterEntry(agent)], { cwd, env: adapterEnv(),
//   stdio: ['pipe', 'pipe', 'pipe'] })  — execFile-style argv, no shell ever.
```

`adapterEntry` implementation shape: `createRequire(import.meta.url).resolve(`${pkg}/package.json`)`,
then `join(dirname(pkgJsonPath), 'dist/index.js')`. Add a comment noting dist/index.js is the
published bin target for both pins and a version bump must re-verify it.

### 1.5 `src/core/settings.ts` — panel prefs

Insert after `saveTerminalPrefs` (line 199), copying the terminal block verbatim with:
row key `'agentPanel'`, `{ open: boolean; width: number }`, clamp 280–480, default
`{ open: false, width: 340 }`:

```ts
export function loadAgentPanelPrefs(db: AppDb, vaultId: string): { open: boolean; width: number }
export function saveAgentPanelPrefs(db: AppDb, vaultId: string, prefs: { open: boolean; width: number }): void
```

### 1.6 `src/core/handlers.ts` — prefs registration only (acp.* handlers are Agent 2's)

After the `settings.terminal.set` registration (line 912):

```ts
ipc.register('settings.agentPanel.get', () => {
  const db = getAppDb()
  const vid = currentVaultId()
  return db && vid ? loadAgentPanelPrefs(db, vid) : { open: false, width: 340 }
})
ipc.register('settings.agentPanel.set', (prefs) => {
  const { db, vid } = requireDb()
  saveAgentPanelPrefs(db, vid, prefs)
})
```

Extend the existing `./settings` import list.

### Acceptance — Agent 1

1. `npm install` succeeds; `node -e "require.resolve('@agentclientprotocol/claude-agent-acp/package.json')"` resolves.
2. `npm run typecheck` clean (contract entries compile; unregistered `acp.*` channels answer
   `NOT_IMPLEMENTED` at runtime by dispatcher design — fine until Agent 2).
3. `npx vitest run src/core/acp-spawn.test.ts` — Agent 4 owns the file, but Agent 1 must
   leave `adapterEnv()` returning ONLY the allowlisted keys (spot-check by node -e).
4. `git diff electron-builder.yml` shows only the asarUnpack addition.

---

## Agent 2 — protocol client in the core host

### 2.1 New file `src/core/acp.ts` — session registry, handshake, update routing

Mirrors `src/core/terminals.ts` structurally. Module header: NEVER log adapter stdout/stderr
or chat content; error paths log sessionIds/codes only.

```ts
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { Readable, Writable } from 'node:stream'
import { type CoreEvent, ipcError, type AcpAgent } from '../shared/ipc-contract'
import { spawnAdapter, StderrRing } from './acp-spawn'
import { getMcpStatus } from './mcp-server'
import { mintAgentToken, revokeAgentToken } from './settings'

const FLUSH_MS = 8            // chunk batch window — terminals.ts precedent
const MAX_ACP_SESSIONS = 4    // ponytail ceiling: adapters each carry a native CLI child

interface AcpSession {
  agent: AcpAgent
  child: ReturnType<typeof spawnAdapter>
  conn: unknown                    // the sdk connection handle (typed per sdk d.ts)
  acpSessionId: string | null      // the ADAPTER's session/new id (≠ our id)
  state: AcpSessionState
  stderr: StderrRing
  turnActive: boolean
  cancelling: boolean
  // chunk batching (terminals.ts flush shape, keyed by role)
  buf: { role: 'agent' | 'thought'; text: string } | null
  timer: NodeJS.Timeout | null
  pendingPermissions: Map<string, (outcome: PermissionOutcome) => void>
  tokenName: string | null         // minted MCP agent-token name, revoked on stop
  emit: (e: CoreEvent) => void
}

const sessions = new Map<string, AcpSession>()  // module-level; one core host per vault

/** Lazy sdk import (terminals.ts loadPty pattern) so plain-node vitest never
 *  loads it; tests vi.mock('@agentclientprotocol/sdk'). */
async function loadSdk(): Promise<typeof import('@agentclientprotocol/sdk')>

export function acpStart(
  emit: (e: CoreEvent) => void,
  arg: { agent: AcpAgent; cwd: string },
): { sessionId: string }
export function acpPrompt(sessionId: string, text: string): void
export function acpCancel(sessionId: string): void
export function acpPermission(sessionId: string, requestId: string, optionId: string | null): void
export function acpStop(sessionId: string): void      // idempotent — unknown id no-op
export function killAllAcpSessions(): void            // copied-keys iteration
```

**`acpStart`** (sync — the long-job law made literal):
1. `statSync(cwd).isDirectory()` guard → `ACP_CWD_INVALID` envelope, path in `detail` only
   (terminals.ts:55–64 verbatim shape).
2. `sessions.size >= MAX_ACP_SESSIONS` → plain `INTERNAL` envelope.
3. `const sessionId = randomUUID()`; install the session in state `'starting'`; emit
   `{ kind: 'acp.session', sessionId, agent, state: 'starting' }`; return `{ sessionId }`.
4. `void boot(sessionId, agent, cwd)` — the async part, fully caught:

**`boot` flow**:
1. `spawnAdapter(agent, cwd)`; wire `child.stderr` → `session.stderr.push`; wire
   `child.on('exit')` → if the session still exists: flush chunks, emit
   `acp.session { state: 'exited', detail: stderr.tail() }`, delete + revoke token.
2. `const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout))`
   (the claude adapter does exactly this internally).
3. Build the sdk client: `client({ name: 'loredex', version: <app version> })` with
   - `onNotification(methods.client.session.update, …)` → `routeUpdate(sessionId, params)`
   - `onRequest(methods.client.session.requestPermission, …)` → `routePermission(sessionId, params)`
   then connect over `stream`. (Exact builder names per the installed d.ts — see global note;
   legacy `ClientSideConnection` fallback acceptable if signatures moved.)
4. `initialize` with `{ protocolVersion: PROTOCOL_VERSION, clientCapabilities: {}, clientInfo: { name: 'loredex', version } }`.
   Keep `result.agentCapabilities.mcpCapabilities?.http === true` as `httpOk`.
5. `mcpServers`: if `httpOk` and `getMcpStatus()` reports a live port —
   `tokenName = 'acp:' + agent + ':' + sessionId.slice(0, 8)`;
   `[{ type: 'http', name: 'loredex', url: 'http://127.0.0.1:<port>/', headers: [{ name: 'Authorization', value: 'Bearer ' + mintAgentToken(tokenName) }] }]`
   — the token never crosses the renderer seam (handlers.ts:780 snippet synthesized locally).
   Else `[]`.
6. `session/new { cwd, mcpServers }` → store `acpSessionId`, set state `'ready'`, emit
   `acp.session { state: 'ready' }`.
7. **Catch**: sdk `RequestError` with code `-32000` → state `'auth_required'`, detail = the
   error message (the adapter's own words; renderer adds the login hint). Any other error →
   state `'error'`, `detail = firstLine(err) + ' — ' + stderr.tail()` (bounded). In both
   cases the child may still be alive — for `'error'` kill it; for `'auth_required'` ALSO
   kill it (v1: recovery is "log in via terminal, start a new session" — comment this
   ceiling; keeping a half-booted adapter alive buys nothing without an authenticate flow).

**`acpPrompt`**:
- unknown id → `ACP_UNKNOWN`; state ≠ `'ready'` → `ACP_NOT_READY`; `turnActive` → `ACP_BUSY`.
- set `turnActive = true`, then fire-and-forget the outstanding request
  (dashboard.recurate shape, handlers.ts:684–697):
  `session/prompt { sessionId: acpSessionId, prompt: [{ type: 'text', text }] }` →
  on resolve: flush chunks, `turnActive = false`, emit `acp.turnEnd { stopReason: result.stopReason }`.
  On reject: flush, `turnActive = false`; -32000 → `acp.session { state: 'auth_required', detail }`
  and `acp.turnEnd { stopReason: 'cancelled' }`; other errors →
  `acp.session { state: 'error', detail: tail }` + `acp.turnEnd { stopReason: 'cancelled' }`.

**`routeUpdate`** — discriminate on `update.sessionUpdate`, IGNORE unknown variants
defensively (sdk minors add unstable ones — comment this):
- `agent_message_chunk` / `agent_thought_chunk` → text ContentBlocks only (`content.type ===
  'text'`); append to `session.buf` (same role) or flush-then-start (role changed); arm the
  8ms timer (terminals.ts:83–86 shape). Non-text blocks dropped in v1.
- `user_message_chunk` → ignore (v1 renders the user's own submitted text; session/load
  replay is deferred).
- `tool_call` / `tool_call_update` → **`flushChunks(sessionId)` FIRST** (ordering law — the
  pty exit-flush precedent, terminals.ts:87–91), then emit `acp.tool` with
  `{ toolCallId, title, toolKind: kind, status }` (fields optional on updates — pass through
  what came). Diff/terminal content dropped in v1 (deferred: edit-review).
- `plan` → flush, then emit `acp.plan { entries }` (entries mapped to `AcpPlanEntry`).
- everything else (`available_commands_update`, `current_mode_update`, unstable variants) →
  ignore.

**`routePermission`** — returns a Promise held until the renderer answers:
- `const requestId = randomUUID()`; flush chunks; emit `acp.permission { sessionId,
  requestId, title: toolCall.title ?? 'Tool call', toolKind: toolCall.kind, options }`
  (options mapped verbatim — allow/reject variants come from the request; NO auto-allow of
  any kind).
- store the resolver in `pendingPermissions`; resolve with
  `{ outcome: { outcome: 'selected', optionId } }` or `{ outcome: { outcome: 'cancelled' } }`.

**`acpPermission(sessionId, requestId, optionId)`**: unknown session → `ACP_UNKNOWN`;
unknown requestId → no-op (the turn may have been cancelled across the invoke — idempotent
like termKill). `optionId === null` → cancelled outcome.

**`acpCancel`**: unknown id no-op. Set `cancelling = true`, answer EVERY pending permission
with the cancelled outcome (protocol requirement), send the `session/cancel` notification.
The outstanding prompt then resolves with `stopReason: 'cancelled'` → normal turnEnd path.

**`acpStop`**: idempotent. Clear timer, answer pending permissions cancelled, delete from
the map FIRST (so the child 'exit' handler no-ops), `child.kill()`, revoke `tokenName`
(best-effort try/catch), emit `acp.session { state: 'exited' }`.

**`killAllAcpSessions`**: `for (const id of [...sessions.keys()]) acpStop(id)` — but emit no
per-session events when the port is being reaped (dying core / ownerless renderer); simplest:
a `silent?: boolean` param defaulting false, true from the cleanup sites.

### 2.2 `src/core/handlers.ts` — registration

Import beside the terminals import (line 95):
`import { acpCancel, acpPermission, acpPrompt, acpStart, acpStop } from './acp'`.

Insert directly after `ipc.register('term.kill', …)` (line 706):

```ts
// ACP agent panels (acp blueprint): adapter processes are core-owned OS
// resources; everything streams as acp.* CoreEvents. NEVER log adapter
// stdout/stderr or chat content. No withWriteLock (agents write via their
// own tools, not the engine), no identity.
ipc.register('acp.start', ({ agent, cwd }) =>
  acpStart((e) => ipc.emit(e), { agent, cwd: cwd ?? engine.getConfig().vaultPath }),
)
ipc.register('acp.prompt', ({ sessionId, text }) => acpPrompt(sessionId, text))
ipc.register('acp.cancel', ({ sessionId }) => acpCancel(sessionId))
ipc.register('acp.permission', ({ sessionId, requestId, optionId }) =>
  acpPermission(sessionId, requestId, optionId),
)
ipc.register('acp.stop', ({ sessionId }) => acpStop(sessionId))
```

### 2.3 `src/core/index.ts` — both cleanup sites

Import beside `killAllTerminals` (line 31): `import { killAllAcpSessions } from './acp'`.

1. Exit hook (lines 223–226):
```ts
process.on('exit', () => {
  killAllTerminals()
  killAllAcpSessions(true)
  removeDiscovery()
})
```
2. Port-reattach reap (line 254) — a reloaded renderer means every session is ownerless:
```ts
if (portAttached) {
  killAllTerminals()
  killAllAcpSessions(true)
}
```

### Acceptance — Agent 2

1. `npm run typecheck` clean.
2. Manual smoke (dev app, this machine has claude keychain creds): `⌘J`-less for now — from
   devtools run `window.loredex`-level invoke of `acp.start { agent: 'claude' }`, observe
   `acp.session starting → ready` events, `acp.prompt` with "say hi", observe `acp.chunk`
   stream + `acp.turnEnd { stopReason: 'end_turn' }`. (Renderer UI lands in Agent 3; the
   devtools `onEvent` hook suffices.)
3. Kill checks: quit the app → no orphan `claude-agent-acp` processes (`pgrep -f`); ⌘R the
   window mid-session → adapter reaped.
4. Grep gate: no `console.log`/`console.error` in acp.ts touching stdout/stderr/chunk text.

---

## Agent 3 — renderer panel, permission modal, actions

### 3.1 New file `src/renderer/src/stores/agentPanel.ts`

Copy the terminal store's architecture (stores/terminal.ts): rails-pattern persistence for
`{open, width}`, `resetGen` race guards, PORT_SWAPPED retry, module-scope `onEvent`
subscription guarded by `window.loredex`.

```ts
export type AcpChatItem =
  | { type: 'user'; text: string }
  | { type: 'agent'; text: string }      // grows in place while streaming
  | { type: 'thought'; text: string }
  | { type: 'tool'; toolCallId: string; title: string; toolKind?: string; status: string }
export interface AcpSessionView {
  sessionId: string
  agent: AcpAgent
  title: string                          // first prompt words; 'New session' until then
  state: AcpSessionState
  detail?: string
  busy: boolean
  items: AcpChatItem[]
  plan: AcpPlanEntry[]                   // latest plan replaces, never appends
}
interface AgentPanelState {
  open: boolean
  width: number
  agent: AcpAgent                        // the picker; default 'claude'
  sessions: AcpSessionView[]
  activeId: string | null
  permission: { sessionId: string; requestId: string; title: string; toolKind?: string; options: AcpPermissionOption[] } | null
  load(): Promise<void>                  // settings.agentPanel.get, PORT_SWAPPED retry once
  toggle(): void                         // open/close + persist (no session spawn — unlike terminal)
  setAgent(a: AcpAgent): void
  openHere(cwd?: string): Promise<void>  // open panel + acp.start + select session
  select(id: string): void
  send(text: string): Promise<void>      // acp.prompt on activeId; sets title on first send
  cancel(): void                         // acp.cancel on activeId
  respondPermission(optionId: string | null): void   // acp.permission + clear
  closeSession(id: string): Promise<void>            // acp.stop + drop from list
  reset(): Promise<void>                 // vault switch: acp.stop every session (failures
                                         // swallowed — old core may be dead), defaults
}
```

Key behaviors:
- `openHere`: `set({ open: true })` optimistically; guard with module-scope `resetGen`
  (terminal.ts:54–60 comment applies verbatim) — if a reset lands across the `acp.start`
  await, best-effort `acp.stop` the resolved id and bail. Session enters the list in state
  `'starting'` with `busy: false`; events drive the rest.
- `send`: empty/whitespace no-op; state ≠ 'ready' or busy → no-op (the input is disabled
  anyway — belt and braces); push `{ type: 'user', text }`, set `busy: true`, set title from
  the first prompt (`text.split(/\s+/).slice(0, 6).join(' ')` capped 48 chars) if still
  'New session'; invoke `acp.prompt` — envelope errors (`ACP_BUSY`, dead core) revert busy
  and surface via the session `detail`.
- **Chunk sink** (module scope, NOT store methods): the store must not churn per event.
  `const pending = new Map<string, { role; text }[]>` + one `requestAnimationFrame`-scheduled
  `commit()` that drains into the store: for each chunk, if the session's last item matches
  the role → append text (replace the items array + last item immutably), else push a new
  item. Core already batches at 8ms; the rAF coalescer bounds React commits at frame rate
  (the terminal's imperative-registry lesson, adapted for text that must live in state).
- Module-scope `onEvent` handler routes: `acp.session` (state/detail merge; `'exited'` on a
  session not in the list → ignore), `acp.chunk` (→ pending sink), `acp.tool` (flush pending
  first — mirrors the core's ordering law — then upsert by toolCallId: update status/title
  in place if a tool item with that id exists, else push), `acp.plan` (replace `plan`),
  `acp.permission` (set `permission` — one at a time; a second while one shows queues by
  simply overwriting? NO: keep a module-scope FIFO array, surface head — comment it),
  `acp.turnEnd` (flush, `busy: false`).
- `reset()`: bump `resetGen`, best-effort `acp.stop` each session (terminal.ts:199–221
  shape), clear pending map + permission queue, restore defaults, then caller re-`load()`s.

### 3.2 New file `src/renderer/src/agent/AgentPanel.tsx`

Mount point: **last child inside `div.app`** (App.tsx — after `<SuggestToastStack />` at
line 303, before the closing `</div>` at 304). `.app` is a flex row, so an `aside` there
docks right across every view — the row-axis analog of the terminal drawer's column-axis
reasoning (App.tsx:305–307 comment).

Render states:
- `open === false && sessions.length === 0` → `null` (terminal-drawer precedent).
- `open === false && sessions.length > 0` → only the reopen tab: `button.agent-panel-reopen`
  `‹` (`.meta-rail-reopen` recipe, styles.css:7277 — half-pill glued to the right edge).
- open → `<aside className="agent-panel" style={{ width }}>` with:
  1. **Header** `.agent-head`: caps-mono `AGENT` label (`.rail-label` recipe), the agent
     picker as a seg-control (`ComposeHandoffModal.tsx:184–196` seg pattern — two options
     Claude/Codex, drives `setAgent`; the picker chooses what `openHere` STARTS, running
     sessions keep their agent), a `+` new-session button (`openHere()`), and the collapse
     `›` (`.rail-collapse` recipe, MetaRail.tsx:121–132).
  2. **Session list** `.agent-sessions`: one mono row per session (`.session-line-v3`
     recipe, styles.css:7047) — `[CC]`/`[CX]` agent tag (info color), title ellipsized,
     status **glyph + label** chip: `◌ starting` / `● ready` (ok) / `⚠ auth` (warn) /
     `✕ error` / `○ exited` (text-3). Click = `select`. A small `×` per row =
     `closeSession`. Never color alone — glyph+label is the law
     (design-fidelity.test.ts:203).
  3. **Thread** `.agent-thread` (flex:1, overflow-y auto): map `items` —
     `.agent-msg-user` (right-ish emphasis card, hairline border), `.agent-msg-agent`
     (plain, `white-space: pre-wrap`), `.agent-msg-thought` (text-3, smaller, pre-wrap),
     `.agent-tool-line` (mono machine line: status glyph+label + title — the AgentsView
     [MCP] row style; these are tool TITLES, never raw adapter output). Latest `plan`
     renders as `.agent-plan` — a compact mono checklist (`✓`/`▸`/`·` + content) above the
     input. Auto-scroll to bottom when the user is already at bottom (scrollTop check —
     don't yank a user who scrolled up).
  4. **Auth / error state**: when the active session is `auth_required` or `error`, an
     inline `.agent-state-note` card in the thread: the `detail` text (the adapter's own
     message) + for auth a hint line "Run `claude /login` (or `codex login`) in the
     terminal, then start a new session." — glyph + label, no crash, no modal.
  5. **Input** `.agent-input`: textarea (auto-grow capped ~6 lines), Enter inserts newline,
     **⌘↵ sends** (`onKeyDown` metaKey check — matches Modal.tsx's convention), disabled
     unless active session state is 'ready' and not busy. To its right: while `busy` a
     **Stop** button (`cancel()` — quiet/danger-tinted secondary), else **Send** — the
     panel's ONE cobalt primary (one-per-view law; every other button in the panel is
     secondary/quiet).

### 3.3 New file `src/renderer/src/agent/AgentPermissionModal.tsx`

Mounted once at App level beside the other modals (App.tsx after `<LinkRequestModal />`,
line 300), gated on `useAgentPanel((s) => s.permission)`. Built the RecurateDialog way
(TodayView.tsx:596 — raw `.modal-backdrop`/`.modal`/`.modal-title`/`.modal-footer` classes,
custom footer) because the option set is dynamic:

- Title: `Agent permission request`.
- Body rows (`.modal-row` / caps-mono `.modal-label`, styles.css:3683): `TOOL` → title,
  `KIND` → toolKind (omit row if absent), `SESSION` → session title + agent tag. Values in
  Geist Mono — machine facts.
- Footer: one button per `options` entry, options ordered as received. Kinds map:
  `allow_once` → the single cobalt primary with `kbd` ⌘⏎; `allow_always` → secondary;
  `reject_once`/`reject_always` → quiet. NO default-allow, no remembered choice.
- Esc + backdrop click + the ✕ = `respondPermission(null)` → cancelled outcome (dismissing
  is rejecting). App's global key handler already treats `.modal-backdrop` as an open
  overlay (App.tsx:154) so shortcuts stay suppressed.

### 3.4 `src/renderer/src/App.tsx` wiring

1. Imports: `AgentPanel`, `AgentPermissionModal`, `useAgentPanel`.
2. Boot effect (line 110–115): add `void useAgentPanel.getState().load()`.
3. `onVaultChanged` block (lines 117–143): after the terminal reset chain (136–139) add:
```ts
void useAgentPanel
  .getState()
  .reset()
  .then(() => useAgentPanel.getState().load())
```
4. JSX: `<AgentPermissionModal />` after `<LinkRequestModal />` (line 300);
   `<AgentPanel />` after `<SuggestToastStack />` (line 303), still inside `div.app`, with a
   sibling comment mirroring the drawer's (305–307) explaining the row-axis mount.

### 3.5 `src/renderer/src/actions/registry.ts` — palette law

After `action:terminal-close-pane` (line 267):

```ts
{
  // acp blueprint 2026-07-18: ⌘J free in the registry; VS Code panel muscle
  // memory. Title is live (toggle-sidebar pattern).
  id: 'action:toggle-agent-panel',
  title: useAgentPanel.getState().open ? 'Close agent panel' : 'Open agent panel',
  shortcut: '⌘J',
  combo: { key: 'j', meta: true },
  run: () => useAgentPanel.getState().toggle(),
},
{
  // combo-less palette action (split-right precedent): open the panel and
  // start a session at the vault root with the picked agent.
  id: 'action:open-agent-here',
  title: 'Open agent here',
  run: () => void useAgentPanel.getState().openHere(),
},
```

registry.test.ts enforces hint + unique-combo automatically — no manual test edits beyond
what Agent 4 adds.

### 3.6 `src/renderer/src/terminal/TerminalDrawer.tsx` — "Open agent here" button

In the drawer header (after the `close` button, line 121), one more `term-hdr-btn`:

```tsx
<button
  type="button"
  className="term-hdr-btn"
  title="Open agent here (vault root)"
  onClick={() => void useAgentPanel.getState().openHere()}
>
  agent ▸
</button>
```

(Project/client-row wiring is deferred — named below.)

### 3.7 `src/renderer/src/styles.css` — new classes ONLY here (never loredex-v3.css)

All tokens, both themes ride existing vars. Recipes:
- `.agent-panel`: `flex: 0 0 340px; min-width: 0; display: flex; flex-direction: column;
  border-left: 1px solid var(--hairline); background: var(--bg-inset); align-self: stretch`
  (the `.agents-session` / `.meta-rail` hybrid). Width comes from inline style; the class
  carries everything else.
- `.agent-panel-reopen`: copy `.meta-rail-reopen` (styles.css:7277–7283) verbatim values.
- `.agent-head`: `.rail-label-head` recipe; seg control reuses the existing seg classes.
- `.agent-sessions`, `.agent-session-row`: `.session-line-v3` mono recipe (11px mono,
  nowrap/ellipsis); status chips colored via existing status tokens.
- `.agent-thread`, `.agent-msg-*`: 1px hairline borders only, radius per neighboring cards,
  NO new gradients (design-fidelity.test.ts:103), `white-space: pre-wrap` on message bodies.
- `.agent-tool-line`, `.agent-plan`: `font: 11px/2.1 var(--font-mono); color: var(--text-2)`
  — Geist Mono for machine facts.
- `.agent-input` row + the Send primary using the existing button classes (cobalt token).
- `.agent-state-note`: warn/danger tinted hairline card, glyph+label inside.

### Acceptance — Agent 3

1. `npm run typecheck` clean.
2. `npx vitest run src/renderer/src/design-fidelity.test.ts src/renderer/src/actions/registry.test.ts` — both green (no new gradients, 1px borders, glyph+label,
   palette hints + unique combos).
3. Dev-app smoke: ⌘J opens the panel · palette shows "Open agent here" · starting a Claude
   session streams chunks into the thread · tool rows render mono with status glyph+label ·
   a permission request raises the modal, Esc rejects, turn continues per the agent's
   handling · Stop mid-turn yields `cancelled` turnEnd · Codex while logged-out shows the
   in-panel auth_required note (no crash) · both themes look right (toggle theme in
   Settings).
4. Vault switch: sessions vanish, panel prefs re-read for the new vault, no zombie adapters
   (`pgrep`).

---

## Agent 4 — tests

Known vitest gotchas apply: full parallel runs dirty vault fixtures and perf/poller/
route-safety/set-frontmatter are flaky in FULL runs — run the new files targeted; the
node-default environment means renderer tests need the jsdom pragma.

### 4.1 New file `src/core/acp-spawn.test.ts` (node env)

- `adapterEnv()` returns EXACTLY the allowlist keys (assert no leakage: seed
  `process.env.SECRET_X = 'y'` via vi.stubEnv and assert absent; assert
  `ELECTRON_RUN_AS_NODE === '1'`; assert `ANTHROPIC_API_KEY` passes through only when set).
- `StderrRing`: cap enforced (push > 4 KB, byte length bounded), `tail()` returns last 4
  non-empty lines.
- `adapterEntry('claude' | 'codex')` resolves an existing file ending `dist/index.js`
  (skip-if-not-installed guard is NOT acceptable — the deps are pinned; a resolve failure is
  a real defect).

### 4.2 New file `src/core/acp.test.ts` (node env)

`vi.mock('./acp-spawn')` (fake child: EventEmitter + PassThrough stdio) and
`vi.mock('@agentclientprotocol/sdk')` (capture the onNotification/onRequest handlers,
resolvable fake `initialize`/`session/new`/`session/prompt`). Mock `./mcp-server`
(`getMcpStatus`) and `./settings` (`mintAgentToken`/`revokeAgentToken`). Collected events
via a push-array `emit`. Tests:

1. `acpStart` returns a uuid synchronously and emits `starting`; happy boot emits `ready`.
2. Cwd guard: non-directory → `ACP_CWD_INVALID` envelope, path only in `detail`.
3. Cap: 5th start → `INTERNAL` envelope mentioning the limit.
4. MCP attach: status running + httpOk → `session/new` params carry the http server with a
   minted bearer; server down → `mcpServers: []`; `acpStop` revokes the token name.
5. Chunk batching: two same-role chunks inside the window → ONE `acp.chunk`; a `tool_call`
   update flushes pending chunks BEFORE the `acp.tool` event (ordering assertion on the
   event array).
6. Unknown-variant updates are ignored without throwing.
7. Permission round-trip: request → `acp.permission` event with mapped options;
   `acpPermission(..., optionId)` resolves the held promise `selected`; `null` resolves
   `cancelled`; `acpCancel` auto-cancels pending permissions.
8. Prompt lifecycle: `acp.turnEnd { stopReason: 'end_turn' }` on resolve; second prompt
   while active → `ACP_BUSY`; prompt on `starting` session → `ACP_NOT_READY`; unknown id →
   `ACP_UNKNOWN`.
9. -32000 from `session/new` → `auth_required` with the adapter's message in detail; child
   killed.
10. `acpStop` idempotent (double-stop no-throw); `killAllAcpSessions` empties the registry
    and kills every fake child.

### 4.3 New file `src/renderer/src/stores/agentPanel.test.ts` (`// @vitest-environment jsdom` pragma)

Mock `../api` (`invoke`, `onEvent` capture — handoffs.ts test precedent). Tests:

1. `load()` maps `settings.agentPanel.get`; PORT_SWAPPED rejects once → retried once.
2. `openHere()` inserts a `starting` session; `resetGen` race: `reset()` during the awaited
   `acp.start` → resolved id gets a best-effort `acp.stop`, never enters the list.
3. Event routing: chunk events grow the last same-role item (after the rAF flush — use fake
   rAF/`vi.advanceTimersByTime`), role switch pushes a new item, `acp.tool` upserts by
   toolCallId, `acp.plan` replaces, `acp.turnEnd` clears busy.
4. `send()` sets the title from the first prompt words (cap respected) and pushes the user
   item; send while busy no-ops.
5. Permission FIFO: two `acp.permission` events → first surfaces, `respondPermission`
   invokes `acp.permission` with the requestId and surfaces the second.
6. `reset()` stops every session (invoke failures swallowed) and restores defaults.

### 4.4 Gates (run in this order)

```
npm run typecheck
npx vitest run src/core/acp-spawn.test.ts src/core/acp.test.ts src/renderer/src/stores/agentPanel.test.ts
npx vitest run src/renderer/src/design-fidelity.test.ts src/renderer/src/actions/registry.test.ts
npm run test:e2e
```

All green (e2e: the known-flaky-under-full-parallel unit files are not in scope; e2e
failures ARE in scope). Do NOT git commit — the audit stage owns the single commit.

---

## Deferred (named, not built)

- **Edit-review diffs** — `tool_call_update` `{ type: 'diff', path, oldText, newText }`
  content is received and dropped; a CodeMirror merge view lands later.
- **Session persistence across restarts** — both adapters advertise `loadSession: true`
  (`session/load` replays history); v1 sessions die with the core host.
- **"Send comment to AI" from notes** — note + comment as session context; reply as a
  thread comment.
- **Follow-along / live terminal streaming** — the claude adapter's `_meta` terminal-output
  extension; requires client terminal capability.
- **Client fs/terminal capabilities** — deliberately omitted (see global decisions);
  revisit with edit review.
- **`authenticate` flow** — v1 recovery is the embedded terminal login; the -32000 path is
  wired so adding the method picker later is additive.
- **Markdown rendering of agent chunks** — plain pre-wrap text in v1; the reader's
  remark/rehype pipeline exists when wanted.
- **Panel width drag + per-row "Open agent here" on project/client rows** — prefs field
  already persists width; row wiring is a cwd parameter away.
- **Watcher `.md` filter widening** — agents writing yaml/json data files produce no
  `vault.changed` (watcher.ts:59); widen or accept manual refresh when agent-ops flows
  demand it.
- **Slash commands / modes / experimental updates** — `available_commands_update`,
  `current_mode_update`, `plan_update`, usage/config updates all ignored defensively.
