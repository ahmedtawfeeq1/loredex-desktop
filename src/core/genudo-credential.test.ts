import { describe, expect, it, vi } from 'vitest'

// GENUDO_BASE_URL resolves too (a client can paste a host the same way it
// pastes a token — the client page renders that same paste field for any
// envRef) so the credentialRefs tests below can prove the FIX end-to-end:
// GENUDO_TOKEN_ACME gets the live session, GENUDO_BASE_URL keeps its OWN
// pasted value — never the live token.
const KEYCHAIN: Record<string, string> = {
  GENUDO_TOKEN_ACME: 'pasted-tok',
  GENUDO_BASE_URL: 'https://pasted-host.example',
}
vi.mock('./client-tokens', () => ({
  readClientTokens: vi.fn(async (refs: string[]) =>
    Object.fromEntries(refs.filter((r) => r in KEYCHAIN).map((r) => [r, KEYCHAIN[r]])),
  ),
}))
const accessToken = vi.fn(async (_client: string) => null as string | null)
vi.mock('./genudo-auth', () => ({ genudoAccessToken: (c: string) => accessToken(c) }))
// This file covers the behaviour when sign-in is ENABLED — session outranks a
// pasted token. The shipped flag is currently false (see genudo-flags.ts), so
// it is forced on here rather than deleting the coverage: flipping the switch
// back must restore exactly this, and genudo-credential.signin-off.test.ts
// pins what ships today.
vi.mock('../shared/genudo-flags', () => ({ GENUDO_SIGN_IN_ENABLED: true }))

import { clientTokenOverlay, resolveConnEnv } from './genudo-credential'

const conn = {
  server: 'genudo',
  envRefs: ['GENUDO_TOKEN_ACME'],
  command: '',
  args: [],
  env: {},
  headers: { Authorization: 'Bearer ${GENUDO_TOKEN_ACME}' },
}

describe('resolveConnEnv', () => {
  it('prefers a live session over the pasted token', async () => {
    accessToken.mockResolvedValueOnce('oauth-tok')
    expect(await resolveConnEnv('acme', conn)).toEqual({ Authorization: 'Bearer oauth-tok' })
  })

  it('falls back to the pasted token when there is no session', async () => {
    accessToken.mockResolvedValueOnce(null)
    expect(await resolveConnEnv('acme', conn)).toEqual({ Authorization: 'Bearer pasted-tok' })
  })

  it('throws an actionable error when neither exists', async () => {
    accessToken.mockResolvedValueOnce(null)
    await expect(
      resolveConnEnv('acme', { ...conn, envRefs: ['GENUDO_TOKEN_OTHER'],
        headers: { Authorization: 'Bearer ${GENUDO_TOKEN_OTHER}' } }),
    ).rejects.toThrow(/not signed in to genudo/i)
  })

  it('leaves a non-genudo connection to its pasted tokens only', async () => {
    const other = { ...conn, server: 'crm', env: { CRM: '${GENUDO_TOKEN_ACME}' }, headers: undefined }
    // scope the call-history check to THIS call — earlier tests in this file
    // already invoked accessToken('acme') for the genudo connection, and
    // nothing here resets that history (no clearMocks in vitest.config.ts)
    accessToken.mockClear()
    expect(await resolveConnEnv('acme', other)).toEqual({ CRM: 'pasted-tok' })
    expect(accessToken).not.toHaveBeenCalledWith('acme')
  })

  // review finding (2026-07-29): a session that EXISTS but can't be renewed
  // must not be swallowed into the generic "not signed in" text here — the
  // caller explicitly asked for something that needs a credential, so the
  // specific "could not be renewed, sign in again" message is the useful one.
  it('propagates the exact renewal-failure message rather than the generic "not signed in" one', async () => {
    accessToken.mockRejectedValueOnce(
      new Error('Genudo session for acme could not be renewed (invalid_grant) — sign in again on the client page'),
    )
    await expect(resolveConnEnv('acme', conn)).rejects.toThrow(/could not be renewed/i)
  })

  // Review finding (2026-07-29), adjacent bug: the live-token overlay used to
  // overwrite EVERY envRef unconditionally, including a GENUDO_BASE_URL ref
  // when a client declares one as ${VAR} (genudo-server.test.ts models this
  // shape) — so a live session's BEARER TOKEN got substituted into a URL
  // field, and genudo-server.ts then builds an endpoint out of it. A token in
  // a URL is a token in logs. Only the ref the credential actually lives in
  // (GENUDO_TOKEN here, the stdio shape) may ever be overwritten with it.
  it('expands GENUDO_TOKEN with the live session but GENUDO_BASE_URL with its OWN pasted value, never the live token for both', async () => {
    accessToken.mockResolvedValueOnce('oauth-tok')
    const stdioWithBaseUrlRef = {
      server: 'genudo',
      envRefs: ['GENUDO_TOKEN_ACME', 'GENUDO_BASE_URL'],
      command: 'npx',
      args: ['-y', 'genudo-mcp-client'],
      env: { GENUDO_TOKEN: '${GENUDO_TOKEN_ACME}', GENUDO_BASE_URL: '${GENUDO_BASE_URL}' },
    }
    const out = await resolveConnEnv('acme', stdioWithBaseUrlRef)
    expect(out.GENUDO_TOKEN).toBe('oauth-tok')
    expect(out.GENUDO_BASE_URL).toBe('https://pasted-host.example')
  })
})

describe('clientTokenOverlay', () => {
  it('writes a live session over the genudo refs and keeps the others held', async () => {
    accessToken.mockResolvedValueOnce('oauth-tok')
    const conns = [conn, { ...conn, server: 'crm', envRefs: ['GENUDO_TOKEN_ACME'] }]
    expect(await clientTokenOverlay('acme', conns)).toEqual({ GENUDO_TOKEN_ACME: 'oauth-tok' })
  })

  it('leaves the pasted token in place when there is no session', async () => {
    accessToken.mockResolvedValueOnce(null)
    expect(await clientTokenOverlay('acme', [conn])).toEqual({ GENUDO_TOKEN_ACME: 'pasted-tok' })
  })

  // review finding (2026-07-29): this is the OPPOSITE of resolveConnEnv above,
  // on purpose — a passive read (client-page status on mount, or
  // re-materializing because an unrelated token was pasted) must not blow up
  // just because Genudo's session died. genudoAccessToken already signs the
  // client out before throwing, so falling back to "no live token" here reads
  // exactly like a client that never signed in — the correct, informative UI.
  it('does not throw when the session cannot be renewed — falls back to the pasted token', async () => {
    accessToken.mockRejectedValueOnce(
      new Error('Genudo session for acme could not be renewed (invalid_grant) — sign in again on the client page'),
    )
    await expect(clientTokenOverlay('acme', [conn])).resolves.toEqual({ GENUDO_TOKEN_ACME: 'pasted-tok' })
  })

  it('does not throw when the session cannot be renewed and nothing was pasted either', async () => {
    accessToken.mockRejectedValueOnce(new Error('renewal failed'))
    const noFallback = { ...conn, envRefs: ['GENUDO_TOKEN_OTHER'] }
    await expect(clientTokenOverlay('acme', [noFallback])).resolves.toEqual({})
  })

  // Review finding (2026-07-29), adjacent bug — same class as resolveConnEnv
  // above: only the ref the Authorization header actually names may be
  // overwritten with the live token. A connection's own pasted GENUDO_BASE_URL
  // must survive into the materialized .mcp.json untouched.
  it('only overwrites the token ref with the live session — never a GENUDO_BASE_URL ref', async () => {
    accessToken.mockResolvedValueOnce('oauth-tok')
    const withBaseUrlRef = { ...conn, envRefs: ['GENUDO_TOKEN_ACME', 'GENUDO_BASE_URL'] }
    const held = await clientTokenOverlay('acme', [withBaseUrlRef])
    expect(held.GENUDO_TOKEN_ACME).toBe('oauth-tok')
    expect(held.GENUDO_BASE_URL).toBe('https://pasted-host.example')
  })
})
