/**
 * WP-D: client login credential store. Hermetic — HOME is redirected to a temp
 * dir and the platform forced to 'linux' BEFORE import, so the encrypted-file
 * fallback runs (no real keychain, no pollution of ~/.config/loredex). Proves
 * round-trip, that the metadata index never holds the secret, metadata-only
 * edits keep the secret, and delete prunes both.
 */
import { mkdtempSync } from 'node:fs'
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
})
