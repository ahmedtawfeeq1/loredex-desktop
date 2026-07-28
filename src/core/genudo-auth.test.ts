import { createServer, type Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.mock('./client-tokens', () => ({
  storeClientToken: vi.fn(async (ref: string, value: string) => {
    store.set(ref, value)
  }),
  readClientToken: vi.fn(async (ref: string) => store.get(ref) ?? null),
  deleteClientToken: vi.fn(async (ref: string) => {
    store.delete(ref)
  }),
}))

// genudo-auth.ts imports `shell` from 'electron' for the interactive sign-in
// path. Outside a real Electron process that module has no such export, so
// vitest's node environment needs the same stub other src/main/*.test.ts
// files use (shell-open.test.ts, zoom.test.ts) — none of these tests drive
// sign-in, but the static import still has to resolve.
vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
}))

import { genudoAccessToken, genudoSessionRef, genudoSignOut, genudoStatus } from './genudo-auth'

let server: Server | null = null
let refreshCalls = 0

beforeEach(() => {
  store.clear()
  refreshCalls = 0
})
afterEach(() => {
  server?.close()
  server = null
})

/** Minimal OAuth token endpoint: refresh_token grant only. */
function tokenServer(reply: () => { status: number; body: unknown }): Promise<string> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      req.on('data', () => {})
      req.on('end', () => {
        refreshCalls += 1
        const out = reply()
        res.writeHead(out.status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(out.body))
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address()
      resolve(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`)
    })
  })
}

function seed(session: Record<string, unknown>): void {
  store.set(genudoSessionRef('acme'), JSON.stringify(session))
}

describe('genudo sign-in session', () => {
  it('reports signed-out for a client with no session', async () => {
    expect(await genudoStatus('acme')).toEqual({ signedIn: false, account: null, expiresAt: null })
    expect(await genudoAccessToken('acme')).toBeNull()
  })

  it('returns a live access token without touching the network', async () => {
    seed({
      tokens: { access_token: 'live', token_type: 'Bearer', refresh_token: 'r1' },
      expiresAt: Date.now() + 600_000,
      account: 'ops@acme.test',
    })
    expect(await genudoAccessToken('acme')).toBe('live')
    expect(refreshCalls).toBe(0)
    expect(await genudoStatus('acme')).toMatchObject({ signedIn: true, account: 'ops@acme.test' })
  })

  it('refreshes a token expiring inside 60s and persists the new one', async () => {
    const base = await tokenServer(() => ({
      status: 200,
      body: { access_token: 'fresh', token_type: 'Bearer', refresh_token: 'r2', expires_in: 3600 },
    }))
    seed({
      tokens: { access_token: 'stale', token_type: 'Bearer', refresh_token: 'r1' },
      expiresAt: Date.now() + 5_000,
      account: 'ops@acme.test',
      tokenEndpoint: `${base}/oauth/token`,
      client: { client_id: 'cid', redirect_uri: 'http://127.0.0.1:47821/callback' },
    })
    expect(await genudoAccessToken('acme')).toBe('fresh')
    expect(refreshCalls).toBe(1)
    const saved = JSON.parse(store.get(genudoSessionRef('acme')) as string)
    expect(saved.tokens.access_token).toBe('fresh')
    expect(saved.expiresAt).toBeGreaterThan(Date.now() + 3_000_000)
    // second read is served from the store, not the network
    expect(await genudoAccessToken('acme')).toBe('fresh')
    expect(refreshCalls).toBe(1)
  })

  it('clears the session when the refresh grant is rejected', async () => {
    const base = await tokenServer(() => ({ status: 400, body: { error: 'invalid_grant' } }))
    seed({
      tokens: { access_token: 'stale', token_type: 'Bearer', refresh_token: 'dead' },
      expiresAt: Date.now() + 1_000,
      tokenEndpoint: `${base}/oauth/token`,
      client: { client_id: 'cid', redirect_uri: 'http://127.0.0.1:47821/callback' },
    })
    await expect(genudoAccessToken('acme')).rejects.toThrow(/sign in again/i)
    expect(await genudoStatus('acme')).toMatchObject({ signedIn: false })
  })

  it('sign-out deletes the session', async () => {
    seed({ tokens: { access_token: 'live', token_type: 'Bearer' }, expiresAt: null })
    await genudoSignOut('acme')
    expect(await genudoStatus('acme')).toMatchObject({ signedIn: false })
  })

  it('scopes sessions per client', async () => {
    seed({ tokens: { access_token: 'acme-tok', token_type: 'Bearer' }, expiresAt: null })
    expect(await genudoAccessToken('acme')).toBe('acme-tok')
    expect(await genudoAccessToken('other-client')).toBeNull()
  })
})
