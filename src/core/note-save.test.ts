/**
 * Story 16.4 channel drive: note.save / note.comment.create / note.comments
 * over the seam against a git-init'd sandbox of the fixture vault — traversal
 * rejection, byte-identical frontmatter, the edit/comment commit grammar with
 * per-command identity, the anchored-comment contract, and the refusals.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
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
const dana = { name: 'Dana Reyes', email: 'dana@nimbus.dev' }
const NOTE = 'projects/nimbus-api/2026-07-02 - nimbus-api - rate limiting research.md'

let vault: string
let client: IpcClient
let ipc: CoreIpc
const events: Array<Record<string, unknown>> = []

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
  // realpath: resolveNoteInsideVault realpaths both sides (symlinked tmpdir)
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'loredex-note-save-')))
  vault = join(sandbox, 'vault')
  cpSync(FIXTURE_VAULT, vault, { recursive: true })
  git('init', '-b', 'main')
  git('add', '-A')
  git('-c', 'user.name=Seed', '-c', 'user.email=seed@nimbus.dev', 'commit', '-m', 'seed')
  const configDir = mkdtempSync(join(tmpdir(), 'loredex-note-save-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'git', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
  initSettings(mkdtempSync(join(tmpdir(), 'loredex-note-save-userdata-')))

  ipc = createCoreIpc()
  registerCoreHandlers(ipc)
  client = createIpcClient({ timeoutMs: 30000 })
  const [a, b] = fakePortPair()
  ipc.attach(a)
  client.attach(b)
  client.onEvent((e) => events.push(e as unknown as Record<string, unknown>))
})

describe('note.save — body-only, frontmatter byte-preserved (AC1)', () => {
  it('replaces the body, keeps the frontmatter block byte-for-byte, commits as the identity', async () => {
    const before = readFileSync(join(vault, NOTE), 'utf8')
    const fmEnd = before.indexOf('---', 3) + 4 // end of the closing --- line
    const newBody = '# Rate limiting research\n\nEdited from the reader.\n'

    const out = await client.invoke('note.save', { path: NOTE, body: newBody, identity: dana })
    expect(out.path).toBe(NOTE)

    const after = readFileSync(join(vault, NOTE), 'utf8')
    expect(after.slice(0, fmEnd)).toBe(before.slice(0, fmEnd)) // agents' surface untouched
    expect(after.slice(fmEnd)).toBe(newBody)

    // the D1 commit grammar, authored by the payload identity (F7)
    const head = git('log', '-1', '--pretty=%s|%an|%ae').trim()
    expect(head).toBe(
      'loredex: edit 2026-07-02 - nimbus-api - rate limiting research (Dana Reyes)|Dana Reyes|dana@nimbus.dev',
    )
    expect(events).toContainEqual({ kind: 'vault.changed', paths: [NOTE] })
  })

  it('a missing trailing newline is normalized — git-friendly files', async () => {
    await client.invoke('note.save', { path: NOTE, body: '# T\n\nno newline', identity: dana })
    expect(readFileSync(join(vault, NOTE), 'utf8').endsWith('no newline\n')).toBe(true)
  })

  it('rejects traversal and outside-vault paths with VAULT_OUTSIDE_PATH', async () => {
    for (const path of ['../evil.md', '/etc/hosts.md', 'projects/../../evil.md']) {
      await expect(
        client.invoke('note.save', { path, body: 'x', identity: dana }),
      ).rejects.toMatchObject({ code: 'VAULT_OUTSIDE_PATH' })
    }
  })

  it('refuses without a usable identity', async () => {
    await expect(
      client.invoke('note.save', { path: NOTE, body: 'x', identity: { name: '', email: 'bad' } }),
    ).rejects.toMatchObject({ code: 'INTERNAL', message: expect.stringContaining('identity') })
  })
})

describe('note.comment.create + note.comments — the anchored contract (AC3)', () => {
  it('files an anchored type:comment note beside the parent and the scan returns it', async () => {
    const anchor = 'Edited from the reader.'
    const result = await client.invoke('note.comment.create', {
      path: NOTE,
      anchor,
      body: 'Are we sure about this edit?',
      identity: dana,
    })
    expect(result.pushed).toBe(false) // commit only — sync pushes later (recorded deviation)
    expect(result.path.startsWith(join(vault, 'projects/nimbus-api/'))).toBe(true)

    const rel = result.path.slice(vault.length + 1)
    const doc = await client.invoke('vault.readNote', { path: rel })
    expect(doc.meta).toMatchObject({
      type: 'comment',
      replies_to: '2026-07-02 - nimbus-api - rate limiting research',
      anchor,
      author: 'Dana Reyes <dana@nimbus.dev>',
      project: 'nimbus-api',
      loredex_schema: 2,
    })
    expect(doc.body).toContain('> Edited from the reader.')
    expect(doc.body).toContain('— Dana Reyes <dana@nimbus.dev>')

    expect(git('log', '-1', '--pretty=%s').trim()).toBe(
      'loredex: comment on 2026-07-02 - nimbus-api - rate limiting research',
    )
    // announced like every created note (card null — comments are never cards)
    expect(events.some((e) => e.kind === 'handoff.created' && e.relPath === rel)).toBe(true)

    const comments = await client.invoke('note.comments', { path: NOTE })
    expect(comments).toHaveLength(1)
    expect(comments[0]).toMatchObject({
      path: rel,
      author: 'Dana Reyes <dana@nimbus.dev>',
      anchor,
      body: 'Are we sure about this edit?',
    })
    // …and only for its parent
    expect(
      await client.invoke('note.comments', {
        path: 'projects/nimbus-web/2026-07-03 - nimbus-web - dashboard layout decision.md',
      }),
    ).toEqual([])
  })

  it('refuses blank anchors/bodies and traversal parents', async () => {
    await expect(
      client.invoke('note.comment.create', { path: NOTE, anchor: '  ', body: 'x', identity: dana }),
    ).rejects.toMatchObject({ code: 'INTERNAL' })
    await expect(
      client.invoke('note.comment.create', { path: NOTE, anchor: 'x', body: ' ', identity: dana }),
    ).rejects.toMatchObject({ code: 'INTERNAL' })
    await expect(
      client.invoke('note.comment.create', {
        path: '../outside.md',
        anchor: 'x',
        body: 'y',
        identity: dana,
      }),
    ).rejects.toMatchObject({ code: 'VAULT_OUTSIDE_PATH' })
  })
})
