import { Agent, createServer, get, type Server } from 'node:http'
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

import {
  awaitCallback,
  CALLBACK_PORT,
  genudoAccessToken,
  genudoSessionRef,
  genudoSignOut,
  genudoStatus,
} from './genudo-auth'

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

  // Review finding (2026-07-29, final branch review): the OLD behaviour
  // signed the client out on ANY refresh error — a transport/DNS failure is
  // NOT proof the grant is dead, and this path runs on every client-page
  // mount (clientTokenOverlay → clients.workspace.status). An offline laptop
  // with a token past the refresh margin would otherwise permanently delete
  // a perfectly good session.
  it('does NOT clear the session on a transport/network failure', async () => {
    seed({
      tokens: { access_token: 'stale', token_type: 'Bearer', refresh_token: 'r1' },
      expiresAt: Date.now() + 1_000,
      // nothing listens on 127.0.0.1:1 — fetch() rejects with a plain
      // connection error, never an OAuthError subclass
      tokenEndpoint: 'http://127.0.0.1:1/oauth/token',
      client: { client_id: 'cid', redirect_uri: 'http://127.0.0.1:47821/callback' },
    })
    await expect(genudoAccessToken('acme')).rejects.toThrow()
    expect(refreshCalls).toBe(0)
    // the session survives — a connection failure is not proof the grant is dead
    expect(await genudoStatus('acme')).toMatchObject({ signedIn: true })
  })

  // A 502/maintenance page is not valid OAuth-error JSON, so the SDK's
  // parseErrorResponse falls back to a generic ServerError — an OAuthError
  // subclass, but NOT one of the three the SDK itself treats as "the grant
  // is dead" (InvalidClientError/UnauthorizedClientError/InvalidGrantError).
  // Must not clear the session either.
  it('does NOT clear the session on a 502 that is not a valid OAuth error body', async () => {
    const base = await tokenServer(() => ({ status: 502, body: '<html>Bad Gateway</html>' }))
    seed({
      tokens: { access_token: 'stale', token_type: 'Bearer', refresh_token: 'r1' },
      expiresAt: Date.now() + 1_000,
      tokenEndpoint: `${base}/oauth/token`,
      client: { client_id: 'cid', redirect_uri: 'http://127.0.0.1:47821/callback' },
    })
    await expect(genudoAccessToken('acme')).rejects.toThrow()
    expect(await genudoStatus('acme')).toMatchObject({ signedIn: true })
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

  it('preserves the existing refresh token when the refresh response omits one', async () => {
    const base = await tokenServer(() => ({
      status: 200,
      // no refresh_token in the reply — the server is allowed to omit it
      body: { access_token: 'fresh2', token_type: 'Bearer', expires_in: 3600 },
    }))
    seed({
      tokens: { access_token: 'stale', token_type: 'Bearer', refresh_token: 'original-refresh' },
      expiresAt: Date.now() + 5_000,
      tokenEndpoint: `${base}/oauth/token`,
      client: { client_id: 'cid', redirect_uri: 'http://127.0.0.1:47821/callback' },
    })
    expect(await genudoAccessToken('acme')).toBe('fresh2')
    const saved = JSON.parse(store.get(genudoSessionRef('acme')) as string)
    expect(saved.tokens.access_token).toBe('fresh2')
    expect(saved.tokens.refresh_token).toBe('original-refresh')
  })
})

/** Polls for the port coming free rather than asserting immediately —
 * `server.close()` stops new connections synchronously but the underlying
 * handle release is a libuv callback, not guaranteed to land in the same
 * microtask as `code` settling. */
async function isPortFree(port: number, attempts = 15): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = createServer()
      probe.once('error', () => resolve(false))
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)))
    })
    if (free) return true
    await new Promise((r) => setTimeout(r, 20))
  }
  return false
}

/**
 * A single non-keep-alive request, like a browser navigating to the loopback
 * callback URL once. Deliberately NOT the global `fetch` — undici's default
 * dispatcher pools connections per-origin, and these tests repeatedly bind
 * and tear down a real server on the SAME fixed port; a pooled socket left
 * over from a prior test's (now-dead) server produces a flaky ECONNRESET
 * instead of exercising the new one. A fresh `agent: false` request opens
 * its own socket and closes it, matching how sign-in actually happens (one
 * real page navigation, not a reused connection).
 */
function getOnce(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    get(
      `http://127.0.0.1:${CALLBACK_PORT}${path}`,
      { agent: new Agent({ keepAlive: false }) },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
        )
        res.on('error', reject)
      },
    ).on('error', reject)
  })
}

describe('awaitCallback (loopback listener)', () => {
  // every test below closes its own listener, but `server.close()`'s actual
  // handle release can land a tick after the test body returns — wait for
  // the OS to confirm the port is free before the next test binds it again,
  // or a slow CI box can turn this into a flaky EADDRINUSE/ECONNRESET.
  afterEach(async () => {
    await isPortFree(CALLBACK_PORT)
  })

  it('resolves the code from a real callback request and frees the port after', async () => {
    const { code, close } = awaitCallback(5_000)
    try {
      const res = await getOnce('/callback?code=abc123')
      expect(res.status).toBe(200)
      await expect(code).resolves.toBe('abc123')
    } finally {
      close()
    }
    expect(await isPortFree(CALLBACK_PORT)).toBe(true)
  })

  it('rejects and frees the port when no callback ever arrives (timeout)', async () => {
    const { code, close } = awaitCallback(50)
    await expect(code).rejects.toThrow(/timed out/i)
    close() // idempotent — the promise settling already closed it
    expect(await isPortFree(CALLBACK_PORT)).toBe(true)
  })

  it('ignores a request to any path other than /callback', async () => {
    const { code, close } = awaitCallback(5_000)
    try {
      const stray = await getOnce('/favicon.ico')
      expect(stray.status).toBe(404)
      // the listener is still up and the code promise is still pending —
      // the real callback still resolves it
      const real = await getOnce('/callback?code=xyz')
      expect(real.status).toBe(200)
      await expect(code).resolves.toBe('xyz')
    } finally {
      close()
    }
  })

  it('HTML-escapes the error query param in the failure page', async () => {
    const { code, close } = awaitCallback(5_000)
    try {
      const res = await getOnce(`/callback?error=${encodeURIComponent('<script>alert(1)</script>')}`)
      expect(res.body).not.toContain('<script>')
      expect(res.body).toContain('&lt;script&gt;')
      await expect(code).rejects.toThrow(/sign-in was refused/i)
    } finally {
      close()
    }
  })
})
