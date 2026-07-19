/**
 * Add-Client channel drive (docs/plan/agent-ops-desktop-flow.md): clients.create
 * scaffolds + copies the golden tooling with the servers subset + env-ref
 * rewrite + materializes with the pasted tokens, in ONE attributed commit;
 * clients.workspace.status reports the per-machine needs-token diff; and
 * clients.tokens.set re-materializes with newly held tokens. The OS keychain
 * is mocked in-memory — the store contract is auth.ts's, already shipped.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldClient, scaffoldVault } from 'loredex'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createIpcClient, type IpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc, type CoreIpc } from './ipc'
import { initSettings } from './settings'

// in-memory keychain — the real store is exercised by shipping auth.ts. The
// shared primitives (WP-D) are stubbed too so client-credentials.ts (pulled in
// by handlers.ts) has a defined CRED_DIR + keychain helpers at module load.
const heldTokens = new Map<string, string>()
const encMaps = new Map<string, Record<string, string>>()
vi.mock('./client-tokens', () => ({
  CRED_DIR: '/tmp/loredex-test-creds',
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

const GOLDEN_WS = `mcp:
  new-platform:
    command: npx
    args: [-y, new-mcp]
    env: { NEW_TOKEN: "\${NEW_TOKEN_BRIGHTSMILE_DENTAL}" }
  old-platform:
    command: npx
    args: [-y, old-mcp]
    env: { OLD_TOKEN: "\${OLD_TOKEN_BRIGHTSMILE_DENTAL}" }
plugins:
  claude: [some-plugin@some-marketplace]
skills: []
`
const sara = { name: 'Sara Novak', email: 'sara@brightsmile.dev' }

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
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'loredex-clients-create-')))
  vault = join(sandbox, 'vault')
  scaffoldVault(vault, 'agent-ops')
  scaffoldClient(vault, 'brightsmile_dental', { manager: 'sara' })
  writeFileSync(join(vault, 'projects', 'brightsmile-dental', 'workspace.yml'), GOLDEN_WS)
  git('init', '-b', 'main')
  git('add', '-A')
  git('-c', 'user.name=Seed', '-c', 'user.email=seed@brightsmile.dev', 'commit', '-m', 'seed')

  const configDir = mkdtempSync(join(tmpdir(), 'loredex-clients-create-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'git', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
  initSettings(mkdtempSync(join(tmpdir(), 'loredex-clients-create-userdata-')))

  ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 30000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
})

describe('clients.create — the Add-Client button end-to-end', () => {
  it('scaffolds, copies the checked connection with rewritten refs, expands the pasted token, commits once', async () => {
    const { slug, workspace } = await client.invoke('clients.create', {
      spec: {
        name: 'Peak Fitness',
        manager: 'sara',
        tags: ['new-platform'],
        fromClient: 'brightsmile-dental',
        servers: ['new-platform'],
      },
      tokens: { NEW_TOKEN_BRIGHTSMILE_DENTAL: 'tok-peak-123' },
      identity: sara,
    })
    expect(slug).toBe('peak-fitness')
    expect(workspace.missingEnv).toEqual([])

    const dir = join(vault, 'projects', slug)
    // workspace.yml: only the checked server, env ref rewritten, no secret
    const yml = readFileSync(join(dir, 'workspace.yml'), 'utf8')
    expect(yml).toContain('new-platform')
    expect(yml).not.toContain('old-platform')
    expect(yml).toContain('${NEW_TOKEN_PEAK_FITNESS}')
    expect(yml).not.toContain('tok-peak-123')
    // generated .mcp.json: token expanded — `claude` in this dir just works
    const mcp = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'))
    expect(mcp.mcpServers['new-platform'].env.NEW_TOKEN).toBe('tok-peak-123')
    expect(existsSync(join(dir, '.claude', 'settings.json'))).toBe(true)
    // keychain holds the REWRITTEN ref
    expect(heldTokens.get('NEW_TOKEN_PEAK_FITNESS')).toBe('tok-peak-123')
    // one attributed commit, token never in git
    const head = git('log', '-1', '--pretty=%an %s')
    expect(head).toContain('Sara Novak')
    expect(head).toContain('peak-fitness')
    expect(git('status', '--porcelain')).toBe('')
    expect(git('log', '--all', '-S', 'tok-peak-123', '--oneline').trim()).toBe('')
  })

  it('workspace.status reports the needs-token diff; tokens.set heals it', async () => {
    heldTokens.delete('NEW_TOKEN_PEAK_FITNESS')
    const missing = await client.invoke('clients.workspace.status', { client: 'peak-fitness' })
    expect(missing.hasTooling).toBe(true)
    expect(missing.declaredRefs).toEqual(['NEW_TOKEN_PEAK_FITNESS'])
    expect(missing.missingRefs).toEqual(['NEW_TOKEN_PEAK_FITNESS'])

    const result = await client.invoke('clients.tokens.set', {
      client: 'peak-fitness',
      tokens: { NEW_TOKEN_PEAK_FITNESS: 'tok-peak-456' },
    })
    expect(result.missingEnv).toEqual([])
    const healed = await client.invoke('clients.workspace.status', { client: 'peak-fitness' })
    expect(healed.missingRefs).toEqual([])
    const mcp = JSON.parse(
      readFileSync(join(vault, 'projects', 'peak-fitness', '.mcp.json'), 'utf8'),
    )
    expect(mcp.mcpServers['new-platform'].env.NEW_TOKEN).toBe('tok-peak-456')
  })

  it('clients.connections lists the golden servers for the modal', async () => {
    const conns = await client.invoke('clients.connections', { client: 'brightsmile-dental' })
    expect(conns.map((c) => c.server).sort()).toEqual(['new-platform', 'old-platform'])
    expect(conns.find((c) => c.server === 'new-platform')?.envRefs).toEqual([
      'NEW_TOKEN_BRIGHTSMILE_DENTAL',
    ])
  })
})
