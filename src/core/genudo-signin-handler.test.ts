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
 * only `./genudo-auth` mocked) rather than re-testing the already-correct
 * `genudoBaseUrl` helper in isolation — the bug was in what the call site
 * passed it, not in the helper itself. Pattern: snapshot-handlers.test.ts
 * (full IPC harness) + genudo-credential.test.ts (mock `./genudo-auth`).
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
})
