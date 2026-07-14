/**
 * E2E agent-ops suite (dex types epic) — drives the full clients loop over the
 * real dispatcher: agent-ops dex open → dexInfo → tree (Manager ▸ Client +
 * data files) → fleet/lints → readRaw (csv + containment) → workspace
 * generate/check (gitignored) → search with manager facet.
 *
 * Deterministic and self-contained: the fleet is scaffolded with the lib's own
 * scaffold functions into a sandboxed git dex. No LLM, no network, no Electron.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  scaffoldAgent,
  scaffoldClient,
  scaffoldPipeline,
  scaffoldStage,
  scaffoldVault,
} from 'loredex'
import { beforeAll, describe, expect, it } from 'vitest'
import * as engine from '../../src/core/engine'
import { registerCoreHandlers } from '../../src/core/handlers'
import { createCoreIpc, type CoreIpc } from '../../src/core/ipc'
import { initAppDb } from '../../src/core/db/index'
import { initSettings } from '../../src/core/settings'
import { createIpcClient, type IpcClient } from '../../src/shared/ipc-client'
import type { PortLike } from '../../src/shared/ipc-contract'
import type { TreeNode } from '../../src/shared/types'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

const WS = `mcp:
  crm-bridge:
    command: npx
    args: [-y, some-mcp-client]
    env: { CRM_TOKEN: "\${CRM_TOKEN_E2E}" }
plugins:
  claude: [some-plugin@some-marketplace]
skills: [followups]
`

describe('E2E agent-ops suite (sandboxed dex, module level)', () => {
  let sandbox: string
  let dex: string
  let client: IpcClient
  let ipc: CoreIpc

  beforeAll(async () => {
    sandbox = mkdtempSync(join(tmpdir(), 'loredex-e2e-agentops-'))
    dex = join(sandbox, 'dex')
    mkdirSync(dex)

    // agent-ops dex with a two-manager fleet, scaffolded by the lib itself
    scaffoldVault(dex, 'agent-ops')
    git(sandbox, 'init', '--quiet', '-b', 'main', dex)
    git(dex, 'config', 'user.name', 'Sara Test')
    git(dex, 'config', 'user.email', 'sara@agency.test')

    scaffoldClient(dex, 'brightsmile_dental', { manager: 'sara', tags: ['dental', 'new-platform'] })
    scaffoldPipeline(dex, 'brightsmile-dental', 'booking')
    scaffoldStage(dex, 'brightsmile-dental', 'booking', 'intake')
    scaffoldStage(dex, 'brightsmile-dental', 'booking', 'confirm')
    scaffoldAgent(dex, 'brightsmile-dental', 'reception_agent')
    scaffoldClient(dex, 'peak_fitness', { manager: 'omar', tags: ['fitness'] })

    const bsd = join(dex, 'projects', 'brightsmile-dental')
    writeFileSync(join(bsd, 'workspace.yml'), WS)
    writeFileSync(
      join(bsd, 'knowledge_tables', 'patients.csv'),
      'patient_name,phone,last_visit\nlina,123,2026-01-02\nomar,456,2026-02-10\n',
    )
    writeFileSync(join(bsd, 'automation_workflows', 'booking-flow.json'), '{"name":"booking"}\n')
    writeFileSync(join(bsd, '_inbox', 'new-prices.md'), 'update prices\n')
    git(dex, 'add', '-A')
    git(dex, 'commit', '--quiet', '-m', 'seed: agent-ops fleet')

    const configDir = join(sandbox, 'config')
    mkdirSync(configDir)
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ vaultPath: dex, sync: 'git', projects: {} }),
    )
    process.env.LOREDEX_CONFIG_DIR = configDir

    const userData = join(sandbox, 'userData')
    mkdirSync(userData)
    engine.initEngine(dex)
    if (!initAppDb(userData)) throw new Error('app.db failed to open')
    initSettings(userData)

    ipc = createCoreIpc()
    registerCoreHandlers(ipc)
    client = createIpcClient({ timeoutMs: 30000 })
    const handlers: [Array<(d: unknown) => void>, Array<(d: unknown) => void>] = [[], []]
    const make = (mine: 0 | 1): PortLike => ({
      postMessage: (data) => {
        queueMicrotask(() => {
          for (const cb of handlers[mine === 0 ? 1 : 0]) cb(data)
        })
      },
      onMessage: (cb) => handlers[mine].push(cb),
    })
    ipc.attach(make(0))
    client.attach(make(1))
  })

  it('reports the dex type', async () => {
    expect(await client.invoke('vault.dexInfo', undefined)).toEqual({ type: 'agent-ops' })
  })

  it('tree groups Manager ▸ Client and lists data files with types', async () => {
    const tree = await client.invoke('vault.tree', undefined)
    const projects = tree.find((n: TreeNode) => n.name === 'projects')
    const managers = (projects?.children ?? []).map((n: TreeNode) => n.name)
    expect(managers).toEqual(['omar', 'sara'])
    const sara = projects?.children?.find((n: TreeNode) => n.name === 'sara')
    const bsd = sara?.children?.find((n: TreeNode) => n.name === 'brightsmile-dental')
    expect(bsd).toBeDefined()
    const tables = bsd?.children?.find((n: TreeNode) => n.name === 'knowledge_tables')
    const csv = tables?.children?.[0]
    expect(csv?.name).toBe('patients.csv')
    expect(csv?.fileType).toBe('csv')
  })

  it('fleet + lints expose the read model (inbox attention, no errors)', async () => {
    const fleet = await client.invoke('clients.fleet', undefined)
    expect(fleet.map((c) => c.slug)).toEqual(['brightsmile-dental', 'peak-fitness'])
    const bsd = fleet[0]
    expect(bsd?.manager).toBe('sara')
    expect(bsd?.tags).toEqual(['dental', 'new-platform'])
    expect(bsd?.pipelines[0]?.stages.map((s) => s.nn)).toEqual(['01', '02'])
    expect(bsd?.agents[0]?.name).toBe('reception-agent')
    expect(bsd?.inboxCount).toBe(1)
    const lints = await client.invoke('clients.lints', undefined)
    expect(lints.some((f) => f.level === 'attention' && f.scope === '_inbox')).toBe(true)
    expect(lints.every((f) => f.level !== 'error')).toBe(true)
  })

  it('readRaw serves csv inside the dex and refuses paths outside it', async () => {
    const { raw, fileType } = await client.invoke('vault.readRaw', {
      path: 'projects/brightsmile-dental/knowledge_tables/patients.csv',
    })
    expect(fileType).toBe('csv')
    expect(raw).toContain('patient_name')
    await expect(
      client.invoke('vault.readRaw', { path: '../outside.yaml' }),
    ).rejects.toMatchObject({ code: 'VAULT_OUTSIDE_PATH' })
    await expect(
      client.invoke('vault.readRaw', { path: 'projects/brightsmile-dental/_persona.md' }),
    ).rejects.toMatchObject({ code: 'VAULT_OUTSIDE_PATH' }) // md is not a data file
  })

  it('workspace generate writes gitignored files; check goes green', async () => {
    process.env.CRM_TOKEN_E2E = 'e2e-secret'
    try {
      const result = await client.invoke('clients.workspace', {
        client: 'brightsmile-dental',
        check: false,
      })
      expect(result.wrote.sort()).toEqual(['.claude/settings.json', '.mcp.json', 'AGENTS.md'])
      expect(result.missingEnv).toEqual([])
      expect(existsSync(join(dex, 'projects/brightsmile-dental/.mcp.json'))).toBe(true)
      // generated files never reach git (scaffolded client .gitignore)
      const status = git(dex, 'status', '--porcelain')
      expect(status).not.toMatch(/\.mcp\.json|\.claude|AGENTS\.md/)
      const check = await client.invoke('clients.workspace', {
        client: 'brightsmile-dental',
        check: true,
      })
      expect(check.ok).toBe(true)
    } finally {
      delete process.env.CRM_TOKEN_E2E
    }
  })

  it('search finds csv headers and narrows by manager', async () => {
    const hits = await client.invoke('vault.search', { q: 'patient_name' })
    expect(hits.some((h) => h.path.endsWith('patients.csv'))).toBe(true)
    const saras = await client.invoke('vault.search', {
      q: 'patient_name',
      facets: { manager: 'sara' },
    })
    expect(saras.length).toBeGreaterThan(0)
    const omars = await client.invoke('vault.search', {
      q: 'patient_name',
      facets: { manager: 'omar' },
    })
    expect(omars).toEqual([])
  })
})
