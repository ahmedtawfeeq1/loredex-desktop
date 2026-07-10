/**
 * Epic 4 (routing safety) integration over the seam: route receipts + one-click
 * undo (lib PR-3), content-hash dedupe history, and never-route filing-scope
 * globs. Runs on a git-backed copy of the fixture vault so undo can be proven
 * byte-identical AND the working tree clean — the F4 evidence bar.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient, type IpcClient } from '../shared/ipc-client'
import type { PortLike } from '../shared/ipc-contract'
import { initEngine } from './engine'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc, type CoreIpc } from './ipc'
import { initSettings } from './settings'

const FIXTURE_VAULT = resolve(import.meta.dirname, '../../tests/fixtures/vault')

let sandbox: string
let vault: string
let client: IpcClient
let ipc: CoreIpc

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: vault, encoding: 'utf8' })
}
function clean(): boolean {
  return git('status', '--porcelain').trim() === ''
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
  sandbox = mkdtempSync(join(tmpdir(), 'loredex-routesafety-'))
  vault = join(sandbox, 'vault')
  cpSync(FIXTURE_VAULT, vault, { recursive: true })
  git('init', '-q')
  git('config', 'user.email', 'dana@nimbus.dev')
  git('config', 'user.name', 'Dana Reyes')
  git('add', '-A')
  git('commit', '-qm', 'seed')
  expect(clean()).toBe(true)

  const configDir = mkdtempSync(join(tmpdir(), 'loredex-routesafety-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'git', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
  initSettings(mkdtempSync(join(tmpdir(), 'loredex-routesafety-userdata-')))

  ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 30000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
})

function writeSource(name: string, body: string): string {
  const src = join(sandbox, name)
  writeFileSync(src, body)
  return src
}

describe('route receipt + undo round-trip (story 4.1/4.2)', () => {
  it('route lands a copy and commits clean; undo restores byte-identical + tree clean', async () => {
    const src = writeSource(
      'finding.md',
      '---\nproject: nimbus-api\ntopic: api\ntype: finding\ndate: "2026-07-08"\n---\n# Quota\n\nBody.\n',
    )
    const before = readFileSync(src, 'utf8')

    const { written, receiptId } = await client.invoke('route.file', { path: src, mode: 'copy' })
    expect(receiptId).toBeDefined()
    expect(written).toHaveLength(1)
    expect(existsSync(written[0] as string)).toBe(true)
    expect(clean()).toBe(true) // route committed itself + its receipt

    // the receipt is persisted and reversible
    const history = await client.invoke('route.history', {})
    expect(history[0]?.id).toBe(receiptId)
    expect(history[0]?.undone).toBeFalsy()

    await client.invoke('route.undo', { receiptId: receiptId as string })
    expect(existsSync(written[0] as string)).toBe(false) // vault copy removed
    expect(readFileSync(src, 'utf8')).toBe(before) // source restored to pre-route bytes
    expect(clean()).toBe(true) // undo committed itself — no dangling changes

    const after = await client.invoke('route.history', {})
    expect(after.find((r) => r.id === receiptId)?.undone).toBe(true)
  })

  it('undo twice fails loudly (superseded receipt), never a silent no-op', async () => {
    const src = writeSource(
      'twice.md',
      '---\nproject: nimbus-api\ntopic: api\ntype: finding\ndate: "2026-07-08"\n---\n# Twice\n',
    )
    const { receiptId } = await client.invoke('route.file', { path: src, mode: 'copy' })
    await client.invoke('route.undo', { receiptId: receiptId as string })
    await expect(
      client.invoke('route.undo', { receiptId: receiptId as string }),
    ).rejects.toMatchObject({ code: 'ROUTE_ALREADY_UNDONE' })
  })
})

describe('content-hash dedupe (story 4.2)', () => {
  it("the receipt's contentHash equals the note source_hash a re-route would carry", async () => {
    const body = '---\nproject: nimbus-api\ntopic: api\ntype: finding\ndate: "2026-07-08"\n---\n# Dup\n\nSame.\n'
    const src = writeSource('dup.md', body)
    const { receiptId } = await client.invoke('route.file', { path: src, mode: 'copy' })

    // a fresh source with identical body previews the same source_hash → the app
    // dedupe (findDuplicateReceipt) would match this receipt and warn
    const src2 = writeSource('dup-copy.md', body)
    const preview = await client.invoke('route.preview', { file: src2, mode: 'copy' })
    const history = await client.invoke('route.history', {})
    const receipt = history.find((r) => r.id === receiptId)
    expect(receipt?.contentHash).toBe(preview.meta.source_hash)
  })
})

describe('never-route filing-scope globs (story 4.3)', () => {
  it('a matched source is blocked at preview AND at apply with a named-glob reason', async () => {
    await client.invoke('settings.neverRoute.set', { globs: ['FINDINGS.md', '**/scratch/**'] })
    expect((await client.invoke('settings.neverRoute.get', undefined)).globs).toContain('FINDINGS.md')

    const blocked = writeSource(
      'FINDINGS.md',
      '---\nproject: nimbus-api\ntopic: api\ntype: finding\ndate: "2026-07-08"\n---\n# Internal\n',
    )
    await expect(client.invoke('route.preview', { file: blocked, mode: 'copy' })).rejects.toMatchObject(
      { code: 'ROUTE_BLOCKED', message: expect.stringContaining('FINDINGS.md') },
    )
    await expect(
      client.invoke('route.file', { path: blocked, mode: 'copy' }),
    ).rejects.toMatchObject({ code: 'ROUTE_BLOCKED' })

    // a normal file still routes — the policy is targeted, not a blanket freeze
    const ok = writeSource(
      'ok-note.md',
      '---\nproject: nimbus-api\ntopic: api\ntype: finding\ndate: "2026-07-08"\n---\n# Fine\n',
    )
    const preview = await client.invoke('route.preview', { file: ok, mode: 'copy' })
    expect(preview.project).toBe('nimbus-api')
  })

  it('the never-route list persists to the shared lib config so the CLI honors it', () => {
    const cfg = JSON.parse(
      readFileSync(join(process.env.LOREDEX_CONFIG_DIR as string, 'config.json'), 'utf8'),
    )
    expect(cfg.neverRoute).toContain('FINDINGS.md')
  })
})
