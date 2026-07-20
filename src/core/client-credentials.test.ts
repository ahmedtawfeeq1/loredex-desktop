/**
 * WP-D: client login credential store. Hermetic — HOME is redirected to a temp
 * dir and the platform forced to 'linux' BEFORE import, so the encrypted-file
 * fallback runs (no real keychain, no pollution of ~/.config/loredex). Proves
 * round-trip, that the metadata index never holds the secret, metadata-only
 * edits keep the secret, and delete prunes both.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type CredsMod = typeof import('./client-credentials')
type TokensMod = typeof import('./client-tokens')

let creds: CredsMod
let tokens: TokensMod
let loginsFile: string
const origHome = process.env.HOME
const origPlatform = process.platform
const CLIENT = 'acme-dental'

beforeAll(async () => {
  const home = mkdtempSync(join(tmpdir(), 'loredex-creds-home-'))
  process.env.HOME = home
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
  creds = await import('./client-credentials')
  tokens = await import('./client-tokens')
  loginsFile = join(tokens.CRED_DIR, 'client-logins')
})

afterAll(() => {
  process.env.HOME = origHome
  Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true })
})

describe('client-credentials store (file fallback)', () => {
  it('round-trips a login; the metadata index never holds the secret', async () => {
    const { id } = await creds.setCredential(CLIENT, {
      label: 'Platform console',
      username: 'ops@acme.test',
      secret: 'hunter2-super-secret',
      url: 'https://console.acme.test',
      note: 'shared inbox login',
    })
    // list = metadata only, no secret field
    const list = creds.listCredentials(CLIENT)
    expect(list).toEqual([
      {
        id,
        label: 'Platform console',
        username: 'ops@acme.test',
        url: 'https://console.acme.test',
        note: 'shared inbox login',
      },
    ])
    // reveal returns the secret
    expect(await creds.revealCredential(CLIENT, id)).toEqual({ secret: 'hunter2-super-secret' })
    // the meta index entry itself does NOT contain the secret string
    const map = tokens.readEncMap(loginsFile)
    expect(map[`meta:${CLIENT}`]).not.toContain('hunter2')
    // the secret is stored under the per-cred account key
    expect(map[`secret:${CLIENT}/${id}`]).toBe('hunter2-super-secret')
  })

  it('a metadata-only edit keeps the existing secret (§5.13)', async () => {
    const { id } = await creds.setCredential(CLIENT, {
      label: 'API key',
      username: 'svc-acme',
      secret: 'orig-secret',
    })
    await creds.setCredential(CLIENT, { id, label: 'API key (prod)', username: 'svc-acme' })
    expect(creds.listCredentials(CLIENT).find((c) => c.id === id)?.label).toBe('API key (prod)')
    expect(await creds.revealCredential(CLIENT, id)).toEqual({ secret: 'orig-secret' }) // unchanged
  })

  it('rejects a brand-new credential with no secret', async () => {
    await expect(
      creds.setCredential(CLIENT, { label: 'x', username: 'y' }),
    ).rejects.toThrow(/needs a secret/)
  })

  it('delete prunes both metadata and secret', async () => {
    const { id } = await creds.setCredential(CLIENT, {
      label: 'Temp',
      username: 'temp',
      secret: 'gone-soon',
    })
    await creds.deleteCredential(CLIENT, id)
    expect(creds.listCredentials(CLIENT).some((c) => c.id === id)).toBe(false)
    await expect(creds.revealCredential(CLIENT, id)).rejects.toThrow()
    expect(tokens.readEncMap(loginsFile)[`secret:${CLIENT}/${id}`]).toBeUndefined()
  })

  /**
   * BL-22 — the Windows report: add a credential, open another client, come
   * back, it's gone. The mechanism is read-modify-write over a map whose read
   * answered `{}` for an UNDECRYPTABLE file, so the next save overwrote real
   * stored secrets with a single entry.
   */
  it('an undecryptable store throws instead of reading as empty', () => {
    const scratch = join(tokens.CRED_DIR, 'corrupt-map')
    writeFileSync(scratch, Buffer.from('not a valid aes-gcm payload at all'))
    expect(() => tokens.readEncMap(scratch)).toThrow(/could not be decrypted/)
  })

  it('never overwrites a store it could not read', async () => {
    // stand up a real store, then corrupt it the way a machine rename would
    const { id } = await creds.setCredential(CLIENT, {
      label: 'Survivor',
      username: 'keep-me',
      secret: 'must-not-vanish',
    })
    const intact = readFileSync(loginsFile)
    writeFileSync(loginsFile, Buffer.from('garbage that will not decrypt'))

    // a save now must fail loudly rather than rewrite the file from an empty map
    await expect(
      creds.setCredential(CLIENT, { label: 'New', username: 'n', secret: 's' }),
    ).rejects.toThrow(/could not be decrypted/)

    // restore and prove the original secret was never touched
    writeFileSync(loginsFile, intact)
    expect(await creds.revealCredential(CLIENT, id)).toEqual({ secret: 'must-not-vanish' })
  })
})

/**
 * BL-22: with an app.db open, the metadata index lives there — off the fragile
 * encrypted map entirely. Credentials saved by an older build must still show up.
 */
describe('metadata index in app.db', () => {
  const DB_CLIENT = 'beta-clinic'

  beforeAll(async () => {
    const { initAppDb } = await import('./db/index')
    initAppDb(mkdtempSync(join(tmpdir(), 'loredex-creds-db-')))
  })

  afterAll(async () => {
    const { initAppDb } = await import('./db/index')
    initAppDb(undefined) // back to no-db for anything after
  })

  it('survives a save → list-another-client → come-back round trip', async () => {
    const { id } = await creds.setCredential(DB_CLIENT, {
      label: 'Portal',
      username: 'ops@beta',
      secret: 'p4ss',
    })
    creds.listCredentials('some-other-client') // the "open another client" step
    const back = creds.listCredentials(DB_CLIENT)
    expect(back.map((c) => c.id)).toContain(id)
    expect(back.find((c) => c.id === id)?.username).toBe('ops@beta')
    expect(JSON.stringify(back)).not.toContain('p4ss') // metadata, never the secret
  })

  it('adopts metadata written by a pre-BL-22 build', async () => {
    const LEGACY = 'legacy-co'
    // exactly what the old code wrote: the meta list inside the encrypted map
    tokens.writeEncMap(loginsFile, {
      ...tokens.readEncMap(loginsFile),
      [`meta:${LEGACY}`]: JSON.stringify([{ id: 'old1', label: 'Old', username: 'u' }]),
    })
    expect(creds.listCredentials(LEGACY).map((c) => c.id)).toEqual(['old1'])

    // and it is now in the db, so a later read no longer needs the file
    const { getAppDb, metaGet } = await import('./db/index')
    const db = getAppDb()
    expect(db && metaGet(db, `client-creds:${LEGACY}`)).toContain('old1')
  })
})
