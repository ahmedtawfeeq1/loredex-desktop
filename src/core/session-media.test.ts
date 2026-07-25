/**
 * Session media lives on THIS device — never in the vault — and must not
 * outlive the conversation that owns it. The user's own framing: "if I delete
 * the session, all the messages and media under it must be deleted, so I avoid
 * a lot of things on my disc that nothing will ever remove."
 */
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let db: InstanceType<typeof Database> | null = null
vi.mock('./db/index', () => ({ getAppDb: () => db }))

const { setUserDataDir, scratchDir } = await import('./paths')
const mod = await import('./session-media')

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
).toString('base64')
const OTHER = Buffer.from('a different image entirely').toString('base64')
const NOW = '2026-07-23T10:00:00.000Z'
const VAULT = 'vault-a'

beforeEach(() => {
  setUserDataDir(mkdtempSync(join(tmpdir(), 'media-')))
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE session_media (sha256 TEXT NOT NULL, vault_id TEXT NOT NULL,
                                conv_id TEXT, name TEXT NOT NULL, mime TEXT NOT NULL,
                                bytes INTEGER NOT NULL, rel_path TEXT NOT NULL,
                                created_at TEXT NOT NULL,
                                PRIMARY KEY (sha256, vault_id, conv_id));
  `)
})

const store = (b64: string, conv: string | null, vault = VAULT) =>
  mod.storeSessionMedia(vault, { dataB64: b64, mimeType: 'image/png', name: 'image', convId: conv }, NOW)

const filesOn = (vault = VAULT): string[] => {
  const dir = join(scratchDir('session-media'), vault)
  return existsSync(dir) ? readdirSync(dir) : []
}

describe('storing', () => {
  it('writes the bytes under userData, never the vault', () => {
    const m = store(PNG, 'c1')
    expect(filesOn()).toEqual([`${m.sha256}.png`])
    // the path is inside userData — the whole point of the store
    expect(join(scratchDir('session-media'), VAULT)).toContain('media-')
  })

  it('is content-addressed: the same image three times is ONE file', () => {
    const a = store(PNG, 'c1')
    const b = store(PNG, 'c1')
    expect(a.sha256).toBe(b.sha256)
    expect(filesOn()).toHaveLength(1)
  })

  it('refuses a non-image rather than becoming a file dump', () => {
    expect(() =>
      mod.storeSessionMedia(VAULT, { dataB64: PNG, mimeType: 'application/zip', name: 'x' }, NOW),
    ).toThrow(/unsupported media type/)
  })

  it('reads back as base64 with its mime', () => {
    const m = store(PNG, 'c1')
    expect(mod.readSessionMedia(VAULT, m.sha256)).toMatchObject({ dataB64: PNG, mime: 'image/png' })
  })

  it('another vault cannot read this vault’s media', () => {
    const m = store(PNG, 'c1')
    expect(mod.readSessionMedia('vault-b', m.sha256)).toBeNull()
  })

  it('a handle whose file vanished returns null, not a throw', () => {
    const m = store(PNG, 'c1')
    db?.prepare('UPDATE session_media SET rel_path = ? WHERE sha256 = ?').run('gone/x.png', m.sha256)
    expect(mod.readSessionMedia(VAULT, m.sha256)).toBeNull()
  })
})

describe('deleting a conversation takes its media with it', () => {
  it('removes the file and the index row', () => {
    store(PNG, 'c1')
    expect(filesOn()).toHaveLength(1)
    expect(mod.deleteConversationMedia(VAULT, 'c1')).toBe(1)
    expect(filesOn()).toHaveLength(0)
    expect(mod.listConversationMedia(VAULT, 'c1')).toEqual([])
  })

  it('leaves other conversations’ media alone', () => {
    store(PNG, 'c1')
    store(OTHER, 'c2')
    mod.deleteConversationMedia(VAULT, 'c1')
    expect(filesOn()).toHaveLength(1)
    expect(mod.listConversationMedia(VAULT, 'c2')).toHaveLength(1)
  })

  /** Content-addressing means two conversations can share one file — deleting
   *  one must not blank the picture in the other. */
  it('keeps a file another conversation in this vault still references', () => {
    // the same screenshot pasted into two threads — one file, two index rows
    const a = store(PNG, 'c1')
    const b = store(PNG, 'c2')
    expect(a.sha256).toBe(b.sha256)
    expect(filesOn()).toHaveLength(1)
    expect(mod.deleteConversationMedia(VAULT, 'c1')).toBe(0)
    // c2 still shows its picture
    expect(filesOn()).toHaveLength(1)
    expect(mod.readSessionMedia(VAULT, a.sha256)).not.toBeNull()
    // …and once c2 goes too, nothing is left behind
    expect(mod.deleteConversationMedia(VAULT, 'c2')).toBe(1)
    expect(filesOn()).toHaveLength(0)
  })

  it('does not touch another VAULT’s copy of the same bytes', () => {
    store(PNG, 'c1')
    store(PNG, 'c1', 'vault-b')
    mod.deleteConversationMedia(VAULT, 'c1')
    expect(filesOn(VAULT)).toHaveLength(0)
    expect(filesOn('vault-b')).toHaveLength(1)
  })
})
