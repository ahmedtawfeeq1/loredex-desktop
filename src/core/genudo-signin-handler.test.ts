/**
 * Review finding (2026-07-29), CRITICAL: `clients.genudo.signIn` called
 * `genudoBaseUrl(conn)` with NO `env`, so for a still-stdio connection — the
 * shape most of the real fleet is STILL on, since the fleet migration is
 * dry-by-default and has not touched it yet — `genudoBaseUrl`'s stdio branch
 * (`env.GENUDO_BASE_URL ?? GENUDO_BASE_URL`) always fell through to
 * production, silently ignoring that connection's own declared
 * GENUDO_BASE_URL. A self-hosted client would sign in — discovery, dynamic
 * client registration, the token exchange, all of it — against the wrong
 * tenant.
 *
 * This proves the REAL wiring end-to-end (real engine, real scaffolded vault,
 * `./genudo-auth` + `./client-tokens` mocked) rather than re-testing the
 * already-correct `genudoBaseUrl` helper in isolation — the bug was in what
 * the call site passed it, not in the helper itself. Pattern:
 * snapshot-handlers.test.ts (full IPC harness) + genudo-credential.test.ts
 * (mock `./genudo-auth`) + clients-create.test.ts (in-memory `./client-tokens`).
 *
 * Round 2 (2026-07-29): the first fix passed `conn.env` straight through, but
 * `clientConnections` returns env values UNEXPANDED — a client whose
 * GENUDO_BASE_URL is itself a `${VAR}` ref (genudo-server.test.ts models this
 * exact shape) would call genudoSignIn with the literal string
 * `'${GENUDO_BASE_URL_…}'`. The two tests below cover a ref that expands from
 * the keychain, and one that cannot — the latter must throw an actionable
 * error, never silently fall back to production (the class of bug this whole
 * round started with). `./client-tokens` MUST be mocked here: without it,
 * `stdioGenudoBaseUrl`'s `readClientTokens` call would hit the developer's
 * REAL OS keychain / `~/.config/loredex/client-credentials`.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldClient, scaffoldVault } from 'loredex'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const signIn = vi.fn(async (_client: string, _baseUrl?: string) => ({ account: null as string | null }))
vi.mock('./genudo-auth', () => ({
  genudoSignIn: (client: string, baseUrl?: string) => signIn(client, baseUrl),
  genudoSignOut: vi.fn(async () => {}),
  genudoStatus: vi.fn(async () => ({ signedIn: false, account: null, expiresAt: null })),
  // genudo-credential.ts also imports this from the same module — stubbed so
  // the mock factory can't leave it undefined if anything unexpected reaches
  // it (this test never exercises that path, but the mock replaces the WHOLE
  // module for every importer, not just this file's direct import).
  genudoAccessToken: vi.fn(async () => null),
}))

// In-memory keychain (pattern: clients-create.test.ts) — CRED_DIR/keychain*/
// readEncMap/writeEncMap are stubbed too since client-credentials.ts (pulled
// in transitively by handlers.ts) needs them defined at module load.
const heldTokens = new Map<string, string>()
const encMaps = new Map<string, Record<string, string>>()
vi.mock('./client-tokens', () => ({
  CRED_DIR: '/tmp/loredex-genudo-signin-test-creds',
  keychainSet: async () => {},
  keychainGet: async () => null,
  keychainDelete: async () => {},
  readEncMap: (file: string) => encMaps.get(file) ?? {},
  writeEncMap: (file: string, map: Record<string, string>) => void encMaps.set(file, map),
  storeClientToken: async (ref: string, token: string) => void heldTokens.set(ref, token),
  readClientToken: async (ref: string) => heldTokens.get(ref) ?? null,
  readClientTokens: async (refs: string[]) => {
    const out: Record<string, string> = {}
    for (const ref of refs) {
      const t = heldTokens.get(ref)
      if (t !== undefined) out[ref] = t
    }
    return out
  },
  deleteClientToken: async (ref: string) => void heldTokens.delete(ref),
}))

import { createIpcClient, type IpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc, type CoreIpc } from './ipc'
import { initSettings } from './settings'

let vault: string
let client: IpcClient
let ipc: CoreIpc

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: vault, encoding: 'utf8' })
}

function fakePortPair(): [PortLike, PortLike] {
  const handlers: [Array<(d: unknown) => void>, Array<(d: unknown) => void>] = [[], []]
  const make = (mine: 0 | 1): PortLike => ({
    postMessage: (data) => {
      queueMicrotask(() => {
        for (const cb of handlers[mine === 0 ? 1 : 0]) cb(data)
      })
    },
    onMessage: (cb) => handlers[mine].push(cb),
  })
  return [make(0), make(1)]
}

beforeAll(() => {
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'loredex-genudo-signin-')))
  vault = join(sandbox, 'vault')
  scaffoldVault(vault, 'agent-ops')
  scaffoldClient(vault, 'acme_dental')
  // Still-stdio (unmigrated) genudo connection, self-hosted GENUDO_BASE_URL —
  // exactly the shape genudo-server.test.ts models, and the shape most of a
  // real fleet is still on.
  writeFileSync(
    join(vault, 'projects', 'acme-dental', 'workspace.yml'),
    `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_ACME}"
      GENUDO_BASE_URL: "https://genudo.acme.internal"
plugins:
  claude: [genudo@genudo-ai]
skills: []
`,
  )

  // Round 2: GENUDO_BASE_URL declared as a `${VAR}` REF (not a literal) —
  // genudo-server.test.ts's exact fixture shape, and the shape a user sets
  // via the same per-envRef paste field a token uses. This client's ref
  // resolves — `heldTokens` is seeded for it below.
  scaffoldClient(vault, 'ref_dental')
  writeFileSync(
    join(vault, 'projects', 'ref-dental', 'workspace.yml'),
    `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_REF}"
      GENUDO_BASE_URL: "\${GENUDO_BASE_URL_REF_OK}"
plugins:
  claude: [genudo@genudo-ai]
skills: []
`,
  )
  heldTokens.set('GENUDO_BASE_URL_REF_OK', 'https://ref-expanded.example')

  // Same ref shape, but NOTHING is stored for its ref — must fail loudly,
  // never silently fall back to production.
  scaffoldClient(vault, 'ref_missing_dental')
  writeFileSync(
    join(vault, 'projects', 'ref-missing-dental', 'workspace.yml'),
    `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_REF_MISSING}"
      GENUDO_BASE_URL: "\${GENUDO_BASE_URL_REF_MISSING}"
plugins:
  claude: [genudo@genudo-ai]
skills: []
`,
  )

  git('init', '-b', 'main')
  git('add', '-A')
  git('-c', 'user.name=Seed', '-c', 'user.email=seed@acme.dev', 'commit', '-m', 'seed')

  const configDir = mkdtempSync(join(tmpdir(), 'loredex-genudo-signin-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'git', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
  initSettings(mkdtempSync(join(tmpdir(), 'loredex-genudo-signin-userdata-')))

  ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 30000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
})

describe('clients.genudo.signIn — which host it actually signs in against', () => {
  it("uses a still-stdio connection's OWN declared GENUDO_BASE_URL, not production", async () => {
    await client.invoke('clients.genudo.signIn', { client: 'acme-dental' })
    expect(signIn).toHaveBeenCalledWith('acme-dental', 'https://genudo.acme.internal')
  })

  // Round 2 (2026-07-29): GENUDO_BASE_URL as a `${VAR}` ref that DOES resolve
  // from the keychain — the previous fix would have called genudoSignIn with
  // the literal string '${GENUDO_BASE_URL_REF_OK}'.
  it('expands a ${VAR}-ref GENUDO_BASE_URL from the keychain before signing in', async () => {
    await client.invoke('clients.genudo.signIn', { client: 'ref-dental' })
    expect(signIn).toHaveBeenCalledWith('ref-dental', 'https://ref-expanded.example')
  })

  // Round 2: the ref CANNOT be expanded (nothing pasted for it yet) — must
  // fail loudly with an actionable message, never silently sign in against
  // production. That silent fallback is the exact class of bug this whole
  // review round started with.
  it('fails loudly — never falls back to production — when the ref cannot be expanded', async () => {
    await expect(
      client.invoke('clients.genudo.signIn', { client: 'ref-missing-dental' }),
    ).rejects.toThrow(/GENUDO_BASE_URL_REF_MISSING/)
    expect(signIn).not.toHaveBeenCalledWith('ref-missing-dental', expect.anything())
  })
})
