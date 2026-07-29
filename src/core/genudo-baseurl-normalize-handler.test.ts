/**
 * Final branch review finding (2026-07-29), Must fix: `handlers.ts`'s
 * `genudoBaseUrl` helper — the one function `clients.pull` and
 * `clients.genudo.signIn` both go through so they can't disagree on which
 * host they mean — returned a still-stdio connection's resolved
 * `GENUDO_BASE_URL` VERBATIM, with no `/mcp` strip. `genudo-server.ts` (the
 * ACP session path) strips it; `genudoRpc` (genudo-http.ts) and `genudoSignIn`
 * (genudo-auth.ts) both append `/mcp` unconditionally. So a stdio client
 * whose GENUDO_BASE_URL is the FULL endpoint (a user pasting exactly what
 * they see elsewhere in the file — the documented copy-paste mistake every
 * other normaliser on this branch already guards against) got `/mcp/mcp` on
 * pull and sign-in, while the SAME client got the correct URL in an ACP
 * session. This is the only one of six normalisation sites that disagreed.
 *
 * Proves the fix end-to-end through both call sites (real engine, real
 * scaffolded git vault, `./genudo-auth` + `./client-tokens` mocked — pattern:
 * genudo-signin-handler.test.ts) rather than unit-testing the now-shared
 * `stripGenudoSuffix` helper in isolation, since the bug was specifically in
 * this call site not using it.
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
  // genudo-credential.ts imports this from the same module — stubbed so the
  // mock factory can't leave it undefined for any transitive importer.
  genudoAccessToken: vi.fn(async () => null),
}))

const heldTokens = new Map<string, string>()
const encMaps = new Map<string, Record<string, string>>()
vi.mock('./client-tokens', () => ({
  CRED_DIR: '/tmp/loredex-genudo-baseurl-normalize-test-creds',
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

// Only fetchBundles is mocked (captures the baseUrl handlers.ts resolved) —
// planFiles stays the REAL pure implementation via importOriginal, so the
// preview response shape is genuine.
let seenPullArgs: { token: string; baseUrl: string } | null = null
vi.mock('./genudo-pull', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./genudo-pull')>()
  return {
    ...actual,
    fetchBundles: vi.fn(async (token: string, baseUrl: string) => {
      seenPullArgs = { token, baseUrl }
      return { bundles: [] }
    }),
  }
})

import { createIpcClient, type IpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc, type CoreIpc } from './ipc'
import { initSettings } from './settings'

let vault: string
let client: IpcClient
let ipc: CoreIpc
const identity = { name: 'Test Runner', email: 'test@example.dev' }

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
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'loredex-genudo-baseurl-normalize-')))
  vault = join(sandbox, 'vault')
  scaffoldVault(vault, 'agent-ops')
  scaffoldClient(vault, 'selfhosted_dental')
  // Still-stdio (unmigrated) connection whose GENUDO_BASE_URL is the FULL
  // endpoint — a literal, not a ${VAR} ref — exactly the copy-paste shape
  // every other normaliser on this branch already strips.
  writeFileSync(
    join(vault, 'projects', 'selfhosted-dental', 'workspace.yml'),
    `mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_TOKEN: "\${GENUDO_TOKEN_SH}"
      GENUDO_BASE_URL: "https://self-hosted.example.com/mcp"
plugins:
  claude: [genudo@genudo-ai]
skills: []
`,
  )
  heldTokens.set('GENUDO_TOKEN_SH', 'tok-selfhosted')

  git('init', '-b', 'main')
  git('add', '-A')
  git('-c', 'user.name=Seed', '-c', 'user.email=seed@acme.dev', 'commit', '-m', 'seed')

  const configDir = mkdtempSync(join(tmpdir(), 'loredex-genudo-baseurl-normalize-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'git', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
  initSettings(mkdtempSync(join(tmpdir(), 'loredex-genudo-baseurl-normalize-userdata-')))

  ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 30000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
})

describe('genudoBaseUrl — the stdio full-endpoint case, on both pull and sign-in', () => {
  it('clients.pull strips the /mcp suffix off a full-endpoint stdio GENUDO_BASE_URL before calling fetchBundles', async () => {
    await client.invoke('clients.pull', { client: 'selfhosted-dental', identity, preview: true })
    expect(seenPullArgs).toEqual({ token: 'tok-selfhosted', baseUrl: 'https://self-hosted.example.com' })
  })

  it('clients.genudo.signIn strips the /mcp suffix off the same value before calling genudoSignIn', async () => {
    await client.invoke('clients.genudo.signIn', { client: 'selfhosted-dental' })
    expect(signIn).toHaveBeenCalledWith('selfhosted-dental', 'https://self-hosted.example.com')
  })
})
