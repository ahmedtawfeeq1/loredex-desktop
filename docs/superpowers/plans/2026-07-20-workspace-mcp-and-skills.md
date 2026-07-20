# Workspace MCP Servers & Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give loredex a third category of MCP server — workspace-level, belonging to the whole vault rather than one client — with n8n-mcp as its first member, a one-time API key in Settings, a live tools inventory, and button-driven setup for the Claude skills plugin.

**Architecture:** A code-defined registry (`workspace-mcp.ts`) replaces the hardcoded loredex-mcp injection in `acp.ts`; each entry builds an ACP `McpServer` at session start. n8n-mcp is installed on demand into `<userData>/mcp/n8n-mcp/` (never bundled — it is 105 MB) and spawned as stdio under `process.execPath` with `ELECTRON_RUN_AS_NODE=1`. The n8n API key follows the existing `agent-keys.ts` keychain pattern. Anything loredex cannot honestly do itself (the `/plugin install` TUI command) becomes a setup card with Open-terminal + Verify.

**Tech Stack:** TypeScript, Electron (main / core utilityProcess / sandboxed renderer), React + Zustand, vitest, `@agentclientprotocol/sdk`, `@modelcontextprotocol/sdk`, better-sqlite3 (app.db only).

## Global Constraints

- **Pinned n8n-mcp version: `2.65.1`.** Exact string, one place (`N8N_MCP_VERSION`).
- **Install always uses `--omit=optional`.** n8n-mcp's only optional dep is `better-sqlite3`, a native module whose ABI will not match Electron's. Omitting forces the pure-WASM `sql.js` path. Non-negotiable.
- **Never gate stdio injection on an advertised capability.** The Claude adapter reports `mcpCapabilities: {http, sse}` — no stdio — yet honours stdio. Verified 2026-07-20.
- **Never use `require.resolve` for n8n-mcp — CONSTRUCT the path.** Two independent reasons: (a) the package restricts its `exports` map, so `require.resolve('n8n-mcp/package.json')` throws; (b) it is installed into `<userData>/mcp/n8n-mcp/node_modules/`, which is outside every module-resolution root the core host has, so even `require.resolve('n8n-mcp')` would throw MODULE_NOT_FOUND. The only correct form is `join(mcpInstallDir('n8n-mcp'), 'node_modules/n8n-mcp/dist/mcp/stdio-wrapper.js')`, returning `null` when it does not exist. *(Corrected during Task 3 — the earlier wording described the spike layout, not the install layout.)*
- **Secrets:** the n8n API key never enters `process.env`, the vault, a commit, a renderer payload, or a log. Only presence crosses the IPC seam.
- **Research-dex safety:** nothing in this feature writes to the vault. No `requireAgentOps` guard is needed, and no dex file may change.
- **Naming:** internal loredex MCP tools use the `vault_*` prefix. This feature adds no MCP tools, so the rule is only a don't-break constraint.
- **Env for n8n-mcp, exactly:** `MCP_MODE=stdio`, `LOG_LEVEL=error`, `DISABLE_CONSOLE_OUTPUT=true` (all three keep debug output off stdout, which is the wire), plus `N8N_API_URL`/`N8N_API_KEY` when set, plus `ELECTRON_RUN_AS_NODE=1`, `PATH`, `HOME`.
- **Tests:** the full suite has a known flake under 16-worker parallelism in git-heavy core tests. Re-run failures with `--no-file-parallelism` before treating one as real.

---

### Task 1: `userData` path accessor for the core host

The core host receives `--user-data <dir>` but only `initAppDb`/`initSettings` consume it; nothing exposes it. The n8n install directory needs it.

**Files:**
- Create: `src/core/paths.ts`
- Modify: `src/core/index.ts` (after the `userDataDir` const, ~line 49)
- Test: `src/core/paths.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `setUserDataDir(dir: string | undefined): void`, `getUserDataDir(): string | null`, `mcpInstallDir(id: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/paths.test.ts
/**
 * The core host is handed --user-data; the n8n install lands beside app.db so it
 * survives the app bundle being replaced.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { getUserDataDir, mcpInstallDir, setUserDataDir } from './paths'

describe('core paths', () => {
  beforeEach(() => setUserDataDir(undefined))

  it('reports null before it is set', () => {
    expect(getUserDataDir()).toBeNull()
  })

  it('puts an MCP install under <userData>/mcp/<id>', () => {
    setUserDataDir('/tmp/ud')
    expect(mcpInstallDir('n8n-mcp')).toBe('/tmp/ud/mcp/n8n-mcp')
  })

  it('throws for an install path when there is no userData (bare test host)', () => {
    expect(() => mcpInstallDir('n8n-mcp')).toThrow(/no user-data directory/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/paths.test.ts`
Expected: FAIL — `Failed to resolve import "./paths"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/paths.ts
/**
 * Where the core host may write machine-local, non-vault data. `--user-data` is
 * passed by main at spawn; a bare test host has none, so every path accessor
 * fails loudly rather than silently writing somewhere unexpected.
 */
import { join } from 'node:path'

let userDataDir: string | null = null

export function setUserDataDir(dir: string | undefined): void {
  userDataDir = dir ?? null
}

export function getUserDataDir(): string | null {
  return userDataDir
}

/**
 * An on-demand MCP server's install root — beside app.db, so it survives the app
 * bundle being replaced (the same reason app.db lives there).
 */
export function mcpInstallDir(id: string): string {
  if (!userDataDir) throw new Error('no user-data directory — cannot install an MCP server')
  return join(userDataDir, 'mcp', id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/paths.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it in the core host**

In `src/core/index.ts`, immediately after the `const userDataDir = ...` line, add:

```ts
setUserDataDir(userDataDir)
```

and add to the imports at the top of the file:

```ts
import { setUserDataDir } from './paths'
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no output after the two `tsc` lines.

- [ ] **Step 7: Commit**

```bash
git add src/core/paths.ts src/core/paths.test.ts src/core/index.ts
git commit -m "feat(core): expose the user-data dir for on-demand MCP installs"
```

---

### Task 2: n8n API key + instance URL storage

The key follows `agent-keys.ts` exactly: OS keychain, in-memory cache, folded into that server's env at spawn. The **URL is not a secret** and goes in settings (`meta` table); only the key goes to the keychain.

**Files:**
- Create: `src/core/n8n-config.ts`
- Test: `src/core/n8n-config.test.ts`

**Interfaces:**
- Consumes: `storeClientToken(ref, token)`, `readClientToken(ref)`, `deleteClientToken(ref)` from `./client-tokens`; `readKey`/`writeKey` are module-private in `settings.ts`, so use the exported `loadN8nUrl`/`saveN8nUrl` added here via `appSettingGet`-style meta access — see Step 3.
- Produces: `loadN8nConfig(): Promise<void>`, `n8nStatus(): {hasKey: boolean; url: string | null}`, `setN8nKey(key: string): Promise<void>`, `clearN8nKey(): Promise<void>`, `setN8nUrl(url: string | null): void`, `n8nEnv(): Record<string, string>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/n8n-config.test.ts
/**
 * The n8n API key is a secret (keychain); the instance URL is not (meta table).
 * Only PRESENCE of the key may cross the IPC seam — n8nStatus never returns it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.mock('./client-tokens', () => ({
  storeClientToken: async (ref: string, tok: string) => void store.set(ref, tok),
  readClientToken: async (ref: string) => store.get(ref) ?? null,
  deleteClientToken: async (ref: string) => void store.delete(ref),
}))

const meta = new Map<string, string | null>()
vi.mock('./db/index', () => ({
  getAppDb: () => ({}) as never,
  metaGet: (_db: unknown, k: string) => meta.get(k) ?? null,
  metaSet: (_db: unknown, k: string, v: string | null) => void meta.set(k, v),
}))

const mod = await import('./n8n-config')

describe('n8n config', () => {
  beforeEach(async () => {
    store.clear()
    meta.clear()
    await mod.clearN8nKey()
    mod.setN8nUrl(null)
  })

  it('reports no key and no url when nothing is set', () => {
    expect(mod.n8nStatus()).toEqual({ hasKey: false, url: null })
  })

  it('never returns the key itself — only presence', async () => {
    await mod.setN8nKey('secret-abc')
    const status = mod.n8nStatus()
    expect(status.hasKey).toBe(true)
    expect(JSON.stringify(status)).not.toContain('secret-abc')
  })

  it('builds the documentation-only env when no key is set', () => {
    expect(mod.n8nEnv()).toEqual({
      MCP_MODE: 'stdio',
      LOG_LEVEL: 'error',
      DISABLE_CONSOLE_OUTPUT: 'true',
    })
  })

  it('adds the url and key to the env once both are set', async () => {
    mod.setN8nUrl('https://n8n.example.com')
    await mod.setN8nKey('secret-abc')
    expect(mod.n8nEnv()).toEqual({
      MCP_MODE: 'stdio',
      LOG_LEVEL: 'error',
      DISABLE_CONSOLE_OUTPUT: 'true',
      N8N_API_URL: 'https://n8n.example.com',
      N8N_API_KEY: 'secret-abc',
    })
  })

  it('omits the key when only a url is set — half-configured is documentation-only', () => {
    mod.setN8nUrl('https://n8n.example.com')
    expect(mod.n8nEnv().N8N_API_KEY).toBeUndefined()
    expect(mod.n8nEnv().N8N_API_URL).toBeUndefined()
  })

  it('never writes the key into process.env', async () => {
    await mod.setN8nKey('secret-abc')
    expect(process.env.N8N_API_KEY).toBeUndefined()
  })

  it('reloads the key from the keychain', async () => {
    await mod.setN8nKey('secret-abc')
    await mod.clearN8nKey()
    expect(mod.n8nStatus().hasKey).toBe(false)
    store.set('workspace-mcp/n8n/N8N_API_KEY', 'secret-abc')
    await mod.loadN8nConfig()
    expect(mod.n8nStatus().hasKey).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/n8n-config.test.ts`
Expected: FAIL — cannot resolve `./n8n-config`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/n8n-config.ts
/**
 * n8n instance configuration. The API KEY is a secret and lives in the OS
 * keychain (client-tokens), cached in memory and folded into the n8n MCP
 * server's OWN env at spawn — never process.env (so the embedded pty never
 * inherits it), never the vault, never a commit, never a renderer payload.
 * Only presence crosses the seam.
 *
 * The instance URL is NOT a secret and lives in app.db's meta table like any
 * other setting.
 *
 * The key is OPTIONAL: without it n8n-mcp still serves 7 documentation and
 * validation tools; with it, 17 more for creating and running workflows. Both
 * URL and key are required together — a URL with no key cannot authenticate, so
 * that half-configured state stays documentation-only rather than emitting a
 * config the server would reject.
 */
import { deleteClientToken, readClientToken, storeClientToken } from './client-tokens'
import { getAppDb, metaGet, metaSet } from './db/index'

const KEY_REF = 'workspace-mcp/n8n/N8N_API_KEY'
const URL_KEY = 'workspace-mcp:n8n:url'

/** in-memory only — never process.env */
let apiKey: string | null = null
let apiUrl: string | null = null

export async function loadN8nConfig(): Promise<void> {
  apiKey = await readClientToken(KEY_REF)
  const db = getAppDb()
  apiUrl = db ? metaGet(db, URL_KEY) : null
}

export async function setN8nKey(key: string): Promise<void> {
  await storeClientToken(KEY_REF, key)
  apiKey = key // live for the next spawn — no restart
}

export async function clearN8nKey(): Promise<void> {
  await deleteClientToken(KEY_REF)
  apiKey = null
}

export function setN8nUrl(url: string | null): void {
  apiUrl = url && url.trim() ? url.trim() : null
  const db = getAppDb()
  if (db) metaSet(db, URL_KEY, apiUrl)
}

/** Presence only — the key itself never crosses the seam. */
export function n8nStatus(): { hasKey: boolean; url: string | null } {
  return { hasKey: apiKey !== null, url: apiUrl }
}

/** The env n8n-mcp is spawned with. The three log/mode vars are REQUIRED: they
 *  keep the server's debug output off stdout, which is the MCP wire. */
export function n8nEnv(): Record<string, string> {
  const env: Record<string, string> = {
    MCP_MODE: 'stdio',
    LOG_LEVEL: 'error',
    DISABLE_CONSOLE_OUTPUT: 'true',
  }
  if (apiUrl && apiKey) {
    env.N8N_API_URL = apiUrl
    env.N8N_API_KEY = apiKey
  }
  return env
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/n8n-config.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/n8n-config.ts src/core/n8n-config.test.ts
git commit -m "feat(core): n8n API key in the keychain, instance URL in settings"
```

---

### Task 3: On-demand n8n-mcp installer

**Files:**
- Create: `src/core/n8n-install.ts`
- Test: `src/core/n8n-install.test.ts`

**Interfaces:**
- Consumes: `mcpInstallDir(id)` from `./paths`.
- Produces: `N8N_MCP_VERSION`, `n8nEntryPath(): string | null`, `isN8nInstalled(): boolean`, `installN8nMcp(onLog?): Promise<{ok: boolean; detail: string}>`, `n8nInstallCommand(): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/n8n-install.test.ts
/**
 * The installer is the one part that touches the network, so the unit tests
 * cover only the pure surface: where things land, how presence is detected, and
 * the exact fallback command a user is shown when the install cannot run.
 * `--omit=optional` is asserted because it is load-bearing: n8n-mcp's optional
 * better-sqlite3 is native and its ABI will not match Electron's.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { setUserDataDir } from './paths'
import {
  N8N_MCP_VERSION,
  isN8nInstalled,
  n8nEntryPath,
  n8nInstallCommand,
} from './n8n-install'

let ud: string

beforeEach(() => {
  ud = mkdtempSync(join(tmpdir(), 'loredex-n8n-'))
  setUserDataDir(ud)
})

describe('n8n-mcp install', () => {
  it('pins an exact version', () => {
    expect(N8N_MCP_VERSION).toBe('2.65.1')
  })

  it('reports not installed on a clean user-data dir', () => {
    expect(isN8nInstalled()).toBe(false)
    expect(n8nEntryPath()).toBeNull()
  })

  it('finds the stdio wrapper once the package is present', () => {
    const dir = join(ud, 'mcp', 'n8n-mcp', 'node_modules', 'n8n-mcp', 'dist', 'mcp')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'stdio-wrapper.js'), '')
    expect(isN8nInstalled()).toBe(true)
    expect(n8nEntryPath()).toBe(join(dir, 'stdio-wrapper.js'))
  })

  it('the shown fallback command pins the version and omits optional deps', () => {
    const cmd = n8nInstallCommand()
    expect(cmd).toContain(`n8n-mcp@${N8N_MCP_VERSION}`)
    // load-bearing: the optional dep is native and would break under Electron
    expect(cmd).toContain('--omit=optional')
    expect(cmd).toContain(join(ud, 'mcp', 'n8n-mcp'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/n8n-install.test.ts`
Expected: FAIL — cannot resolve `./n8n-install`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/n8n-install.ts
/**
 * n8n-mcp is installed ON DEMAND, not bundled: the package is 105 MB installed
 * (data/nodes.db alone is 96 MB, the offline n8n node documentation), and
 * bundling it would roughly double every release asset for an opt-in feature.
 *
 * It lands in <userData>/mcp/n8n-mcp/ — beside app.db, so it survives the app
 * bundle being replaced — at a PINNED version.
 *
 * `--omit=optional` is load-bearing, not tidiness: n8n-mcp's only optional
 * dependency is better-sqlite3, a NATIVE module. A build compiled for one Node
 * ABI does not load under Electron's (this project has already been bitten by
 * exactly that). Omitting it forces the required pure-WASM sql.js path — no
 * compiler needed on the user's machine, no Windows build toolchain, and
 * measured FASTER to start (427 ms vs 1113 ms).
 *
 * We spawn the resolved entry under our own node, so `npx` is never involved and
 * the Windows npx.cmd problem (BL-24) does not arise.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { mcpInstallDir } from './paths'

export const N8N_MCP_VERSION = '2.65.1'

const INSTALL_ID = 'n8n-mcp'

function root(): string {
  return mcpInstallDir(INSTALL_ID)
}

/**
 * The stdio entry, or null when not installed. NOTE: n8n-mcp restricts its
 * `exports` map, so `require.resolve('n8n-mcp/package.json')` — the trick
 * adapterEntry uses for the ACP adapters — THROWS on this package. The path is
 * therefore constructed directly from the known install layout.
 */
export function n8nEntryPath(): string | null {
  let dir: string
  try {
    dir = root()
  } catch {
    return null // no user-data (bare host) — nothing can be installed
  }
  const entry = join(dir, 'node_modules', 'n8n-mcp', 'dist', 'mcp', 'stdio-wrapper.js')
  return existsSync(entry) ? entry : null
}

export function isN8nInstalled(): boolean {
  return n8nEntryPath() !== null
}

/** The exact command the setup card shows when the in-app install cannot run. */
export function n8nInstallCommand(): string {
  return `npm install n8n-mcp@${N8N_MCP_VERSION} --omit=optional --prefix "${root()}"`
}

/**
 * Install (or repair) the pinned package. Best-effort: a GUI-launched app does
 * not inherit a login shell's PATH, so npm may simply not be reachable — that is
 * NOT a dead end, it degrades to the setup card showing n8nInstallCommand().
 */
export async function installN8nMcp(
  onLog: (line: string) => void = () => {},
): Promise<{ ok: boolean; detail: string }> {
  let dir: string
  try {
    dir = root()
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) }
  }
  return await new Promise((resolve) => {
    const child = execFile(
      'npm',
      ['install', `n8n-mcp@${N8N_MCP_VERSION}`, '--omit=optional', '--no-audit', '--no-fund', '--prefix', dir],
      { timeout: 600_000 },
      (err) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code
          resolve({
            ok: false,
            detail:
              code === 'ENOENT'
                ? 'npm was not found on this app’s PATH — run the command below in a terminal instead'
                : err.message.split('\n')[0],
          })
          return
        }
        resolve(
          isN8nInstalled()
            ? { ok: true, detail: `n8n-mcp ${N8N_MCP_VERSION} installed` }
            : { ok: false, detail: 'install reported success but the entry is missing' },
        )
      },
    )
    child.stderr?.on('data', (d: Buffer) => onLog(d.toString()))
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/n8n-install.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/n8n-install.ts src/core/n8n-install.test.ts
git commit -m "feat(core): on-demand pinned n8n-mcp install, optional deps omitted"
```

---

### Task 4: The workspace server registry

Replaces the hardcoded loredex-mcp block in `acp.ts` with a registry loop. **`acp.test.ts` must pass unchanged** — this refactors behaviour, it does not alter it.

**Files:**
- Create: `src/core/workspace-mcp.ts`
- Modify: `src/core/acp.ts:526-555` (the `let mcpServers: McpServer[] = []` block)
- Test: `src/core/workspace-mcp.test.ts`

**Interfaces:**
- Consumes: `n8nEnv()`, `n8nStatus()` from `./n8n-config`; `n8nEntryPath()` from `./n8n-install`; `getMcpStatus()` from `./mcp-server`; `readDiscovery()` from `./discovery`; `mintAgentToken(name)` from `./settings`.
- Produces: `WorkspaceServerId = 'loredex' | 'n8n'`, `buildWorkspaceServers(ctx: WorkspaceCtx): McpServer[]`, `workspaceServerStates(): WorkspaceServerState[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/workspace-mcp.test.ts
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

const { buildWorkspaceServers } = await import('./workspace-mcp')

const CTX = { loredex: null, httpOk: true, enabled: { loredex: true, n8n: true } }

describe('buildWorkspaceServers', () => {
  beforeEach(() => {
    entry = null
    env = { MCP_MODE: 'stdio' }
  })

  it('omits n8n entirely when it is not installed', () => {
    expect(buildWorkspaceServers(CTX)).toEqual([])
  })

  it('emits a stdio server once installed', () => {
    entry = '/ud/mcp/n8n-mcp/node_modules/n8n-mcp/dist/mcp/stdio-wrapper.js'
    const [server] = buildWorkspaceServers(CTX)
    expect(server.name).toBe('n8n')
    expect(server).not.toHaveProperty('type') // stdio is the untagged union arm
    expect(server.args).toEqual([entry])
    expect(server.env).toContainEqual({ name: 'MCP_MODE', value: 'stdio' })
    expect(server.env).toContainEqual({ name: 'ELECTRON_RUN_AS_NODE', value: '1' })
  })

  it('carries the key ONLY inside env, never elsewhere in the payload', () => {
    entry = '/ud/entry.js'
    env = { MCP_MODE: 'stdio', N8N_API_URL: 'https://n8n.example.com', N8N_API_KEY: 'sek' }
    const [server] = buildWorkspaceServers(CTX)
    const { env: serverEnv, ...rest } = server as Record<string, unknown>
    expect(JSON.stringify(rest)).not.toContain('sek')
    expect(serverEnv).toContainEqual({ name: 'N8N_API_KEY', value: 'sek' })
  })

  it('omits a server the user has disabled', () => {
    entry = '/ud/entry.js'
    expect(buildWorkspaceServers({ ...CTX, enabled: { loredex: true, n8n: false } })).toEqual([])
  })

  it('emits the loredex http server when this window owns the host', () => {
    const [server] = buildWorkspaceServers({
      ...CTX,
      loredex: { url: 'http://127.0.0.1:52017/', token: 'tok' },
      enabled: { loredex: true, n8n: false },
    })
    expect(server).toMatchObject({ type: 'http', name: 'loredex', url: 'http://127.0.0.1:52017/' })
    expect(server.headers).toContainEqual({ name: 'Authorization', value: 'Bearer tok' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/workspace-mcp.test.ts`
Expected: FAIL — cannot resolve `./workspace-mcp`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/workspace-mcp.ts
/**
 * WORKSPACE MCP servers — the third category, alongside our own loredex host and
 * the per-client `.mcp.json` servers the adapter discovers from its cwd. These
 * belong to the whole vault: one n8n instance, one key, every session.
 *
 * Registry-driven so adding a server is one row, not a new branch in acp.ts.
 */
import type { McpServer } from '@agentclientprotocol/sdk'
import { n8nEnv } from './n8n-config'
import { n8nEntryPath } from './n8n-install'

export type WorkspaceServerId = 'loredex' | 'n8n'

export interface WorkspaceCtx {
  /** the loredex http host this session should use, or null when unreachable */
  loredex: { url: string; token: string } | null
  /** the adapter advertised mcpCapabilities.http */
  httpOk: boolean
  enabled: Record<WorkspaceServerId, boolean>
}

const asEnv = (env: Record<string, string>): { name: string; value: string }[] =>
  Object.entries(env).map(([name, value]) => ({ name, value }))

/**
 * Build the servers for one session. A server that cannot be built correctly is
 * OMITTED, never half-built: a malformed entry can fail the whole session, and
 * losing one optional tool set is strictly better than losing the session.
 */
export function buildWorkspaceServers(ctx: WorkspaceCtx): McpServer[] {
  const servers: McpServer[] = []

  if (ctx.enabled.loredex && ctx.httpOk && ctx.loredex) {
    servers.push({
      type: 'http',
      name: 'loredex',
      url: ctx.loredex.url,
      headers: [{ name: 'Authorization', value: `Bearer ${ctx.loredex.token}` }],
    } as McpServer)
  }

  if (ctx.enabled.n8n) {
    const entry = n8nEntryPath()
    // not installed → omit. The Settings card is where the user installs it.
    if (entry) {
      servers.push({
        name: 'n8n',
        command: process.execPath,
        args: [entry],
        // ELECTRON_RUN_AS_NODE makes our Electron binary behave as plain node —
        // the same trick the ACP adapters use, so no system node is relied on.
        env: asEnv({ ...n8nEnv(), ELECTRON_RUN_AS_NODE: '1', PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' }),
      } as McpServer)
    }
  }

  return servers
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/workspace-mcp.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Replace the hardcoded block in `acp.ts`**

In `src/core/acp.ts`, replace the whole `let mcpServers: McpServer[] = []` … `}` block (the `if (httpOk && mcp.state === 'running' …) else if (httpOk) { readDiscovery() … }` chain) with:

```ts
  const httpOk = init.agentCapabilities?.mcpCapabilities?.http === true
  const mcp = getMcpStatus()
  // Which loredex host this session talks to: ours when this window owns the
  // port, else the MAIN window's via its discovery file (a pop-out's core loses
  // the bind and reads the winner's file — BL-21).
  let loredexHost: { url: string; token: string } | null = null
  if (mcp.state === 'running' && mcp.port !== null) {
    s.tokenName = `acp:${agent}:${sessionId.slice(0, 8)}`
    loredexHost = { url: `http://127.0.0.1:${mcp.port}/`, token: mintAgentToken(s.tokenName) }
  } else {
    const disc = readDiscovery()
    if (disc) loredexHost = { url: `http://127.0.0.1:${disc.port}/`, token: disc.token }
  }
  // NOTE: n8n is stdio and is emitted regardless of `httpOk` — the Claude
  // adapter advertises mcpCapabilities {http, sse} with NO stdio, yet honours
  // stdio servers (verified 2026-07-20). Never gate stdio on the capability.
  let mcpServers: McpServer[] = buildWorkspaceServers({
    loredex: loredexHost,
    httpOk,
    enabled: loadWorkspaceEnabled(),
  })
```

Add the imports at the top of `acp.ts`:

```ts
import { buildWorkspaceServers } from './workspace-mcp'
import { loadWorkspaceEnabled } from './settings'
```

- [ ] **Step 6: Add the enabled-state setting**

In `src/core/settings.ts`, append:

```ts
/** Which workspace MCP servers are enabled. loredex defaults ON (it is ours and
 *  free); n8n defaults OFF because enabling it downloads ~154 MB. */
export function loadWorkspaceEnabled(): { loredex: boolean; n8n: boolean } {
  const raw = readJsonKey('workspace-mcp-enabled')
  const v = (raw ?? {}) as Partial<Record<'loredex' | 'n8n', boolean>>
  return { loredex: v.loredex !== false, n8n: v.n8n === true }
}

export function setWorkspaceEnabled(id: 'loredex' | 'n8n', on: boolean): void {
  writeKey('workspace-mcp-enabled', JSON.stringify({ ...loadWorkspaceEnabled(), [id]: on }))
}
```

- [ ] **Step 7: Prove the refactor changed nothing**

Run: `npx vitest run src/core/acp.test.ts src/core/workspace-mcp.test.ts`
Expected: PASS. `acp.test.ts` must pass **with no edits to it** — if it needs changing, the refactor altered behaviour and must be corrected instead.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck
git add src/core/workspace-mcp.ts src/core/workspace-mcp.test.ts src/core/acp.ts src/core/settings.ts
git commit -m "refactor(acp): workspace MCP registry; loredex becomes a row, n8n joins it"
```

---

### Task 5: Live tools inventory

Tool names are read from the running server, never hardcoded, so the Settings list cannot drift from reality.

**Files:**
- Create: `src/core/mcp-tools.ts`
- Test: `src/core/mcp-tools.test.ts`

**Interfaces:**
- Consumes: `n8nEntryPath()`, `n8nEnv()`.
- Produces: `probeStdioTools(command: string, args: string[], env: Record<string,string>, timeoutMs?: number): Promise<{ok: boolean; tools: string[]; detail: string}>`.

- [ ] **Step 1: Write the failing test**

A real MCP handshake against a **fake stdio server** — no network, no n8n, deterministic.

```ts
// src/core/mcp-tools.test.ts
/**
 * Tools are read live so the Settings list cannot drift. Proven against a fake
 * stdio MCP server so the test needs no network and no n8n install.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { probeStdioTools } from './mcp-tools'

/** A minimal MCP server: answers initialize + tools/list over stdio. */
function fakeServer(): string {
  const dir = mkdtempSync(join(tmpdir(), 'loredex-fakemcp-'))
  const file = join(dir, 'server.mjs')
  writeFileSync(
    file,
    `let buf = ''
process.stdin.on('data', (d) => {
  buf += d
  let i
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
    if (!line) continue
    const m = JSON.parse(line)
    if (m.method === 'initialize') {
      write({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } } })
    } else if (m.method === 'tools/list') {
      write({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'alpha', inputSchema: { type: 'object' } }, { name: 'beta', inputSchema: { type: 'object' } }] } })
    } else if (m.id !== undefined) {
      write({ jsonrpc: '2.0', id: m.id, result: {} })
    }
  }
})
function write(o) { process.stdout.write(JSON.stringify(o) + '\\n') }
`,
  )
  return file
}

describe('probeStdioTools', () => {
  it('returns the tool names a server actually advertises', async () => {
    const res = await probeStdioTools(process.execPath, [fakeServer()], {})
    expect(res.ok).toBe(true)
    expect(res.tools).toEqual(['alpha', 'beta'])
  })

  it('fails cleanly when the command does not exist — never throws', async () => {
    const res = await probeStdioTools('/nonexistent/binary', [], {}, 3000)
    expect(res.ok).toBe(false)
    expect(res.tools).toEqual([])
    expect(res.detail).not.toBe('')
  })

  it('times out rather than hanging on a silent server', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'loredex-mute-'))
    const mute = join(dir, 'mute.mjs')
    writeFileSync(mute, 'setInterval(() => {}, 1000)')
    const res = await probeStdioTools(process.execPath, [mute], {}, 1500)
    expect(res.ok).toBe(false)
  }, 10_000)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/mcp-tools.test.ts`
Expected: FAIL — cannot resolve `./mcp-tools`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/mcp-tools.ts
/**
 * Read a stdio MCP server's advertised tools by doing a real handshake:
 * initialize + tools/list, then kill it. Bounded by a timeout so a wedged server
 * cannot hang the Settings page, and never throws — the caller renders the
 * failure instead.
 *
 * Live rather than hardcoded: a static list would silently drift from what the
 * server actually offers after any version bump.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const DEFAULT_TIMEOUT_MS = 9000

export async function probeStdioTools(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean; tools: string[]; detail: string }> {
  const client = new Client({ name: 'loredex-tools-probe', version: '1.0.0' })
  const transport = new StdioClientTransport({ command, args, env })
  let timer: NodeJS.Timeout | undefined
  try {
    const work = (async (): Promise<string[]> => {
      await client.connect(transport)
      const { tools } = await client.listTools()
      return tools.map((t) => t.name)
    })()
    const tools = await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no response within ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
    return { ok: true, tools, detail: `${tools.length} tools` }
  } catch (e) {
    return { ok: false, tools: [], detail: e instanceof Error ? e.message.split('\n')[0] : String(e) }
  } finally {
    if (timer) clearTimeout(timer)
    try {
      await client.close()
    } catch {
      // already dead — closing a failed probe is best-effort
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/mcp-tools.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/mcp-tools.ts src/core/mcp-tools.test.ts
git commit -m "feat(core): live tools/list probe for stdio MCP servers"
```

---

### Task 6: Claude skills plugin detection

**Files:**
- Create: `src/core/claude-plugins.ts`
- Test: `src/core/claude-plugins.test.ts`

**Interfaces:**
- Produces: `N8N_SKILLS_PLUGIN`, `N8N_SKILLS_COMMAND`, `hasPluginInstalled(pluginName: string, home?: string): boolean`, `terminalN8nCommand(url: string | null): string`, `hasTerminalN8nMcp(): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/claude-plugins.test.ts
/**
 * `/plugin install` only runs inside a claude TUI session, so loredex cannot
 * perform it — it can only VERIFY it. The check must fail CLOSED: a missing or
 * malformed registry is "not installed", never an optimistic green, and never a
 * throw that would take the Settings page down.
 *
 * Registry shape verified on a real machine 2026-07-20:
 *   {"version":2,"plugins":{"<plugin>@<marketplace>":[{...}]}}
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { N8N_SKILLS_PLUGIN, hasPluginInstalled } from './claude-plugins'

function homeWith(contents: string | null): string {
  const home = mkdtempSync(join(tmpdir(), 'loredex-claude-home-'))
  if (contents !== null) {
    mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
    writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), contents)
  }
  return home
}

describe('hasPluginInstalled', () => {
  it('finds the plugin regardless of which marketplace it came from', () => {
    const home = homeWith(
      JSON.stringify({ version: 2, plugins: { 'n8n-mcp-skills@czlonkowski': [{ scope: 'user' }] } }),
    )
    expect(hasPluginInstalled(N8N_SKILLS_PLUGIN, home)).toBe(true)
  })

  it('is false when a different plugin is installed', () => {
    const home = homeWith(
      JSON.stringify({ version: 2, plugins: { 'code-review@claude-plugins-official': [{}] } }),
    )
    expect(hasPluginInstalled(N8N_SKILLS_PLUGIN, home)).toBe(false)
  })

  it('does not match a plugin whose name merely CONTAINS the target', () => {
    const home = homeWith(
      JSON.stringify({ version: 2, plugins: { 'not-n8n-mcp-skills@x': [{}] } }),
    )
    expect(hasPluginInstalled(N8N_SKILLS_PLUGIN, home)).toBe(false)
  })

  it('fails closed on a missing registry', () => {
    expect(hasPluginInstalled(N8N_SKILLS_PLUGIN, homeWith(null))).toBe(false)
  })

  it('fails closed on a malformed registry rather than throwing', () => {
    expect(hasPluginInstalled(N8N_SKILLS_PLUGIN, homeWith('{not json'))).toBe(false)
    expect(hasPluginInstalled(N8N_SKILLS_PLUGIN, homeWith('{"version":2}'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/claude-plugins.test.ts`
Expected: FAIL — cannot resolve `./claude-plugins`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/claude-plugins.ts
/**
 * Claude Code plugin detection. `/plugin install` is a TUI command inside a
 * running `claude` session — loredex cannot invoke it, so it verifies instead
 * and shows the user the command to run (the button + command + Verify pattern).
 *
 * Registry: ~/.claude/plugins/installed_plugins.json, shape
 *   {"version":2,"plugins":{"<plugin>@<marketplace>":[{...}]}}
 * Keys are `<plugin>@<marketplace>`, so the match is on the part before '@' —
 * the same plugin may come from different marketplaces.
 *
 * Every failure path returns FALSE. A false green here would tell the user their
 * skills are active when they are not.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const N8N_SKILLS_PLUGIN = 'n8n-mcp-skills'
export const N8N_SKILLS_COMMAND = '/plugin install czlonkowski/n8n-skills'

export function hasPluginInstalled(pluginName: string, home: string = homedir()): boolean {
  try {
    const raw = readFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8')
    const parsed = JSON.parse(raw) as { plugins?: Record<string, unknown> }
    const plugins = parsed.plugins
    if (!plugins || typeof plugins !== 'object') return false
    // key is `<plugin>@<marketplace>` — split rather than substring-match, so
    // "not-n8n-mcp-skills@x" does not count as a hit
    return Object.keys(plugins).some((k) => k.split('@')[0] === pluginName)
  } catch {
    return false // missing, unreadable, or a format we no longer understand
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/claude-plugins.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the terminal-claude n8n card support**

Terminal-run `claude` reads its own config, not ours, so n8n reaches it only via
`claude mcp add`. Append to `src/core/claude-plugins.ts`:

```ts
import { execFile } from 'node:child_process'
import { N8N_MCP_VERSION } from './n8n-install'

/**
 * The command that gives TERMINAL-run `claude` the n8n server.
 *
 * SECURITY: the API key is a PLACEHOLDER, never the real key. Interpolating the
 * stored key here would carry it across the IPC seam to the renderer — the one
 * thing every credential path in this app refuses to do. The URL is not secret,
 * so it is filled in; the user pastes their own key.
 *
 * NOTE this is `npx`, not our resolved entry: the command runs in the USER's
 * shell under their own node, where npx is the documented invocation. Our
 * in-app injection still uses the resolved path and never touches npx.
 */
export function terminalN8nCommand(url: string | null): string {
  return [
    'claude mcp add n8n-mcp',
    '-e MCP_MODE=stdio',
    '-e LOG_LEVEL=error',
    '-e DISABLE_CONSOLE_OUTPUT=true',
    `-e N8N_API_URL=${url ?? '<your-n8n-url>'}`,
    '-e N8N_API_KEY=<paste-your-n8n-api-key>',
    `-- npx n8n-mcp@${N8N_MCP_VERSION}`,
  ].join(' ')
}

/** Is n8n-mcp registered with the user's own claude CLI? Fails closed. */
export async function hasTerminalN8nMcp(): Promise<boolean> {
  return await new Promise((resolve) => {
    execFile('claude', ['mcp', 'list'], { timeout: 10_000 }, (err, stdout) => {
      resolve(!err && stdout.includes('n8n-mcp'))
    })
  })
}
```

Add these tests to `claude-plugins.test.ts`:

```ts
describe('terminalN8nCommand', () => {
  it('NEVER contains a real key — only a placeholder', () => {
    const cmd = terminalN8nCommand('https://n8n.example.com')
    expect(cmd).toContain('<paste-your-n8n-api-key>')
    expect(cmd).toContain('https://n8n.example.com')
    expect(cmd).toContain('claude mcp add n8n-mcp')
  })

  it('falls back to a url placeholder when none is configured', () => {
    expect(terminalN8nCommand(null)).toContain('<your-n8n-url>')
  })
})
```

Import `terminalN8nCommand` in the test file.

Run: `npx vitest run src/core/claude-plugins.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/claude-plugins.ts src/core/claude-plugins.test.ts
git commit -m "feat(core): verify the n8n skills plugin and terminal MCP, failing closed"
```

---

### Task 7: IPC channels

**Files:**
- Modify: `src/shared/ipc-contract.ts` (CoreApi map)
- Modify: `src/core/handlers.ts` (registration block near the other settings channels)
- Modify: `src/core/index.ts` (call `loadN8nConfig()` at boot beside `loadAgentKeys()`)
- Test: `src/core/workspace-handlers.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–6.
- Produces: channels `workspace.mcp.list`, `workspace.mcp.setEnabled`, `workspace.mcp.tools`, `workspace.mcp.install`, `workspace.n8n.get`, `workspace.n8n.set`, `workspace.skills.status`.

- [ ] **Step 1: Add the contract entries**

In `src/shared/ipc-contract.ts`, inside `CoreApi`, after the `'vault.drift'` entry:

```ts
  /** Workspace-level MCP servers — ours + n8n, not per-client (2026-07-20 spec). */
  'workspace.mcp.list': {
    in: void
    out: {
      id: 'loredex' | 'n8n'
      label: string
      enabled: boolean
      installed: boolean
      /** 'documentation' when n8n has no key; 'full' with one; null for loredex */
      mode: 'documentation' | 'full' | null
    }[]
  }
  'workspace.mcp.setEnabled': { in: { id: 'loredex' | 'n8n'; on: boolean }; out: void }
  'workspace.mcp.tools': {
    in: { id: 'loredex' | 'n8n' }
    out: { ok: boolean; tools: string[]; detail: string }
  }
  /** Best-effort install; ok:false hands back the command for the setup card. */
  'workspace.mcp.install': { in: { id: 'n8n' }; out: { ok: boolean; detail: string; command: string } }
  /** Presence only — the key itself never crosses this seam. */
  'workspace.n8n.get': { in: void; out: { hasKey: boolean; url: string | null } }
  'workspace.n8n.set': { in: { url?: string | null; key?: string | null }; out: void }
  'workspace.skills.status': {
    in: void
    out: {
      installed: boolean
      command: string
      plugin: string
      /** the `claude mcp add` card for terminal-run claude. `command` carries a
       *  PLACEHOLDER key, never the stored one — it must not cross this seam. */
      terminal: { installed: boolean; command: string }
    }
  }
```

- [ ] **Step 2: Write the failing test**

```ts
// src/core/workspace-handlers.test.ts
/**
 * Seam-level guarantees: the key never crosses it, and disabling a server is
 * reflected in the list.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('./n8n-install', () => ({
  N8N_MCP_VERSION: '2.65.1',
  isN8nInstalled: () => false,
  n8nEntryPath: () => null,
  n8nInstallCommand: () => 'npm install n8n-mcp@2.65.1 --omit=optional --prefix "/ud/mcp/n8n-mcp"',
  installN8nMcp: async () => ({ ok: false, detail: 'npm not found' }),
}))

const { workspaceServerRows } = await import('./workspace-rows')

describe('workspaceServerRows', () => {
  it('marks n8n not installed and documentation-mode without a key', () => {
    const rows = workspaceServerRows({ loredex: true, n8n: true }, { hasKey: false, url: null })
    const n8n = rows.find((r) => r.id === 'n8n')
    expect(n8n).toMatchObject({ installed: false, enabled: true, mode: 'documentation' })
  })

  it('reports full mode once a key and url are set', () => {
    const rows = workspaceServerRows(
      { loredex: true, n8n: true },
      { hasKey: true, url: 'https://n8n.example.com' },
    )
    expect(rows.find((r) => r.id === 'n8n')?.mode).toBe('full')
  })

  it('never includes anything key-shaped in a row', () => {
    const rows = workspaceServerRows({ loredex: true, n8n: true }, { hasKey: true, url: 'https://x' })
    expect(JSON.stringify(rows)).not.toMatch(/N8N_API_KEY|secret/i)
  })

  it('reflects a disabled server', () => {
    const rows = workspaceServerRows({ loredex: true, n8n: false }, { hasKey: false, url: null })
    expect(rows.find((r) => r.id === 'n8n')?.enabled).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/core/workspace-handlers.test.ts`
Expected: FAIL — cannot resolve `./workspace-rows`.

- [ ] **Step 4: Write the row builder**

```ts
// src/core/workspace-rows.ts
/**
 * The Settings row model for workspace MCP servers — pure, so the seam contract
 * is unit-testable without a live core host.
 */
import { isN8nInstalled } from './n8n-install'

export interface WorkspaceRow {
  id: 'loredex' | 'n8n'
  label: string
  enabled: boolean
  installed: boolean
  mode: 'documentation' | 'full' | null
}

export function workspaceServerRows(
  enabled: { loredex: boolean; n8n: boolean },
  n8n: { hasKey: boolean; url: string | null },
): WorkspaceRow[] {
  return [
    {
      id: 'loredex',
      label: 'loredex',
      enabled: enabled.loredex,
      installed: true, // ours, always present
      mode: null,
    },
    {
      id: 'n8n',
      label: 'n8n',
      enabled: enabled.n8n,
      installed: isN8nInstalled(),
      // a key WITHOUT a url cannot authenticate — that is still documentation mode
      mode: n8n.hasKey && n8n.url ? 'full' : 'documentation',
    },
  ]
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/core/workspace-handlers.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Register the handlers**

In `src/core/handlers.ts`, after the `ipc.register('note.diff', …)` line:

```ts
  // ── Workspace MCP servers (2026-07-20 spec) ───────────────────────────────
  ipc.register('workspace.mcp.list', () =>
    workspaceServerRows(loadWorkspaceEnabled(), n8nStatus()),
  )
  ipc.register('workspace.mcp.setEnabled', ({ id, on }) => setWorkspaceEnabled(id, on))
  ipc.register('workspace.mcp.tools', async ({ id }) => {
    if (id === 'loredex') {
      // ours, already running in-process — no spawn needed
      const names = loredexToolNames()
      return { ok: true, tools: names, detail: `${names.length} tools` }
    }
    const entry = n8nEntryPath()
    if (!entry) return { ok: false, tools: [], detail: 'not installed' }
    return await probeStdioTools(
      process.execPath,
      [entry],
      { ...n8nEnv(), ELECTRON_RUN_AS_NODE: '1', PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
    )
  })
  ipc.register('workspace.mcp.install', async () => {
    const res = await installN8nMcp()
    return { ...res, command: n8nInstallCommand() }
  })
  ipc.register('workspace.n8n.get', () => n8nStatus())
  ipc.register('workspace.n8n.set', async ({ url, key }) => {
    if (url !== undefined) setN8nUrl(url)
    if (key !== undefined) {
      if (key === null || key === '') await clearN8nKey()
      else await setN8nKey(key)
    }
  })
  ipc.register('workspace.skills.status', async () => ({
    installed: hasPluginInstalled(N8N_SKILLS_PLUGIN),
    command: N8N_SKILLS_COMMAND,
    plugin: N8N_SKILLS_PLUGIN,
    terminal: {
      installed: await hasTerminalN8nMcp(),
      // n8nStatus().url is NOT secret; the key is a placeholder in the command
      command: terminalN8nCommand(n8nStatus().url),
    },
  }))
```

Add the imports:

```ts
import {
  N8N_SKILLS_COMMAND,
  N8N_SKILLS_PLUGIN,
  hasPluginInstalled,
  hasTerminalN8nMcp,
  terminalN8nCommand,
} from './claude-plugins'
import { probeStdioTools } from './mcp-tools'
import { clearN8nKey, n8nEnv, n8nStatus, setN8nKey, setN8nUrl } from './n8n-config'
import { installN8nMcp, n8nEntryPath, n8nInstallCommand } from './n8n-install'
import { workspaceServerRows } from './workspace-rows'
import { loadWorkspaceEnabled, setWorkspaceEnabled } from './settings'
```

`loredexToolNames()` — add to `src/core/mcp-server.ts`, next to `stripWriteTools`.
It uses the SAME `_registeredTools` seam that `stripWriteTools` and the identity
echo already rely on, so the list is whatever the live server actually
registered — including the effect of the "Expose write tools" switch. Guarded for
unexpected SDK shapes exactly like its neighbours:

```ts
/** Our own host's tool names, read from the LIVE server instance via the same
 *  `_registeredTools` seam stripWriteTools uses — never a hardcoded array, which
 *  would drift as tools are added and would not reflect the write-tools switch. */
export function loredexToolNames(mcp: object | null = currentServer()): string[] {
  const tools = (mcp as { _registeredTools?: Record<string, unknown> } | null)?._registeredTools
  return tools ? Object.keys(tools).sort() : []
}
```

`currentServer()` must return the module's live server instance. If `mcp-server.ts`
keeps it in a module-level variable under another name, use that name — do not
add a second instance.

- [ ] **Step 7: Load the config at boot**

In `src/core/index.ts`, beside the existing `void loadAgentKeys()`:

```ts
void loadN8nConfig()
```

with `import { loadN8nConfig } from './n8n-config'`.

- [ ] **Step 8: Typecheck, test, commit**

```bash
npm run typecheck
npx vitest run src/core/
git add src/shared/ipc-contract.ts src/core/handlers.ts src/core/workspace-rows.ts src/core/workspace-handlers.test.ts src/core/index.ts src/core/mcp-server.ts
git commit -m "feat(ipc): workspace MCP channels — list, enable, tools, install, n8n key, skills"
```

---

### Task 8: Settings › MCP servers UI

**Files:**
- Create: `src/renderer/src/views/settings/WorkspaceServersSection.tsx`
- Create: `src/renderer/src/stores/workspaceMcp.ts`
- Modify: `src/renderer/src/views/settings/McpServerSection.tsx` (render the new section below the host card)
- Modify: `src/renderer/src/styles.css`
- Test: `src/renderer/src/stores/workspaceMcp.test.ts`

**Interfaces:**
- Consumes: the Task 7 channels.
- Produces: `useWorkspaceMcp` with `{rows, tools, skills, busy, load(), setEnabled(id,on), loadTools(id), install(), saveN8n(url,key), verifySkills()}`.

- [ ] **Step 1: Write the failing store test**

```ts
// src/renderer/src/stores/workspaceMcp.test.ts
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

describe('useWorkspaceMcp', () => {
  beforeEach(() => {
    invoke.mockReset()
    useWorkspaceMcp.setState({ rows: [], tools: {}, skills: null, busy: false })
  })

  it('loads rows and probes tools only for installed servers', async () => {
    invoke.mockImplementation((ch: string) => {
      if (ch === 'workspace.mcp.list') return Promise.resolve(ROWS)
      if (ch === 'workspace.skills.status')
        return Promise.resolve({ installed: false, command: '/plugin install x', plugin: 'p' })
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/stores/workspaceMcp.test.ts`
Expected: FAIL — cannot resolve `./workspaceMcp`.

- [ ] **Step 3: Write the store**

```ts
// src/renderer/src/stores/workspaceMcp.ts
/**
 * Settings › MCP servers. Tools are shown EXPANDED BY DEFAULT (the explicit
 * ask), so load() probes every installed server up front. A not-installed
 * server is never probed — there is nothing to spawn.
 */
import { create } from 'zustand'
import { invoke } from '../api'
import type { CoreApi } from '../../../shared/ipc-contract'

type Row = CoreApi['workspace.mcp.list']['out'][number]
type Tools = CoreApi['workspace.mcp.tools']['out']
type Skills = CoreApi['workspace.skills.status']['out']

interface State {
  rows: Row[]
  tools: Record<string, Tools | undefined>
  skills: Skills | null
  busy: boolean
  load(): Promise<void>
  setEnabled(id: Row['id'], on: boolean): Promise<void>
  loadTools(id: Row['id']): Promise<void>
  install(): Promise<CoreApi['workspace.mcp.install']['out']>
  saveN8n(url: string | null, key: string | null): Promise<void>
  verifySkills(): Promise<void>
}

export const useWorkspaceMcp = create<State>((set, get) => ({
  rows: [],
  tools: {},
  skills: null,
  busy: false,

  async load() {
    set({ busy: true })
    try {
      const [rows, skills] = await Promise.all([
        invoke('workspace.mcp.list', undefined),
        invoke('workspace.skills.status', undefined),
      ])
      set({ rows, skills, busy: false })
      await Promise.all(rows.filter((r) => r.installed).map((r) => get().loadTools(r.id)))
    } catch {
      set({ busy: false }) // a settings page must never hard-fail on a probe
    }
  },

  async setEnabled(id, on) {
    await invoke('workspace.mcp.setEnabled', { id, on })
    await get().load()
  },

  async loadTools(id) {
    try {
      const tools = await invoke('workspace.mcp.tools', { id })
      set((s) => ({ tools: { ...s.tools, [id]: tools } }))
    } catch (e) {
      set((s) => ({
        tools: {
          ...s.tools,
          [id]: { ok: false, tools: [], detail: e instanceof Error ? e.message : String(e) },
        },
      }))
    }
  },

  async install() {
    set({ busy: true })
    const res = await invoke('workspace.mcp.install', { id: 'n8n' })
    set({ busy: false })
    await get().load()
    return res
  },

  async saveN8n(url, key) {
    await invoke('workspace.n8n.set', { url, key })
    await get().load()
  },

  async verifySkills() {
    const skills = await invoke('workspace.skills.status', undefined)
    set({ skills })
  },
}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/stores/workspaceMcp.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Build the section component**

```tsx
// src/renderer/src/views/settings/WorkspaceServersSection.tsx
/**
 * Workspace MCP servers — the ones that belong to the vault rather than to one
 * client. Tools are expanded by default and read live, so the list cannot drift
 * from what a session actually gets.
 *
 * Anything loredex cannot honestly do itself (the /plugin install TUI command,
 * or npm when it is not on the app's PATH) renders as a setup card: the exact
 * command, an Open-terminal button, and Verify. The card stays red until the
 * check actually passes.
 */
import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { useTerminal } from '../../stores/terminal'
import { useApp } from '../../stores/app'
import { useWorkspaceMcp } from '../../stores/workspaceMcp'

function SetupCard({
  title,
  note,
  command,
  done,
  onVerify,
}: {
  title: string
  note: string
  command: string
  done: boolean
  onVerify: () => void
}): React.JSX.Element {
  return (
    <div className={`ws-setup${done ? ' is-done' : ''}`}>
      <div className="ws-setup-head">
        <span className={`ws-dot tone-${done ? 'ok' : 'rust'}`} aria-hidden />
        <strong>{title}</strong>
        <span className="ws-setup-note">{done ? 'Installed' : note}</span>
      </div>
      {!done && (
        <>
          <pre className="ws-setup-cmd" dir="ltr">
            {command}
          </pre>
          <div className="ws-setup-actions">
            <Button
              onClick={() => {
                // open the terminal at the vault root and TYPE the command
                // without a newline — the user reviews and presses Enter. We
                // never auto-execute something we asked them to check.
                const vaultPath = useApp.getState().identity?.vaultPath
                void useTerminal
                  .getState()
                  .openAt(vaultPath ?? '')
                  .then(() => useTerminal.getState().typeIntoActive(command))
              }}
            >
              Open terminal
            </Button>
            <Button variant="quiet" onClick={() => void navigator.clipboard.writeText(command)}>
              Copy
            </Button>
            <Button variant="quiet" onClick={onVerify}>
              Verify
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export function WorkspaceServersSection(): React.JSX.Element {
  const rows = useWorkspaceMcp((s) => s.rows)
  const tools = useWorkspaceMcp((s) => s.tools)
  const skills = useWorkspaceMcp((s) => s.skills)
  const busy = useWorkspaceMcp((s) => s.busy)
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [installMsg, setInstallMsg] = useState<string | null>(null)
  const [installCmd, setInstallCmd] = useState<string | null>(null)

  useEffect(() => {
    void useWorkspaceMcp.getState().load()
  }, [])

  const n8n = rows.find((r) => r.id === 'n8n')

  return (
    <section className="settings-block">
      <h2 className="settings-title">Workspace servers</h2>
      <p className="settings-hint">
        These belong to the whole vault — not to one client. Every agent session gets them.
      </p>

      {rows.map((row) => {
        const t = tools[row.id]
        return (
          <div className="ws-row" key={row.id}>
            <div className="ws-row-head">
              <strong>{row.label}</strong>
              {row.mode && (
                <span className="ws-mode">
                  {row.mode === 'full' ? 'full access' : 'documentation tools only'}
                </span>
              )}
              <span style={{ flex: 1 }} />
              <button
                type="button"
                role="switch"
                aria-checked={row.enabled}
                aria-label={`Enable ${row.label}`}
                className={`switch${row.enabled ? ' is-on' : ''}`}
                onClick={() => void useWorkspaceMcp.getState().setEnabled(row.id, !row.enabled)}
              >
                <span className="switch-knob" />
              </button>
            </div>
            {row.installed ? (
              t ? (
                t.ok ? (
                  <ul className="ws-tools">
                    {t.tools.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="ws-tools-err">Could not read tools — {t.detail}</p>
                )
              ) : (
                <p className="ws-tools-err">Reading tools…</p>
              )
            ) : (
              <div className="ws-setup">
                <p className="ws-setup-note">
                  Not installed. Downloads about 154 MB once, into this app’s data folder.
                </p>
                <div className="ws-setup-actions">
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() =>
                      void useWorkspaceMcp
                        .getState()
                        .install()
                        .then((r) => {
                          setInstallMsg(r.detail)
                          setInstallCmd(r.ok ? null : r.command)
                        })
                    }
                  >
                    {busy ? 'Installing…' : 'Install'}
                  </Button>
                </div>
                {installMsg && <p className="ws-tools-err">{installMsg}</p>}
                {installCmd && (
                  <SetupCard
                    title="Install it from a terminal"
                    note="npm was not reachable from the app"
                    command={installCmd}
                    done={false}
                    onVerify={() => void useWorkspaceMcp.getState().load()}
                  />
                )}
              </div>
            )}
          </div>
        )
      })}

      <h3 className="settings-subtitle">n8n instance</h3>
      <p className="settings-hint">
        Optional. Without it you get n8n’s documentation and validation tools; with it, workflow
        creation, execution and analysis too. The key is stored in your OS keychain — never in the
        vault or a commit.
      </p>
      <label className="settings-field">
        <span>Instance URL</span>
        <input
          type="url"
          placeholder="https://n8n.example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label className="settings-field">
        <span>API key</span>
        <input
          type="password"
          placeholder={n8n?.mode === 'full' ? '•••••••• (stored)' : 'n8n API key'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <Button
        variant="primary"
        disabled={!url.trim() && !key.trim()}
        onClick={() =>
          void useWorkspaceMcp
            .getState()
            .saveN8n(url.trim() || null, key.trim() || null)
            .then(() => setKey(''))
        }
      >
        Save n8n settings
      </Button>

      <h3 className="settings-subtitle">n8n skills (Claude only)</h3>
      <p className="settings-hint">
        14 skills that teach Claude n8n’s expression syntax, node configuration and workflow
        patterns. Codex and Gemini ignore skills — the n8n <em>tools</em> above still work in all
        three.
      </p>
      {skills && (
        <SetupCard
          title="n8n skills plugin"
          note="Run this inside a claude session"
          command={skills.command}
          done={skills.installed}
          onVerify={() => void useWorkspaceMcp.getState().verifySkills()}
        />
      )}

      <h3 className="settings-subtitle">n8n in the terminal</h3>
      <p className="settings-hint">
        The agent panel already has n8n — this is only for <code>claude</code> run in a terminal,
        which reads its own config. <strong>Heads up:</strong> this command stores your API key in
        <code>~/.claude.json</code> in plain text. The agent panel keeps it in your OS keychain
        instead. Replace the placeholder with your real key before running it — loredex does not
        put your stored key into this command.
      </p>
      {skills && (
        <SetupCard
          title="n8n MCP for terminal claude"
          note="Optional — the agent panel does not need this"
          command={skills.terminal.command}
          done={skills.terminal.installed}
          onVerify={() => void useWorkspaceMcp.getState().verifySkills()}
        />
      )}
    </section>
  )
}
```

- [ ] **Step 6: Add `typeIntoActive` to the terminal store**

In `src/renderer/src/stores/terminal.ts`, add to the interface and implementation:

```ts
  /** Type text into the focused pty WITHOUT a trailing newline — the setup cards
   *  put a command in front of the user; they press Enter, not us. */
  typeIntoActive(text: string): Promise<void>
```

```ts
  async typeIntoActive(text) {
    const id = get().activeId
    if (!id) return
    await invoke('term.input', { id, data: text })
  },
```

The field is `activeId: string | null` (declared at `terminal.ts:42`, set at
lines 158/189/213). No new state is needed.

- [ ] **Step 7: Render it**

At the end of `McpServerSection.tsx`'s returned JSX, before the closing tag:

```tsx
      <WorkspaceServersSection />
```

with `import { WorkspaceServersSection } from './WorkspaceServersSection'`.

- [ ] **Step 8: Add the CSS**

Append to `src/renderer/src/styles.css`:

```css
/* Workspace MCP servers (2026-07-20): rows + setup cards */
.ws-row {
  border: 1px solid var(--hairline);
  border-radius: 10px;
  padding: 10px 12px;
  margin: 8px 0;
  background: var(--bg-card);
}

.ws-row-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ws-mode {
  font: 10px var(--font-mono);
  color: var(--text-3);
}

.ws-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.ws-tools li {
  font: 10px var(--font-mono);
  color: var(--text-2);
  border: 1px solid var(--hairline);
  border-radius: 999px;
  padding: 1px 7px;
}

.ws-tools-err {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-3);
}

.ws-setup {
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--bg-inset);
}

.ws-setup-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.ws-setup-note {
  font-size: 11px;
  color: var(--text-3);
}

.ws-setup-cmd {
  margin: 8px 0;
  padding: 8px;
  overflow-x: auto;
  font: 11px var(--font-mono);
  color: var(--text-1);
  background: var(--bg-card);
  border: 1px solid var(--hairline);
  border-radius: 6px;
}

.ws-setup-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ws-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  background: var(--text-4);
}

.ws-dot.tone-ok { background: var(--ok); }
.ws-dot.tone-rust { background: var(--rust); }
```

**No gradients** — the design-fidelity suite reserves them for the cobalt button
and will fail the build otherwise.

- [ ] **Step 9: Run the renderer suites**

Run: `npx vitest run src/renderer/src/`
Expected: PASS, including `design-fidelity.test.ts`.

- [ ] **Step 10: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/src/views/settings/WorkspaceServersSection.tsx src/renderer/src/stores/workspaceMcp.ts src/renderer/src/stores/workspaceMcp.test.ts src/renderer/src/views/settings/McpServerSection.tsx src/renderer/src/stores/terminal.ts src/renderer/src/styles.css
git commit -m "feat(settings): workspace MCP servers with live tools and setup cards"
```

---

### Task 9: End-to-end verification and release

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: only the known git-parallelism flake. Re-run any failure with
`npx vitest run --no-file-parallelism <files>` and confirm it passes in isolation
before treating it as real.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual smoke — the thing the user actually asked for**

Run `npm run dev`, then:

1. Settings → MCP server → Workspace servers. loredex lists its `vault_*` tools **expanded, without clicking**.
2. Enable n8n → Install. Expect ~154 MB and a few minutes. If npm is unreachable, a setup card with the `npm install --prefix` command must appear — that is a **pass**, not a failure.
3. After install, the n8n row lists **7 tools** and reads "documentation tools only".
4. Enter an instance URL + API key → Save. The row flips to "full access" and re-probing lists **24 tools**.
5. Open the agent panel, start a **Claude** session, ask: *"list your n8n tools"*. Confirm `search_nodes` and friends are present.
6. Repeat step 5 on **Codex**. The n8n tools must be there too — this is the all-providers claim.
7. The skills card is red with `/plugin install czlonkowski/n8n-skills`. Press **Open terminal**: the terminal opens at the vault root with the command typed and **not executed**.
8. Run it inside a `claude` session, then press **Verify**. The card turns green.
9. The "n8n in the terminal" card shows a command containing
   `<paste-your-n8n-api-key>` — **confirm your real key is NOT in it**. This is the
   seam invariant; if the real key appears, stop and fix before shipping.

- [ ] **Step 4: Update BACKLOG and CHANGELOG**

Add a `## BL-27 — Workspace MCP servers and n8n` entry to `docs/plan/BACKLOG.md`
following the existing symptom/cause/shipped shape, and a `### Added` block to
`CHANGELOG.md` under a new version heading covering: workspace servers, n8n tools
in all three providers, the optional key, the live tools list, and the
Claude-only skills caveat stated plainly.

- [ ] **Step 5: Release**

```bash
npm version 0.10.0 --no-git-tag-version
git add -A
git commit -m "feat: workspace MCP servers — n8n tools, live inventory, skills setup"
gh auth switch --user ahmedtawfeeq1
git push origin main
git tag v0.10.0 && git push origin v0.10.0
gh auth switch --user genudo-ai
```

Minor bump, not patch: this adds a capability rather than fixing behaviour.

- [ ] **Step 6: Watch the build**

Confirm both the `ci` and `release` runs go green and the release carries 7
assets, as with every release this session.
