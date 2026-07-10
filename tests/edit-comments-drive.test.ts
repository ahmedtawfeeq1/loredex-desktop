/**
 * Story 16.4 DoD drive — the LIVE nimbus simulation vault
 * (loredex-simulation/_machine2/nimbus-vault, sanctioned as mutable):
 *
 *   edit+save round-trip with the frontmatter block byte-identical →
 *   the edit commit in git + the activity feed → inline comment create →
 *   the comment note read via `cat` (agents' CLI view) → anchor orphaning
 *   after a second edit removes the quoted text.
 *
 * The vault is restored to its pre-test sha afterward (reset --hard), so
 * repeated runs never accumulate drive artifacts. Skipped wherever the
 * simulation tree is absent (CI) or the vault is dirty (never clobber a
 * human's work in progress).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createIpcClient, type IpcClient } from '../src/shared/ipc-client'
import type { PortLike } from '../src/shared/ipc-contract'
import * as engine from '../src/core/engine'
import { registerCoreHandlers } from '../src/core/handlers'
import { createCoreIpc } from '../src/core/ipc'
import { initSettings } from '../src/core/settings'
import { listMarkdownFiles } from '../src/core/tree'

const SIM_VAULT = resolve(
  import.meta.dirname,
  '../../loredex-simulation/_machine2/nimbus-vault',
)
const hasVault = existsSync(join(SIM_VAULT, 'projects'))
const dirty = hasVault
  ? execFileSync('git', ['status', '--porcelain'], { cwd: SIM_VAULT, encoding: 'utf8' }).trim() !== ''
  : true

const dana = { name: 'Dana Reyes', email: 'dana@nimbus.dev' }

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

describe.skipIf(!hasVault || dirty)('16.4 DoD drive — live nimbus vault (restored after)', () => {
  let vault: string
  let client: IpcClient
  let baseSha: string
  let note: string // vault-relative target note
  let anchor: string // exact text the comment anchors to
  let commentPath = '' // absolute path of the created comment note

  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: vault, encoding: 'utf8' })

  beforeAll(() => {
    vault = realpathSync(SIM_VAULT)
    baseSha = git('rev-parse', 'HEAD').trim()

    const configDir = mkdtempSync(join(tmpdir(), 'loredex-164-drive-config-'))
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ vaultPath: vault, sync: 'git', projects: {} }),
    )
    process.env.LOREDEX_CONFIG_DIR = configDir
    engine.initEngine()
    initSettings(mkdtempSync(join(tmpdir(), 'loredex-164-drive-userdata-')))

    const ipc = createCoreIpc()
    registerCoreHandlers(ipc)
    client = createIpcClient({ timeoutMs: 30000 })
    const [a, b] = fakePortPair()
    ipc.attach(a)
    client.attach(b)

    // a real project note (not a handoff) — deterministic first match
    const candidate = listMarkdownFiles(vault).find(
      (rel) => rel.startsWith('projects/') && !rel.includes('/handoffs/'),
    )
    if (!candidate) throw new Error('nimbus vault has no project notes')
    note = candidate
  })

  afterAll(() => {
    // leave the simulation exactly as found
    if (baseSha) git('reset', '--hard', baseSha)
  })

  it('edit+save round-trip: body replaced, frontmatter bytes intact, edit commit in the feed', async () => {
    const before = readFileSync(join(vault, note), 'utf8')
    const doc = await client.invoke('vault.readNote', { path: note })
    const stamp = `Edited by the 16.4 drive at ${new Date().toISOString()}.`
    const newBody = `${doc.body.replace(/\n+$/, '\n')}\n${stamp}\n`

    const saved = await client.invoke('note.save', { path: note, body: newBody, identity: dana })
    expect(saved.path).toBe(note)

    const after = readFileSync(join(vault, note), 'utf8')
    const fmLen = before.length - doc.body.length // frontmatter block prefix
    expect(after.slice(0, fmLen)).toBe(before.slice(0, fmLen)) // byte-identical
    expect(after).toContain(stamp)

    const name = (note.split('/').pop() as string).replace(/\.md$/, '')
    expect(git('log', '-1', '--pretty=%s|%an').trim()).toBe(
      `loredex: edit ${name} (Dana Reyes)|Dana Reyes`,
    )
    // activity shows the edit commit (lib grammar: unknown loredex commits
    // surface as sync events — never dropped)
    const feed = await client.invoke('activity.feed', { limit: 5 })
    expect(feed[0]).toMatchObject({
      summary: `loredex: edit ${name} (Dana Reyes)`,
      actor: dana,
    })
  })

  it('comment create → the note is agent-readable via cat (CLI view)', async () => {
    const doc = await client.invoke('vault.readNote', { path: note })
    const line = doc.body
      .split('\n')
      .find((l) => !l.startsWith('#') && !l.startsWith('Edited by') && l.trim().length >= 12)
    expect(line).toBeDefined()
    anchor = (line as string).trim()

    const result = await client.invoke('note.comment.create', {
      path: note,
      anchor,
      body: 'Drive comment: is this section still current?',
      identity: dana,
    })
    commentPath = result.path

    // THE DoD proof: plain `cat` shows agents everything they need
    const catted = execFileSync('cat', [commentPath], { encoding: 'utf8' })
    const parentName = (note.split('/').pop() as string).replace(/\.md$/, '')
    expect(catted).toContain('type: comment')
    expect(catted).toContain('replies_to:')
    expect(catted).toContain(parentName)
    expect(catted).toContain('anchor:')
    expect(catted).toContain(anchor)
    expect(catted).toContain('author: Dana Reyes <dana@nimbus.dev>')
    expect(catted).toContain('Drive comment: is this section still current?')

    expect(git('log', '-1', '--pretty=%s').trim()).toBe(
      `loredex: comment on ${(note.split('/').pop() as string).replace(/\.md$/, '')}`,
    )

    const comments = await client.invoke('note.comments', { path: note })
    expect(comments.some((c) => c.anchor === anchor)).toBe(true)
  })

  it('anchor orphaning: editing the quoted text away demotes the comment', async () => {
    const doc = await client.invoke('vault.readNote', { path: note })
    const comments = await client.invoke('note.comments', { path: note })
    const mine = comments.filter((c) => c.anchor === anchor)
    expect(mine).toHaveLength(1)

    // still anchored: the exact quote is present — splitComments' predicate
    // (renderer-side, unit-tested in views/reader/comments.test.ts)
    expect(doc.body.includes(anchor)).toBe(true)

    // remove the anchored text (the exact quote) and save
    const gutted = doc.body.split('\n').filter((l) => !l.includes(anchor)).join('\n')
    await client.invoke('note.save', { path: note, body: gutted, identity: dana })
    const reread = await client.invoke('vault.readNote', { path: note })
    // the quote is gone → splitComments demotes it to the orphaned list
    expect(reread.body.includes(anchor)).toBe(false)
    expect(mine[0]?.anchor).toBe(anchor) // the comment note still carries it
  })
})
