# Genudo over Streamable HTTP with per-client sign-in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every per-client Genudo connection from a stdio `npx` bridge to the remote Streamable HTTP endpoint, with browser sign-in as the default way a client's credential is obtained.

**Architecture:** `workspace.yml` gains a remote-server shape (`type: http` + `url` + `headers`) in loredex core, keeping the existing `${VAR}` secret slot so the keychain store, env-ref diff and paste field survive untouched. A new desktop module owns an OAuth session per client and hands out a fresh access token; four consumers (materialize, ACP, pull, probe) ask it for one and fall back to a pasted token. The pinned stdio bridge survives only as the Codex ACP fallback.

**Tech Stack:** TypeScript, Electron (main / core utilityProcess / sandboxed renderer), React + Zustand, vitest, zod, `@modelcontextprotocol/sdk` (client + `client/auth.js`), `@agentclientprotocol/sdk`, commander (loredex core CLI), biome.

**Spec:** `docs/superpowers/specs/2026-07-28-genudo-http-oauth-per-client-design.md`

## Global Constraints

- **loredex core (`../loredex`) must contain no Genudo-specific naming.** Its tests deliberately use `crm-bridge` / `some-mcp-client`. The remote-server capability is generic; every Genudo-named artifact lives in loredex-desktop.
- **Step 0 is already shipped:** `GENUDO_BRIDGE_VERSION = '2.5.0'` is exported from `src/core/genudo-pull.ts` and both spawn sites are pinned. It is a stopgap that keeps stale-cache machines working until Task 6 migrates the fleet; **Task 5 deletes it.** Do not build anything new on it.
- Endpoint is `{BASE}/mcp`, `{BASE}` default `https://api.genudo.ai`. OAuth scope is **`mcp:use`** — `mcp:access` no longer exists anywhere.
- **Never `ping`** as a health check: the backend answers `-32601 Method not found`. Use `initialize` + `tools/list`.
- Accept **both** `application/json` and `text/event-stream` responses, and echo a `Mcp-Session-Id` response header on subsequent requests if one ever appears. Genudo does neither today.
- Secrets never cross the IPC seam to the renderer — presence and account label only. This matches `old-platform.ts:20-21`.
- `.mcp.json` output must stay byte-identical in shape (sorted keys, 2-space, trailing newline) or every `--check` reports drift forever.
- Buttons: full-size `Button` from `components/Button` with capitalized labels. Never tiny lowercase links.
- Run `npm run typecheck` and `npx vitest run <file>` before each commit. Full-suite runs dirty the vault fixtures — run targeted files.
- Do not commit to `main`; branch first. Do not push unless asked.

---

### Task 1: Remote MCP servers in `workspace.yml` (loredex core)

**Files:**
- Modify: `../loredex/src/core/workspace.ts:18-27` (schema), `:73-92` (`expandEnvRefs`), `:176-187` (`workspaceEnvRefs`), `:230-250` (`renderMcpJson`)
- Modify: `../loredex/package.json:3` (version)
- Test: `../loredex/tests/workspace.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `McpServerSpec = StdioServerSpec | RemoteServerSpec`; `RemoteServerSpec = { type: 'http'; url: string; headers?: Record<string,string> }`; `isRemoteServer(s: McpServerSpec): s is RemoteServerSpec`; `secretFields(s: McpServerSpec): Record<string,string>` — all exported from `src/core/workspace.ts`. Task 6 depends on the schema accepting the remote shape; Tasks 4 and 7 depend on `${VAR}` inside `headers` being expanded by `materializeWorkspace`.

- [ ] **Step 1: Write the failing tests**

Add to `../loredex/tests/workspace.test.ts`:

```ts
const WS_REMOTE = `mcp:
  crm-remote:
    type: http
    url: https://api.example.com/mcp
    headers: { Authorization: "Bearer \${CRM_TOKEN_X}" }
plugins:
  claude: []
skills: []
`

describe('remote (http) mcp servers', () => {
  it('parses a remote server and reports its ${VAR} refs', () => {
    const { v, slug, dir } = dexWithClient()
    writeFileSync(join(dir, 'workspace.yml'), WS_REMOTE)
    expect(workspaceEnvRefs(dir)).toEqual(['CRM_TOKEN_X'])
    expect(loadWorkspaceSpec(dir).mcp['crm-remote']).toEqual({
      type: 'http',
      url: 'https://api.example.com/mcp',
      headers: { Authorization: 'Bearer ${CRM_TOKEN_X}' },
    })
    expect(v).toBeTruthy()
    expect(slug).toBeTruthy()
  })

  it('expands ${VAR} inside headers, and reports it missing when absent', () => {
    const { dir } = dexWithClient()
    writeFileSync(join(dir, 'workspace.yml'), WS_REMOTE)
    const spec = loadWorkspaceSpec(dir)
    const hit = expandEnvRefs(spec, { CRM_TOKEN_X: 'sekret' })
    expect(hit.missing).toEqual([])
    expect((hit.spec.mcp['crm-remote'] as { headers: Record<string, string> }).headers)
      .toEqual({ Authorization: 'Bearer sekret' })
    const miss = expandEnvRefs(spec, {})
    expect(miss.missing).toEqual(['CRM_TOKEN_X'])
    expect((miss.spec.mcp['crm-remote'] as { headers: Record<string, string> }).headers)
      .toEqual({ Authorization: 'Bearer ${CRM_TOKEN_X}' })
  })

  it('emits the remote shape into .mcp.json without a command', () => {
    const { slug, dir, v } = dexWithClient()
    writeFileSync(join(dir, 'workspace.yml'), WS_REMOTE)
    materializeWorkspace(v, slug, { env: { CRM_TOKEN_X: 'sekret' } })
    const json = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'))
    expect(json.mcpServers['crm-remote']).toEqual({
      type: 'http',
      url: 'https://api.example.com/mcp',
      headers: { Authorization: 'Bearer sekret' },
    })
    expect(json.mcpServers['crm-remote'].command).toBeUndefined()
  })

  it('rejects a server that is both stdio and remote', () => {
    const { dir } = dexWithClient()
    writeFileSync(
      join(dir, 'workspace.yml'),
      'mcp:\n  bad:\n    command: npx\n    type: http\n    url: https://x.example/mcp\n',
    )
    expect(() => loadWorkspaceSpec(dir)).toThrow(/workspace.yml invalid/)
  })

  it('still parses the stdio shape unchanged', () => {
    const { dir } = dexWithClient()
    writeFileSync(join(dir, 'workspace.yml'), WS)
    expect(loadWorkspaceSpec(dir).mcp['crm-bridge']).toEqual({
      command: 'npx',
      args: ['-y', 'some-mcp-client'],
      env: { CRM_TOKEN: '${CRM_TOKEN_X}' },
    })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd ../loredex && npx vitest run tests/workspace.test.ts -t "remote"`
Expected: FAIL — `workspace.yml invalid at mcp.crm-remote: Unrecognized key(s)` / missing `type`.

- [ ] **Step 3: Replace the schema**

In `../loredex/src/core/workspace.ts`, replace the `mcpServerSchema` block:

```ts
/** A locally-spawned stdio server: the original and still the common case. */
const stdioServerSchema = z
  .object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .strict()

/**
 * A REMOTE server, reached over Streamable HTTP. `headers` is the secret slot,
 * exactly as `env` is for stdio — `${VAR}` is expanded at generate time and the
 * literal value never enters the committed file.
 *
 * Both branches are `.strict()` so a block carrying `command` AND `url` matches
 * neither and fails loudly, rather than silently having one half stripped.
 */
const remoteServerSchema = z
  .object({
    type: z.literal('http'),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .strict()

const mcpServerSchema = z.union([remoteServerSchema, stdioServerSchema])

export type StdioServerSpec = z.infer<typeof stdioServerSchema>
export type RemoteServerSpec = z.infer<typeof remoteServerSchema>
export type McpServerSpec = z.infer<typeof mcpServerSchema>

export function isRemoteServer(server: McpServerSpec): server is RemoteServerSpec {
  return 'type' in server && server.type === 'http'
}

/** The `${VAR}`-bearing field of either shape: `headers` remote, `env` stdio. */
export function secretFields(server: McpServerSpec): Record<string, string> {
  return (isRemoteServer(server) ? server.headers : server.env) ?? {}
}
```

- [ ] **Step 4: Route expansion, refs and emit through `secretFields`**

`expandEnvRefs` — replace the per-server body:

```ts
  for (const [name, server] of Object.entries(spec.mcp)) {
    const expanded: Record<string, string> = {}
    for (const [key, value] of Object.entries(secretFields(server))) {
      const refs = [...value.matchAll(ENV_REF)].map((m) => m[1] as string)
      const absent = refs.filter((r) => env[r] === undefined)
      if (absent.length > 0) {
        for (const r of absent) missing.add(r)
        expanded[key] = value
      } else {
        expanded[key] = value.replace(ENV_REF, (_, r: string) => env[r] ?? '')
      }
    }
    mcp[name] = isRemoteServer(server)
      ? { ...server, ...(server.headers ? { headers: expanded } : {}) }
      : { ...server, ...(server.env ? { env: expanded } : {}) }
  }
```

`workspaceEnvRefs` — replace the inner loop:

```ts
  for (const server of Object.values(spec.mcp)) {
    for (const value of Object.values(secretFields(server))) {
      for (const m of value.matchAll(ENV_REF)) refs.add(m[1] as string)
    }
  }
```

`renderMcpJson` — branch before the Windows shim (a remote server has no command to wrap):

```ts
  for (const [name, server] of Object.entries(spec.mcp)) {
    if (isRemoteServer(server)) {
      json.mcpServers[name] = {
        type: 'http',
        url: server.url,
        ...(server.headers && Object.keys(server.headers).length > 0
          ? { headers: server.headers }
          : {}),
      }
      continue
    }
    const safe = windowsSafeCommand(server.command, server.args ?? [])
    json.mcpServers[name] = {
      command: safe.command,
      ...(safe.args.length > 0 ? { args: safe.args } : {}),
      ...(server.env && Object.keys(server.env).length > 0 ? { env: server.env } : {}),
    }
  }
```

- [ ] **Step 5: Fix every remaining `server.env` / `server.command` type error**

Run: `cd ../loredex && npm run typecheck`
Expected: errors wherever a union member is accessed unguarded. Fix each with `isRemoteServer(...)` or `secretFields(...)`. Do not cast.

- [ ] **Step 6: Run the tests**

Run: `cd ../loredex && npx vitest run tests/workspace.test.ts`
Expected: PASS, including the pre-existing stdio tests.

- [ ] **Step 7: Bump, build, pack, vendor**

```bash
cd ../loredex
npm version 2.11.0 --no-git-tag-version
npm run build && npm run lint && npm test
npm pack
mv loredex-2.11.0.tgz ../loredex-desktop/vendor/loredex-2.11.0-agentops.tgz
cd ../loredex-desktop
npm pkg set dependencies.loredex="file:vendor/loredex-2.11.0-agentops.tgz"
npm install
npm run typecheck
```

Delete the superseded `vendor/loredex-2.10.1-agentops.tgz`.

- [ ] **Step 8: Commit (two repos)**

```bash
cd ../loredex && git add -A && git commit -m "feat(workspace): remote http mcp servers with \${VAR} headers"
cd ../loredex-desktop && git add vendor package.json package-lock.json && git commit -m "chore: vendor loredex 2.11.0 (remote mcp servers)"
```

---

### Task 2: Direct Streamable HTTP transport for the pull

**Files:**
- Create: `src/core/genudo-http.ts`
- Create: `src/core/genudo-http.test.ts`
- Modify: `src/core/genudo-pull.ts` (`fetchBundles`, ~line 291-373)

**Interfaces:**
- Consumes: nothing.
- Produces: `GENUDO_BASE_URL = 'https://api.genudo.ai'`; `genudoRpc(baseUrl: string, token: string, timeoutMs?: number): { callTool(name: string, args?: Record<string, unknown>): Promise<unknown> }`. Task 4 reuses `GENUDO_BASE_URL`; `fetchBundles(token, baseUrl, timeoutMs)` keeps its exact signature so `handlers.ts` needs no change in this task.

- [ ] **Step 1: Write the failing test**

Create `src/core/genudo-http.test.ts`:

```ts
import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { genudoRpc } from './genudo-http'

let server: Server | null = null

function serve(
  handler: (body: Record<string, unknown>, req: { headers: Record<string, unknown> }) =>
    { status?: number; contentType?: string; body?: string; sessionId?: string },
): Promise<string> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      let raw = ''
      req.on('data', (c) => {
        raw += c
      })
      req.on('end', () => {
        const out = handler(JSON.parse(raw || '{}'), { headers: req.headers })
        res.writeHead(out.status ?? 200, {
          'content-type': out.contentType ?? 'application/json',
          ...(out.sessionId ? { 'mcp-session-id': out.sessionId } : {}),
        })
        res.end(out.body ?? '')
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address()
      resolve(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`)
    })
  })
}

const toolResult = (payload: unknown, id: unknown): string =>
  JSON.stringify({
    jsonrpc: '2.0',
    id,
    result: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
  })

afterEach(() => {
  server?.close()
  server = null
})

describe('genudoRpc', () => {
  it('POSTs to {BASE}/mcp with the bearer and parses a tool result', async () => {
    let seen: Record<string, unknown> = {}
    const base = await serve((body, req) => {
      seen = { ...body, auth: req.headers.authorization, accept: req.headers.accept }
      return { body: toolResult({ pipelines: [{ id: 1 }] }, body.id) }
    })
    const rpc = genudoRpc(base, 'tok')
    expect(await rpc.callTool('list_pipelines')).toEqual({ pipelines: [{ id: 1 }] })
    expect(seen.auth).toBe('Bearer tok')
    expect(String(seen.accept)).toContain('text/event-stream')
    expect(seen.method).toBe('tools/call')
  })

  it('tolerates a 204 with an empty body', async () => {
    const base = await serve(() => ({ status: 204 }))
    expect(await genudoRpc(base, 'tok').callTool('anything')).toBeNull()
  })

  it('parses an SSE-framed response body', async () => {
    const base = await serve((body) => ({
      contentType: 'text/event-stream',
      body: `event: message\ndata: ${toolResult({ ok: true }, body.id)}\n\n`,
    }))
    expect(await genudoRpc(base, 'tok').callTool('x')).toEqual({ ok: true })
  })

  it('echoes Mcp-Session-Id on subsequent requests', async () => {
    const seen: (string | undefined)[] = []
    const base = await serve((body, req) => {
      seen.push(req.headers['mcp-session-id'] as string | undefined)
      return { sessionId: 'sess-1', body: toolResult({ n: seen.length }, body.id) }
    })
    const rpc = genudoRpc(base, 'tok')
    await rpc.callTool('a')
    await rpc.callTool('b')
    expect(seen).toEqual([undefined, 'sess-1'])
  })

  it('surfaces a JSON-RPC error as a thrown Error', async () => {
    const base = await serve((body) => ({
      body: JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } }),
    }))
    await expect(genudoRpc(base, 'tok').callTool('ping')).rejects.toThrow(/Method not found/)
  })

  it('surfaces a 401 as an actionable Error', async () => {
    const base = await serve(() => ({ status: 401, body: '{"error":"unauthorized"}' }))
    await expect(genudoRpc(base, 'tok').callTool('x')).rejects.toThrow(/401/)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/genudo-http.test.ts`
Expected: FAIL — `Cannot find module './genudo-http'`.

- [ ] **Step 3: Implement the transport**

Create `src/core/genudo-http.ts`:

```ts
/**
 * Genudo over Streamable HTTP — the whole transport.
 *
 * The backend retired SSE on 2026-07-28: there is one endpoint, `POST {BASE}/mcp`,
 * it is stateless, and the `initialize` handshake is optional (`tools/list` as a
 * first request answers 29 tools). So this is a plain request/response client with
 * no connection to manage, which is why the npx bridge, the Node runtime, the PATH
 * widening and the Windows `cmd /c` workaround all disappear from the pull path.
 *
 * Two pieces of cheap insurance against a server-side change Genudo has not made:
 * an `text/event-stream` body is unwrapped if one ever arrives, and a
 * `Mcp-Session-Id` response header is echoed on every subsequent request.
 */
export const GENUDO_BASE_URL = 'https://api.genudo.ai'

/** Pull the JSON payload out of an SSE frame — `data:` lines, concatenated. */
function unwrapSse(text: string): string {
  return text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('')
}

export function genudoRpc(
  baseUrl: string,
  token: string,
  timeoutMs = 120_000,
): { callTool(name: string, args?: Record<string, unknown>): Promise<unknown> } {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/mcp`
  let id = 0
  let sessionId: string | null = null

  async function rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const signal = AbortSignal.timeout(timeoutMs)
    const res = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    })
    const issued = res.headers.get('mcp-session-id')
    if (issued) sessionId = issued
    if (!res.ok) {
      // 401 is the common one and means the credential, not the server, is wrong
      throw new Error(`genudo ${method} failed — HTTP ${res.status} ${res.statusText}`.trim())
    }
    if (res.status === 204) return null
    const raw = await res.text()
    if (!raw.trim()) return null
    const body = (res.headers.get('content-type') ?? '').includes('text/event-stream')
      ? unwrapSse(raw)
      : raw
    const json = JSON.parse(body) as {
      result?: unknown
      error?: { code: number; message: string }
    }
    if (json.error) throw new Error(`genudo ${method} failed — ${json.error.message}`)
    return json.result ?? null
  }

  return {
    async callTool(name, args = {}) {
      const result = (await rpc('tools/call', { name, arguments: args })) as {
        content?: { type: string; text?: string }[]
      } | null
      if (result === null) return null
      const text = (result.content ?? [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('\n')
      try {
        return JSON.parse(text)
      } catch {
        return text
      }
    },
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/core/genudo-http.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Rewrite `fetchBundles` on top of it**

In `src/core/genudo-pull.ts`, replace the whole body of `fetchBundles` (keep the exported signature and the doc comment above it):

```ts
export async function fetchBundles(
  token: string,
  baseUrl: string,
  timeoutMs = 120_000,
): Promise<{
  bundles: { pipeline: RawPipeline; stages: RawStage[]; actions: unknown[]; variables: unknown[] }[]
}> {
  const rpc = genudoRpc(baseUrl, token, timeoutMs)
  // `verbose: true` is now a no-op the backend ignores — response slimming was a
  // BRIDGE feature, so a direct connection returns full persona and instruction
  // text by default. It stays passed so this still works against the bridge.
  const list = (await rpc.callTool('list_pipelines', { verbose: true })) as {
    pipelines?: RawPipeline[]
  }
  const bundles = []
  for (const pipeline of list?.pipelines ?? []) {
    const [stages, actions, variables] = (await Promise.all([
      rpc.callTool('list_pipeline_stages', { pipeline_id: pipeline.id, verbose: true }),
      rpc.callTool('list_actions', { pipeline_id: pipeline.id }),
      rpc.callTool('list_variables', { pipeline_id: pipeline.id }),
    ])) as [{ stages?: RawStage[] }, { actions?: unknown[] }, { variables?: unknown[] }]
    bundles.push({
      pipeline,
      stages: stages?.stages ?? [],
      actions: actions?.actions ?? [],
      variables: variables?.variables ?? [],
    })
  }
  return { bundles }
}
```

Add `import { genudoRpc } from './genudo-http'`. Keep the `GENUDO_BRIDGE_VERSION` export and the `widenNodePath` / `withResolvedNpx` imports **only if** something else in the file still uses them — if nothing does, delete the now-unused imports and let typecheck confirm.

- [ ] **Step 6: Verify nothing else regressed**

Run: `npx vitest run src/core/genudo-pull.test.ts src/core/genudo-http.test.ts && npm run typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/genudo-http.ts src/core/genudo-http.test.ts src/core/genudo-pull.ts
git commit -m "feat(genudo): pull over streamable http instead of the npx bridge"
```

---

### Task 3: Per-client Genudo sign-in

**Files:**
- Create: `src/core/genudo-auth.ts`
- Create: `src/core/genudo-auth.test.ts`

**Interfaces:**
- Consumes: `storeClientToken` / `readClientToken` / `deleteClientToken` from `./client-tokens`; `GENUDO_BASE_URL` from `./genudo-http`.
- Produces:
  - `genudoSessionRef(client: string): string` → `clients/<slug>/GENUDO_OAUTH`
  - `genudoStatus(client: string): Promise<{ signedIn: boolean; account: string | null; expiresAt: number | null }>`
  - `genudoSignIn(client: string, baseUrl?: string): Promise<{ account: string | null }>`
  - `genudoSignOut(client: string): Promise<void>`
  - `genudoAccessToken(client: string, baseUrl?: string): Promise<string | null>` — refreshes when expiring within 60s; returns `null` when this client has no session at all (the caller then falls back to a pasted token).

- [ ] **Step 1: Write the failing test**

Create `src/core/genudo-auth.test.ts`. The keychain and the browser are both mocked; the token endpoint is a real local server so the refresh path is exercised for real.

```ts
import { createServer, type Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.mock('./client-tokens', () => ({
  storeClientToken: vi.fn(async (ref: string, value: string) => {
    store.set(ref, value)
  }),
  readClientToken: vi.fn(async (ref: string) => store.get(ref) ?? null),
  deleteClientToken: vi.fn(async (ref: string) => {
    store.delete(ref)
  }),
}))

import { genudoAccessToken, genudoSessionRef, genudoSignOut, genudoStatus } from './genudo-auth'

let server: Server | null = null
let refreshCalls = 0

beforeEach(() => {
  store.clear()
  refreshCalls = 0
})
afterEach(() => {
  server?.close()
  server = null
})

/** Minimal OAuth token endpoint: refresh_token grant only. */
function tokenServer(reply: () => { status: number; body: unknown }): Promise<string> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      req.on('data', () => {})
      req.on('end', () => {
        refreshCalls += 1
        const out = reply()
        res.writeHead(out.status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(out.body))
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address()
      resolve(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`)
    })
  })
}

function seed(session: Record<string, unknown>): void {
  store.set(genudoSessionRef('acme'), JSON.stringify(session))
}

describe('genudo sign-in session', () => {
  it('reports signed-out for a client with no session', async () => {
    expect(await genudoStatus('acme')).toEqual({ signedIn: false, account: null, expiresAt: null })
    expect(await genudoAccessToken('acme')).toBeNull()
  })

  it('returns a live access token without touching the network', async () => {
    seed({
      tokens: { access_token: 'live', token_type: 'Bearer', refresh_token: 'r1' },
      expiresAt: Date.now() + 600_000,
      account: 'ops@acme.test',
    })
    expect(await genudoAccessToken('acme')).toBe('live')
    expect(refreshCalls).toBe(0)
    expect(await genudoStatus('acme')).toMatchObject({ signedIn: true, account: 'ops@acme.test' })
  })

  it('refreshes a token expiring inside 60s and persists the new one', async () => {
    const base = await tokenServer(() => ({
      status: 200,
      body: { access_token: 'fresh', token_type: 'Bearer', refresh_token: 'r2', expires_in: 3600 },
    }))
    seed({
      tokens: { access_token: 'stale', token_type: 'Bearer', refresh_token: 'r1' },
      expiresAt: Date.now() + 5_000,
      account: 'ops@acme.test',
      tokenEndpoint: `${base}/oauth/token`,
      client: { client_id: 'cid', redirect_uri: 'http://127.0.0.1:47821/callback' },
    })
    expect(await genudoAccessToken('acme')).toBe('fresh')
    expect(refreshCalls).toBe(1)
    const saved = JSON.parse(store.get(genudoSessionRef('acme')) as string)
    expect(saved.tokens.access_token).toBe('fresh')
    expect(saved.expiresAt).toBeGreaterThan(Date.now() + 3_000_000)
    // second read is served from the store, not the network
    expect(await genudoAccessToken('acme')).toBe('fresh')
    expect(refreshCalls).toBe(1)
  })

  it('clears the session when the refresh grant is rejected', async () => {
    const base = await tokenServer(() => ({ status: 400, body: { error: 'invalid_grant' } }))
    seed({
      tokens: { access_token: 'stale', token_type: 'Bearer', refresh_token: 'dead' },
      expiresAt: Date.now() + 1_000,
      tokenEndpoint: `${base}/oauth/token`,
      client: { client_id: 'cid', redirect_uri: 'http://127.0.0.1:47821/callback' },
    })
    await expect(genudoAccessToken('acme')).rejects.toThrow(/sign in again/i)
    expect(await genudoStatus('acme')).toMatchObject({ signedIn: false })
  })

  it('sign-out deletes the session', async () => {
    seed({ tokens: { access_token: 'live', token_type: 'Bearer' }, expiresAt: null })
    await genudoSignOut('acme')
    expect(await genudoStatus('acme')).toMatchObject({ signedIn: false })
  })

  it('scopes sessions per client', async () => {
    seed({ tokens: { access_token: 'acme-tok', token_type: 'Bearer' }, expiresAt: null })
    expect(await genudoAccessToken('acme')).toBe('acme-tok')
    expect(await genudoAccessToken('other-client')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/genudo-auth.test.ts`
Expected: FAIL — `Cannot find module './genudo-auth'`.

- [ ] **Step 3: Implement the session store and token path**

Create `src/core/genudo-auth.ts`:

```ts
/**
 * Per-client Genudo sign-in (OAuth 2.1, DCR + PKCE S256, scope `mcp:use`).
 *
 * ONE session per client, in the same containment the pasted tokens use — a JSON
 * blob under `clients/<slug>/GENUDO_OAUTH` via client-tokens.ts, so macOS gets the
 * login Keychain and everything else gets the AES-256-GCM machine-keyed map. No new
 * secret store, no new mock surface.
 *
 * WHY sign-in and pasted tokens coexist: a session is only a way to FILL the
 * `${GENUDO_TOKEN_*}` slot workspace.yml already declares. Everything downstream —
 * materialize, ACP, pull, probe — asks for a token and neither knows nor cares which
 * source produced it. Self-hosted deployments and CI keep pasting.
 *
 * Secrets never leave this process: only `signedIn`, the account label and an expiry
 * cross the IPC seam.
 */
import { createServer } from 'node:http'
import { shell } from 'electron'
import type { OAuthClientInformation, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import { auth, refreshAuthorization } from '@modelcontextprotocol/sdk/client/auth.js'
import { discoverAuthorizationServerMetadata } from '@modelcontextprotocol/sdk/client/auth.js'
import { deleteClientToken, readClientToken, storeClientToken } from './client-tokens'
import { GENUDO_BASE_URL } from './genudo-http'

/**
 * Fixed loopback port. A registered client's `redirect_uri` must match on every
 * later exchange, so an ephemeral port would invalidate the registration between
 * sign-ins. If the port is busy the sign-in fails loudly rather than silently
 * registering a redirect the authorization server will later reject.
 */
const CALLBACK_PORT = 47821
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`
const SCOPE = 'mcp:use'
/** Refresh this far ahead of expiry, so a token handed out is still valid on arrival. */
const REFRESH_MARGIN_MS = 60_000

interface GenudoSession {
  tokens: OAuthTokens
  /** ms epoch, or null when the server issued no `expires_in` */
  expiresAt: number | null
  account?: string
  tokenEndpoint?: string
  client?: OAuthClientInformation & { redirect_uri?: string }
}

export function genudoSessionRef(client: string): string {
  return `clients/${client}/GENUDO_OAUTH`
}

async function readSession(client: string): Promise<GenudoSession | null> {
  const raw = await readClientToken(genudoSessionRef(client))
  if (!raw) return null
  try {
    return JSON.parse(raw) as GenudoSession
  } catch {
    return null // corrupt blob reads as signed-out; the next sign-in overwrites it
  }
}

async function writeSession(client: string, session: GenudoSession): Promise<void> {
  await storeClientToken(genudoSessionRef(client), JSON.stringify(session))
}

export async function genudoSignOut(client: string): Promise<void> {
  await deleteClientToken(genudoSessionRef(client))
}

export async function genudoStatus(
  client: string,
): Promise<{ signedIn: boolean; account: string | null; expiresAt: number | null }> {
  const session = await readSession(client)
  if (!session) return { signedIn: false, account: null, expiresAt: null }
  return {
    signedIn: true,
    account: session.account ?? null,
    expiresAt: session.expiresAt ?? null,
  }
}

function stamp(tokens: OAuthTokens): number | null {
  return tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null
}

/**
 * A fresh access token for this client, or null when it has no session.
 *
 * Throws — rather than returning null — when a session EXISTS but cannot be
 * renewed, because those are different situations for the caller: "never signed
 * in, try the pasted token" versus "signed in and the grant is dead, tell the
 * user to sign in again".
 */
export async function genudoAccessToken(
  client: string,
  baseUrl: string = GENUDO_BASE_URL,
): Promise<string | null> {
  const session = await readSession(client)
  if (!session) return null
  const fresh =
    session.expiresAt === null || session.expiresAt - Date.now() > REFRESH_MARGIN_MS
  if (fresh) return session.tokens.access_token
  const refreshToken = session.tokens.refresh_token
  const tokenEndpoint = session.tokenEndpoint
  if (!refreshToken || !tokenEndpoint || !session.client) {
    await genudoSignOut(client)
    throw new Error(`Genudo session for ${client} expired — sign in again on the client page`)
  }
  try {
    const tokens = await refreshAuthorization(new URL(tokenEndpoint).origin, {
      metadata: { issuer: new URL(tokenEndpoint).origin, token_endpoint: tokenEndpoint,
        response_types_supported: ['code'] },
      clientInformation: session.client,
      refreshToken,
    })
    await writeSession(client, {
      ...session,
      // a refresh response may omit refresh_token, which means "keep the old one"
      tokens: { ...tokens, refresh_token: tokens.refresh_token ?? refreshToken },
      expiresAt: stamp(tokens),
    })
    return tokens.access_token
  } catch (e) {
    await genudoSignOut(client)
    throw new Error(
      `Genudo session for ${client} could not be renewed (${
        e instanceof Error ? e.message : String(e)
      }) — sign in again on the client page`,
    )
  }
  void baseUrl
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/core/genudo-auth.test.ts`
Expected: PASS for every test except sign-in itself, which is added next.

- [ ] **Step 5: Add the interactive sign-in**

Append to `src/core/genudo-auth.ts`:

```ts
/** One-shot loopback listener: resolves with the `code` the browser is redirected to. */
function awaitCallback(timeoutMs = 300_000): { url: string; code: Promise<string> } {
  let settle: ((code: string) => void) | null = null
  let fail: ((e: Error) => void) | null = null
  const code = new Promise<string>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', REDIRECT_URI)
    const got = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(
      `<body style="font:14px system-ui;padding:3rem">${
        got ? 'Signed in to Genudo. You can close this tab.' : `Sign-in failed: ${error ?? 'no code'}`
      }</body>`,
    )
    server.close()
    if (got) settle?.(got)
    else fail?.(new Error(`Genudo sign-in was refused (${error ?? 'no authorization code'})`))
  })
  server.on('error', (e) => fail?.(
    new Error(`could not listen on ${REDIRECT_URI} (${e.message}) — close whatever holds that port`),
  ))
  server.listen(CALLBACK_PORT, '127.0.0.1')
  const timer = setTimeout(() => {
    server.close()
    fail?.(new Error('Genudo sign-in timed out — no response from the browser'))
  }, timeoutMs)
  void code.finally(() => clearTimeout(timer))
  return { url: REDIRECT_URI, code }
}

/**
 * Interactive sign-in for one client. Consent opens in the SYSTEM browser so an
 * existing Genudo web session is reused, and so the app never hosts a login form.
 */
export async function genudoSignIn(
  client: string,
  baseUrl: string = GENUDO_BASE_URL,
): Promise<{ account: string | null }> {
  const existing = await readSession(client)
  let stored: GenudoSession = existing ?? { tokens: { access_token: '', token_type: 'Bearer' }, expiresAt: null }
  let verifier = ''
  const callback = awaitCallback()

  const provider = {
    get redirectUrl() {
      return REDIRECT_URI
    },
    get clientMetadata() {
      return {
        client_name: 'Loredex Desktop',
        redirect_uris: [REDIRECT_URI],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: SCOPE,
      }
    },
    clientInformation: () =>
      // a registration made for a DIFFERENT redirect_uri is unusable — drop it and
      // let the SDK register again rather than failing at the token exchange
      stored.client?.redirect_uri === REDIRECT_URI ? stored.client : undefined,
    saveClientInformation: (info: OAuthClientInformation) => {
      stored = { ...stored, client: { ...info, redirect_uri: REDIRECT_URI } }
    },
    tokens: () => (stored.tokens.access_token ? stored.tokens : undefined),
    saveTokens: (tokens: OAuthTokens) => {
      stored = { ...stored, tokens, expiresAt: stamp(tokens) }
    },
    redirectToAuthorization: async (authorizationUrl: URL) => {
      await shell.openExternal(authorizationUrl.toString())
    },
    saveCodeVerifier: (v: string) => {
      verifier = v
    },
    codeVerifier: () => verifier,
  }

  const first = await auth(provider, { serverUrl: `${baseUrl.replace(/\/+$/, '')}/mcp`, scope: SCOPE })
  if (first === 'AUTHORIZED') {
    await writeSession(client, stored)
    return { account: stored.account ?? null }
  }
  const code = await callback.code
  const result = await auth(provider, {
    serverUrl: `${baseUrl.replace(/\/+$/, '')}/mcp`,
    authorizationCode: code,
    scope: SCOPE,
  })
  if (result !== 'AUTHORIZED') throw new Error('Genudo sign-in did not complete')
  const metadata = await discoverAuthorizationServerMetadata(`${baseUrl.replace(/\/+$/, '')}/mcp`)
  await writeSession(client, { ...stored, tokenEndpoint: metadata?.token_endpoint })
  return { account: stored.account ?? null }
}
```

- [ ] **Step 6: Reconcile against the installed SDK**

Run: `npm run typecheck`
The exact export names of `refreshAuthorization` / `discoverAuthorizationServerMetadata` and the `metadata` argument shape come from the installed version — read
`node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.d.ts` and adjust the two call sites to match. Do not add casts to silence a mismatch; fix the call.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/core/genudo-auth.test.ts && npm run typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 8: Commit**

```bash
git add src/core/genudo-auth.ts src/core/genudo-auth.test.ts
git commit -m "feat(genudo): per-client oauth sign-in with keychain-backed sessions"
```

---

### Task 4: Wire sign-in into the IPC surface and the token resolvers

**Files:**
- Modify: `src/shared/ipc-contract.ts` (near the `clients.oldPlatform.*` block, ~line 391)
- Modify: `src/core/engine.ts:388-407` (`clientConnections` — it still returns the stdio-only shape)
- Modify: `src/core/handlers.ts` (`clients.workspace.status` ~line 329, `clients.tokens.set` ~line 346, `clients.pull` ~line 423, `clients.connections.test` ~line 462)
- Create: `src/core/genudo-credential.ts`
- Create: `src/core/genudo-credential.test.ts`

**Interfaces:**
- Consumes: `genudoAccessToken`, `genudoSignIn`, `genudoSignOut`, `genudoStatus` (Task 3); `readClientTokens` from `./client-tokens`.
- Produces:
  - `clientTokenOverlay(client: string, conns: ClientConnection[]): Promise<Record<string,string>>` — the keychain's held refs, with a live Genudo session's access token written over the `genudo` connection's refs. This is what `engine.generateWorkspace(client, check, held)` is fed, so a materialized `.mcp.json` carries a **fresh** bearer.
  - `resolveConnEnv(client, conn): Promise<Record<string,string>>` — one connection's fields with `${VAR}` expanded, built on the overlay. Throws an actionable error when a ref cannot be filled. Task 5 calls it.
  - `ClientConnection` — `{ server, envRefs, env?, headers?, url?, command?, args? }`.

- [ ] **Step 1: Write the failing test**

Create `src/core/genudo-credential.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('./client-tokens', () => ({
  readClientTokens: vi.fn(async (refs: string[]) =>
    Object.fromEntries(refs.filter((r) => r === 'GENUDO_TOKEN_ACME').map((r) => [r, 'pasted-tok'])),
  ),
}))
const accessToken = vi.fn(async (_client: string) => null as string | null)
vi.mock('./genudo-auth', () => ({ genudoAccessToken: (c: string) => accessToken(c) }))

import { resolveConnEnv } from './genudo-credential'

const conn = {
  server: 'genudo',
  envRefs: ['GENUDO_TOKEN_ACME'],
  command: '',
  args: [],
  env: {},
  headers: { Authorization: 'Bearer ${GENUDO_TOKEN_ACME}' },
}

describe('resolveConnEnv', () => {
  it('prefers a live session over the pasted token', async () => {
    accessToken.mockResolvedValueOnce('oauth-tok')
    expect(await resolveConnEnv('acme', conn)).toEqual({ Authorization: 'Bearer oauth-tok' })
  })

  it('falls back to the pasted token when there is no session', async () => {
    accessToken.mockResolvedValueOnce(null)
    expect(await resolveConnEnv('acme', conn)).toEqual({ Authorization: 'Bearer pasted-tok' })
  })

  it('throws an actionable error when neither exists', async () => {
    accessToken.mockResolvedValueOnce(null)
    await expect(
      resolveConnEnv('acme', { ...conn, envRefs: ['GENUDO_TOKEN_OTHER'],
        headers: { Authorization: 'Bearer ${GENUDO_TOKEN_OTHER}' } }),
    ).rejects.toThrow(/not signed in to genudo/i)
  })

  it('leaves a non-genudo connection to its pasted tokens only', async () => {
    const other = { ...conn, server: 'crm', env: { CRM: '${GENUDO_TOKEN_ACME}' }, headers: undefined }
    expect(await resolveConnEnv('acme', other)).toEqual({ CRM: 'pasted-tok' })
    expect(accessToken).not.toHaveBeenCalledWith('acme')
  })
})

describe('clientTokenOverlay', () => {
  it('writes a live session over the genudo refs and keeps the others held', async () => {
    accessToken.mockResolvedValueOnce('oauth-tok')
    const conns = [conn, { ...conn, server: 'crm', envRefs: ['GENUDO_TOKEN_ACME'] }]
    expect(await clientTokenOverlay('acme', conns)).toEqual({ GENUDO_TOKEN_ACME: 'oauth-tok' })
  })

  it('leaves the pasted token in place when there is no session', async () => {
    accessToken.mockResolvedValueOnce(null)
    expect(await clientTokenOverlay('acme', [conn])).toEqual({ GENUDO_TOKEN_ACME: 'pasted-tok' })
  })
})
```

Add `clientTokenOverlay` to the import at the top of the file.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/genudo-credential.test.ts`
Expected: FAIL — `Cannot find module './genudo-credential'`.

- [ ] **Step 3: Implement the resolver**

Create `src/core/genudo-credential.ts`:

```ts
/**
 * One place that answers "what fills this connection's ${VAR}s right now".
 *
 * Order matters: a live Genudo session BEATS a pasted token, because sign-in is the
 * default path and a stale pasted token would otherwise shadow it silently. Only the
 * `genudo` connection consults the session — every other server keeps its own
 * keychain refs untouched.
 */
import { readClientTokens } from './client-tokens'
import { genudoAccessToken } from './genudo-auth'

export const GENUDO_SERVER = 'genudo'
const ENV_REF = /\$\{([A-Z0-9_]+)\}/g

export interface ClientConnection {
  server: string
  envRefs: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  url?: string
  command?: string
  args?: string[]
}

/**
 * Every `${VAR}` this machine can fill for one client, ref → value.
 *
 * This is what `generateWorkspace` is fed, so a materialized `.mcp.json` carries a
 * token that is fresh AT WRITE TIME. There is no background refresh — every path
 * that hands work to something outside this process re-materializes first.
 */
export async function clientTokenOverlay(
  client: string,
  conns: ClientConnection[],
): Promise<Record<string, string>> {
  const held = await readClientTokens([...new Set(conns.flatMap((c) => c.envRefs))])
  const genudo = conns.find((c) => c.server === GENUDO_SERVER)
  if (genudo) {
    const live = await genudoAccessToken(client)
    if (live) for (const ref of genudo.envRefs) held[ref] = live
  }
  return held
}

export async function resolveConnEnv(
  client: string,
  conn: ClientConnection,
): Promise<Record<string, string>> {
  const held = await clientTokenOverlay(client, [conn])
  const source = conn.headers ?? conn.env ?? {}
  const out: Record<string, string> = {}
  const missing: string[] = []
  for (const [key, value] of Object.entries(source)) {
    out[key] = value.replace(ENV_REF, (whole, ref: string) => {
      const token = held[ref]
      if (token === undefined) missing.push(ref)
      return token ?? whole
    })
  }
  if (missing.length > 0) {
    throw new Error(
      conn.server === GENUDO_SERVER
        ? `${client} is not signed in to Genudo — use Sign in on the client page (or paste a token)`
        : `no token held for ${missing.join(', ')} — paste it in Agent tooling first`,
    )
  }
  return out
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/core/genudo-credential.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Teach `clientConnections` the remote shape**

`src/core/engine.ts:388-407` builds every connection as `{server, envRefs, command, args, env}`, which after Task 1 neither typechecks nor exposes what a remote server needs. Replace the mapper body:

```ts
  return Object.entries(spec.mcp).map(([server, def]) => {
    const refs = new Set<string>()
    for (const value of Object.values(secretFields(def))) {
      for (const m of value.matchAll(ENV_REF)) refs.add(m[1] as string)
    }
    const base = { server, envRefs: [...refs].sort() }
    return isRemoteServer(def)
      ? { ...base, type: 'http' as const, url: def.url, headers: def.headers ?? {} }
      : { ...base, command: def.command, args: def.args ?? [], env: def.env ?? {} }
  })
```

Import `isRemoteServer` and `secretFields` from `loredex`. Widen the declared return type to a union covering both shapes, and fix the resulting errors at each call site (`handlers.ts` `clients.pull`, `clients.connections.test`, `standardTooling`, `AddClientModal`'s `Connection` type in the renderer) — every one of them must handle a connection with no `command`.

- [ ] **Step 6: Feed the overlay to every materialize**

`generateWorkspace(client, check, held)` receives the env map, so a `.mcp.json` is only as fresh as what is passed in. In `src/core/handlers.ts`, replace `readClientTokens(engine.clientEnvRefs(client))` with the overlay at **both** call sites:

```ts
  // clients.workspace.status (~line 329)
  const connections = engine.clientConnections(client)
  const held = await clientTokenOverlay(client, connections)
  const declaredRefs = engine.clientEnvRefs(client)
  const missingRefs = declaredRefs.filter((r) => !(r in held))

  // clients.tokens.set (~line 351)
  const held = await clientTokenOverlay(client, engine.clientConnections(client))
  const result = engine.generateWorkspace(client, false, held)
```

This is the refresh-on-touch point for external agents: opening the client page or hitting Re-wire rewrites `.mcp.json` with a live bearer.

- [ ] **Step 7: Add the IPC channels**

In `src/shared/ipc-contract.ts`, beside the `clients.oldPlatform.*` block:

```ts
  'clients.genudo.status': {
    in: { client: string }
    out: { signedIn: boolean; account: string | null; expiresAt: number | null }
  }
  'clients.genudo.signIn': { in: { client: string }; out: { account: string | null } }
  'clients.genudo.signOut': { in: { client: string }; out: void }
```

- [ ] **Step 8: Register the handlers and switch the two consumers**

In `src/core/handlers.ts`:

```ts
ipc.register('clients.genudo.status', ({ client }) => genudoStatus(client))
ipc.register('clients.genudo.signIn', ({ client }) => genudoSignIn(client))
ipc.register('clients.genudo.signOut', ({ client }) => genudoSignOut(client))
```

In `clients.pull`, replace the hand-rolled `held` / `missing` expansion block with:

```ts
      const env = await resolveConnEnv(client, conn)
      const token = (env.Authorization ?? '').replace(/^Bearer\s+/i, '') || env.GENUDO_TOKEN || ''
      const { bundles } = await fetchBundles(token, env.GENUDO_BASE_URL ?? GENUDO_BASE_URL)
```

In `clients.connections.test`, replace the equivalent block with `await resolveConnEnv(client, conn)`, keeping the existing spawn path for stdio connections and using `probeHttpTools(conn.url, resolved)` for a remote one.

- [ ] **Step 9: Verify**

Run: `npx vitest run src/core/genudo-credential.test.ts src/core/ipc.test.ts src/core/engine.test.ts && npm run typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 10: Commit**

```bash
git add src/core/genudo-credential.ts src/core/genudo-credential.test.ts src/core/handlers.ts src/core/engine.ts src/shared/ipc-contract.ts
git commit -m "feat(genudo): sign-in ipc channels and session-first credential resolution"
```

---

### Task 5: ACP — remote genudo per client

**Files:**
- Modify: `src/core/acp.ts:564-578`
- Modify: `src/core/genudo-pull.ts` (delete `GENUDO_BRIDGE_VERSION` and the npx spawn, now that nothing spawns the bridge)
- Create: `src/core/genudo-server.ts`
- Create: `src/core/genudo-server.test.ts`

**Interfaces:**
- Consumes: `resolveConnEnv` (Task 4), `GENUDO_BASE_URL` (`./genudo-http`).
- Produces: `genudoServerFor(client: string | null, httpOk: boolean): Promise<McpServer | null>`.

**Why no stdio fallback:** `@agentclientprotocol/codex-acp@1.1.4` advertises
`mcpCapabilities: { acp: false, http: true, sse: false }` — http is Codex's only
remote transport. The Claude adapter advertises `{http, sse}`. Both shipped adapters
satisfy `httpOk`, so a fallback would be dead code. An adapter without http gets no
Genudo, exactly as `old-platform.ts` already behaves.

- [ ] **Step 1: Write the failing test**

Create `src/core/genudo-server.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('./genudo-credential', () => ({
  GENUDO_SERVER: 'genudo',
  resolveConnEnv: vi.fn(async () => ({ Authorization: 'Bearer tok-1' })),
}))
vi.mock('./engine', () => ({
  clientConnections: vi.fn(() => [
    { server: 'genudo', envRefs: ['GENUDO_TOKEN_ACME'], command: '', args: [],
      env: {}, type: 'http', url: 'https://api.genudo.ai/mcp',
      headers: { Authorization: 'Bearer ${GENUDO_TOKEN_ACME}' } },
  ]),
}))

import { genudoServerFor } from './genudo-server'

describe('genudoServerFor', () => {
  it('returns the remote server when the adapter supports http', async () => {
    expect(await genudoServerFor('acme', true)).toEqual({
      type: 'http',
      name: 'genudo',
      url: 'https://api.genudo.ai/mcp',
      headers: [{ name: 'Authorization', value: 'Bearer tok-1' }],
    })
  })

  it('omits the server entirely when the adapter advertises no http', async () => {
    expect(await genudoServerFor('acme', false)).toBeNull()
  })

  it('returns null with no client selected', async () => {
    expect(await genudoServerFor(null, true)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/genudo-server.test.ts`
Expected: FAIL — `Cannot find module './genudo-server'`.

- [ ] **Step 3: Implement**

Create `src/core/genudo-server.ts`:

```ts
/**
 * The per-client `genudo` MCP server for ONE session.
 *
 * Remote HTTP only. Verified 2026-07-28: `@agentclientprotocol/codex-acp@1.1.4`
 * advertises `{acp: false, http: true, sse: false}` and the Claude adapter
 * advertises `{http, sse}`, so every adapter this app spawns can take a remote
 * server — a stdio fallback would be code no session reaches. An adapter without
 * http gets no Genudo, the same omit-rather-than-half-build rule `old-platform.ts`
 * and `workspace-mcp.ts` already follow.
 */
import type { McpServer } from '@agentclientprotocol/sdk'
import { clientConnections } from './engine'
import { GENUDO_SERVER, resolveConnEnv } from './genudo-credential'
import { GENUDO_BASE_URL } from './genudo-http'

export async function genudoServerFor(
  client: string | null,
  httpOk: boolean,
): Promise<McpServer | null> {
  if (!client) return null
  let conn: { url?: string; headers?: Record<string, string>; envRefs: string[]; server: string; env?: Record<string, string> } | undefined
  try {
    conn = clientConnections(client).find((c) => c.server === GENUDO_SERVER)
  } catch {
    return null // no/invalid workspace.yml — nothing to attach
  }
  if (!conn) return null
  let resolved: Record<string, string>
  try {
    resolved = await resolveConnEnv(client, conn)
  } catch {
    return null // not signed in — omit rather than attach a server that 401s on every call
  }
  if (!httpOk) return null // no remote transport on this adapter — omit, never half-build
  const token = (resolved.Authorization ?? '').replace(/^Bearer\s+/i, '') || resolved.GENUDO_TOKEN
  if (!token) return null
  return {
    type: 'http',
    name: GENUDO_SERVER,
    url: conn.url ?? `${GENUDO_BASE_URL}/mcp`,
    headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
  } as McpServer
}
```

- [ ] **Step 4: Attach it in `acp.ts`**

Directly after the existing old-platform injection block (`acp.ts:574-578`):

```ts
  // The NEW platform, scoped to THIS client — remote, like the old one. Both
  // shipped adapters advertise http (codex-acp 1.1.4: {acp:false, http:true,
  // sse:false}), so this is the only path; an adapter without it gets no Genudo.
  const genudo = await genudoServerFor(s.clientSlug, httpOk)
  if (genudo) mcpServers.push(genudo)
```

- [ ] **Step 5: Delete the last bridge spawn**

Nothing spawns `genudo-mcp-client` any more: Task 2 moved the pull to HTTP and there is no stdio fallback. Delete `GENUDO_BRIDGE_VERSION` from `src/core/genudo-pull.ts` along with any spawn code left behind it, plus the now-unused `widenNodePath` / `withResolvedNpx` imports.

Leave the per-client health probe's generic stdio spawn path alone — an unmigrated client still declares a stdio server in its own `workspace.yml`, and Task 6 is what retires those.

Run: `grep -rn "genudo-mcp-client" src/` — expected: no hits outside `genudo-migrate.ts` and tests.

- [ ] **Step 6: Verify**

Run: `npx vitest run src/core/genudo-server.test.ts src/core/acp.test.ts src/core/genudo-pull.test.ts && npm run typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/genudo-server.ts src/core/genudo-server.test.ts src/core/acp.ts src/core/genudo-pull.ts
git commit -m "feat(acp): remote genudo per client, drop the npx bridge"
```

---

### Task 6: Fleet migration (59 clients, one command)

**Files:**
- Create: `src/core/genudo-migrate.ts`
- Create: `src/core/genudo-migrate.test.ts`
- Create: `scripts/migrate-genudo-http.mjs`

**Interfaces:**
- Consumes: nothing at runtime (pure text transform + a thin filesystem walker).
- Produces: `migrateWorkspaceYml(text: string): { text: string; changed: boolean }`, `pruneEnabledPlugins(json: string): { json: string; changed: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `src/core/genudo-migrate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { migrateWorkspaceYml, pruneEnabledPlugins } from './genudo-migrate'

const BEFORE = `# Agent tooling for this client — committed, secret-free.
mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_2ME}"
      GENUDO_BASE_URL: "https://api.genudo.ai"
plugins:
  claude: [genudo@genudo-ai]
skills: []
`

describe('migrateWorkspaceYml', () => {
  it('rewrites the genudo block to remote http, keeping the ${VAR} ref', () => {
    const { text, changed } = migrateWorkspaceYml(BEFORE)
    expect(changed).toBe(true)
    expect(text).toContain('type: http')
    expect(text).toContain('url: https://api.genudo.ai/mcp')
    expect(text).toContain('Authorization: "Bearer ${GENUDO_TOKEN_2ME}"')
    expect(text).not.toContain('npx')
    expect(text).not.toContain('command:')
  })

  it('swaps the plugin id to the no-connector build', () => {
    expect(migrateWorkspaceYml(BEFORE).text).toContain('genudo-no-connector@genudo-ai')
    expect(migrateWorkspaceYml(BEFORE).text).not.toContain('[genudo@genudo-ai]')
  })

  it('preserves a non-genudo server untouched', () => {
    const withOther = BEFORE.replace(
      'plugins:',
      '  crm:\n    command: npx\n    args: [-y, crm-client]\nplugins:',
    )
    const { text } = migrateWorkspaceYml(withOther)
    expect(text).toContain('crm-client')
    expect(text).toContain('command: npx')
  })

  it('is idempotent', () => {
    const once = migrateWorkspaceYml(BEFORE).text
    const twice = migrateWorkspaceYml(once)
    expect(twice.changed).toBe(false)
    expect(twice.text).toBe(once)
  })

  it('preserves a self-hosted base url as the endpoint host', () => {
    const selfHosted = BEFORE.replace('https://api.genudo.ai', 'https://genudo.acme.internal')
    expect(migrateWorkspaceYml(selfHosted).text).toContain('url: https://genudo.acme.internal/mcp')
  })
})

describe('pruneEnabledPlugins', () => {
  it('removes the stale bundled-connector plugin and keeps the rest', () => {
    const { json, changed } = pruneEnabledPlugins(
      JSON.stringify({ enabledPlugins: { 'genudo@genudo-ai': true, 'n8n-mcp-skills@x': true } }),
    )
    expect(changed).toBe(true)
    expect(JSON.parse(json).enabledPlugins).toEqual({ 'n8n-mcp-skills@x': true })
  })

  it('reports no change when the stale key is absent', () => {
    expect(pruneEnabledPlugins(JSON.stringify({ enabledPlugins: { 'x@y': true } })).changed).toBe(false)
  })

  it('leaves unparseable json alone', () => {
    expect(pruneEnabledPlugins('not json').changed).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/genudo-migrate.test.ts`
Expected: FAIL — `Cannot find module './genudo-migrate'`.

- [ ] **Step 3: Implement the transform**

Create `src/core/genudo-migrate.ts`:

```ts
/**
 * One-shot fleet migration: the per-client `genudo` connection moves from the stdio
 * npx bridge to the remote Streamable HTTP endpoint.
 *
 * TEXT-level, not parse-and-redump, so comments and unrelated formatting survive in
 * files that are committed vault content. Idempotent: running it twice changes
 * nothing the second time, which is what makes a --check run trustworthy.
 *
 * The `${VAR}` ref is deliberately CARRIED OVER rather than dropped — a pasted token
 * keeps working the moment this lands, before anyone signs in.
 */
const GENUDO_BLOCK =
  /^([ \t]+)genudo:\n(?:\1[ \t]+.*\n|\s*\n)*?(?=^\1\S|^\S|\Z)/m

const OLD_PLUGIN = /\bgenudo@genudo-ai\b/g
const NEW_PLUGIN = 'genudo-no-connector@genudo-ai'
export const STALE_PLUGIN_KEY = 'genudo@genudo-ai'

export function migrateWorkspaceYml(text: string): { text: string; changed: boolean } {
  let changed = false
  let out = text.replace(GENUDO_BLOCK, (block, indent: string) => {
    if (/type:\s*http/.test(block)) return block // already migrated
    const ref = /\$\{([A-Z0-9_]+)\}/.exec(block)?.[1]
    const base = /GENUDO_BASE_URL:\s*"?([^"\s]+)"?/.exec(block)?.[1] ?? 'https://api.genudo.ai'
    if (!ref) return block // nothing to carry over — leave it for a human
    changed = true
    const inner = `${indent}  `
    return (
      `${indent}genudo:\n` +
      `${inner}type: http\n` +
      `${inner}url: ${base.replace(/\/+$/, '')}/mcp\n` +
      `${inner}headers:\n` +
      `${inner}  Authorization: "Bearer \${${ref}}"\n`
    )
  })
  if (OLD_PLUGIN.test(out)) {
    out = out.replace(OLD_PLUGIN, NEW_PLUGIN)
    changed = true
  }
  return { text: out, changed }
}

/**
 * `renderClaudeSettings` only ever ADDS keys, so swapping workspace.yml leaves the
 * old plugin enabled forever — and that plugin bundles its own Genudo connector,
 * which would authenticate as whichever account Claude last signed in to. Removing
 * the key is what makes the swap actually take effect.
 */
export function pruneEnabledPlugins(json: string): { json: string; changed: boolean } {
  let parsed: { enabledPlugins?: Record<string, boolean> }
  try {
    parsed = JSON.parse(json) as { enabledPlugins?: Record<string, boolean> }
  } catch {
    return { json, changed: false }
  }
  if (!parsed.enabledPlugins || !(STALE_PLUGIN_KEY in parsed.enabledPlugins)) {
    return { json, changed: false }
  }
  delete parsed.enabledPlugins[STALE_PLUGIN_KEY]
  return { json: `${JSON.stringify(parsed, null, 2)}\n`, changed: true }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/core/genudo-migrate.test.ts`
Expected: PASS (8 tests). If the block regex misses a real fixture, fix the regex — do not loosen the idempotence test.

- [ ] **Step 5: Add the runner**

Create `scripts/migrate-genudo-http.mjs`:

```js
#!/usr/bin/env node
/**
 * Fleet migration runner. Dry by default — `--apply` is required to write.
 *
 *   node scripts/migrate-genudo-http.mjs --vault ~/path/to/dex
 *   node scripts/migrate-genudo-http.mjs --vault ~/path/to/dex --apply
 *
 * Re-materialize afterwards from the app (Re-wire) so each client's .mcp.json is
 * regenerated with a live credential.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { migrateWorkspaceYml, pruneEnabledPlugins } from '../out/main/genudo-migrate.js'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const vault = args[args.indexOf('--vault') + 1]
if (!vault || !existsSync(join(vault, 'projects'))) {
  console.error('usage: migrate-genudo-http.mjs --vault <dex path> [--apply]')
  process.exit(1)
}

let touched = 0
for (const slug of readdirSync(join(vault, 'projects'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)) {
  const dir = join(vault, 'projects', slug)
  const ws = join(dir, 'workspace.yml')
  if (existsSync(ws)) {
    const { text, changed } = migrateWorkspaceYml(readFileSync(ws, 'utf8'))
    if (changed) {
      touched += 1
      console.log(`${apply ? 'migrate' : 'would migrate'}  ${slug}/workspace.yml`)
      if (apply) writeFileSync(ws, text)
    }
  }
  const settings = join(dir, '.claude', 'settings.json')
  if (existsSync(settings)) {
    const { json, changed } = pruneEnabledPlugins(readFileSync(settings, 'utf8'))
    if (changed) {
      console.log(`${apply ? 'prune   ' : 'would prune  '} ${slug}/.claude/settings.json`)
      if (apply) writeFileSync(settings, json)
    }
  }
}
console.log(`\n${touched} client(s) ${apply ? 'migrated' : 'would change'}${apply ? '' : ' — re-run with --apply'}`)
```

- [ ] **Step 6: Dry-run against the real dex**

```bash
npm run build
node scripts/migrate-genudo-http.mjs --vault ~/Business/GenuDo/Operations/clients_work
```
Expected: a list of clients and **no writes**. Read the list before applying. If `../out/main/genudo-migrate.js` does not exist after `npm run build`, import the source through `tsx` instead: `npx tsx scripts/migrate-genudo-http.mjs …`.

- [ ] **Step 7: Commit (the script, not the vault)**

```bash
git add src/core/genudo-migrate.ts src/core/genudo-migrate.test.ts scripts/migrate-genudo-http.mjs
git commit -m "feat(genudo): fleet migration to remote http, dry by default"
```

---

### Task 7: Sign-in control in the client's connection row

**Files:**
- Modify: `src/renderer/src/views/clients/ClientPage.tsx` (`WorkspacePanel`, from line 498)
- Test: `src/renderer/src/views/clients/client-page.test.ts`

**Interfaces:**
- Consumes: `clients.genudo.status` / `.signIn` / `.signOut` (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/src/views/clients/client-page.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { genudoLabel } from './client-page'

describe('genudoLabel', () => {
  it('invites sign-in when there is no session', () => {
    expect(genudoLabel({ signedIn: false, account: null, expiresAt: null })).toEqual({
      text: 'Not connected to Genudo',
      action: 'Sign in to Genudo',
    })
  })

  it('names the account when signed in', () => {
    expect(
      genudoLabel({ signedIn: true, account: 'ops@acme.test', expiresAt: Date.now() + 3_600_000 }),
    ).toEqual({ text: 'Signed in as ops@acme.test · renews automatically', action: 'Sign out' })
  })

  it('asks for a fresh sign-in once the session is past expiry', () => {
    expect(genudoLabel({ signedIn: true, account: null, expiresAt: Date.now() - 1 })).toEqual({
      text: 'Genudo session expired',
      action: 'Sign in again',
    })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/renderer/src/views/clients/client-page.test.ts`
Expected: FAIL — `genudoLabel` is not exported.

- [ ] **Step 3: Add the pure label helper**

Append to `src/renderer/src/views/clients/client-page.ts`:

```ts
export interface GenudoStatus {
  signedIn: boolean
  account: string | null
  expiresAt: number | null
}

/** Copy for the genudo row: signed-out, live, or expired. Pure, so it is testable. */
export function genudoLabel(status: GenudoStatus): { text: string; action: string } {
  if (!status.signedIn) return { text: 'Not connected to Genudo', action: 'Sign in to Genudo' }
  if (status.expiresAt !== null && status.expiresAt <= Date.now()) {
    return { text: 'Genudo session expired', action: 'Sign in again' }
  }
  return {
    text: status.account
      ? `Signed in as ${status.account} · renews automatically`
      : 'Signed in to Genudo · renews automatically',
    action: 'Sign out',
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/renderer/src/views/clients/client-page.test.ts`
Expected: PASS.

- [ ] **Step 5: Render it in the connection row**

In `WorkspacePanel`, add state and a loader beside the existing probe state:

```tsx
  const [genudo, setGenudo] = useState<GenudoStatus | null>(null)
  const [signingIn, setSigningIn] = useState(false)
```

Inside `refreshAll`, after the `clients.connections` call:

```tsx
    void invoke('clients.genudo.status', { client: info.slug })
      .then(setGenudo)
      .catch(() => setGenudo(null))
```

And in the per-connection row, for `c.server === 'genudo'` only, render before the existing paste field:

```tsx
{c.server === 'genudo' && genudo && (
  <div className="cp-ws-genudo">
    <span className="cp-ws-genudo-state">{genudoLabel(genudo).text}</span>
    <Button
      variant={genudo.signedIn ? 'secondary' : 'primary'}
      disabled={signingIn}
      onClick={() => {
        setSigningIn(true)
        const done = (): void => {
          setSigningIn(false)
          refreshAll(true)
        }
        const channel = genudoLabel(genudo).action === 'Sign out'
          ? 'clients.genudo.signOut'
          : 'clients.genudo.signIn'
        void invoke(channel, { client: info.slug })
          .then(done)
          .catch((e) => {
            done()
            useToasts.getState().push('Genudo sign-in failed', reason(e))
          })
      }}
    >
      {signingIn ? 'Waiting for the browser…' : genudoLabel(genudo).action}
    </Button>
  </div>
)}
```

Import `Button` from `../../components/Button` and `genudoLabel`, `type GenudoStatus` from `./client-page`. Keep the existing paste field exactly where it is — it is the documented fallback for self-hosted and CI.

- [ ] **Step 6: Verify**

Run: `npx vitest run src/renderer/src/views/clients/ && npm run typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 7: Manual check against a real client**

```bash
npm run dev
```
Open one client → **Sign in to Genudo** → complete consent in the browser → the row reads *Signed in as …* → **Test** reports connected with a tool count → **Pull** succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/views/clients/ClientPage.tsx src/renderer/src/views/clients/client-page.ts src/renderer/src/views/clients/client-page.test.ts
git commit -m "feat(clients): sign in to genudo from the client's connection row"
```

---

## Deferred to a second plan

The plugin **installer and update check** (spec §4a/4b) is independent of everything above and gets its own plan: a `genudo-no-connector` install card following the existing n8n/langsmith shape in `claude-plugins.ts`, plus an update badge that compares the **per-scope** `version` entries in `~/.claude/plugins/installed_plugins.json` (an array — reading `[0]` misses the project-scope install) against the public mirror's `plugin.json`. The `genudo-desktop` → `genudo-no-connector` rename needs uninstall + install, not `claude plugin update`.

What this plan *does* cover from that area: Task 6 swaps the plugin id in every `workspace.yml` and prunes the stale `genudo@genudo-ai` key, which is what stops the bundled connector from colliding with the per-client one.

## Manual verification before calling this done

1. `rm -rf ~/.npm/_npx` — this machine's cache holds 1.1.0 / 2.3.1 / 2.3.2, all SSE-era.
2. `claude plugin uninstall genudo@genudo-ai` at **both** user and project scope (`clients_work/projects/arabicss`), and `claude plugin uninstall genudo-desktop@genudo-ai`.
3. Install `genudo-no-connector` from the local zip, then confirm `claude mcp list` in a migrated client dir shows exactly one `genudo` server pointing at `https://api.genudo.ai/mcp`. `claude plugin details` reports "MCP servers (0)" regardless and cannot be used for this.
4. Diff one client's pull output bridge-vs-direct before trusting the new pull — the backend may or may not truncate long `instructions` / `persona` fields, and the pull writes into the vault as if the content were complete.
5. Start a Codex session in a migrated client dir and confirm Genudo tools are present. The adapter advertises http, so this confirms it *honours* what it advertises — the one thing reading the package could not prove.
