/**
 * What ships today: sign-in is switched OFF (`genudo-flags.ts`), so the pasted
 * token is the only credential.
 *
 * The switch has to reach the RESOLVER, not just the button. A stored session
 * outranks a pasted token, so hiding the control alone would leave a client
 * that signed in earlier still authenticating with that session — the pasted
 * token visible on screen would not be the one doing the talking. These tests
 * pin that the session is ignored while the flag is off, and that nothing about
 * the stored session is destroyed (flipping the flag back restores it — see
 * genudo-credential.test.ts, which forces the flag on and pins that path).
 */
import { describe, expect, it, vi } from 'vitest'

const KEYCHAIN: Record<string, string> = {
  GENUDO_TOKEN_ACME: 'pasted-tok',
}
vi.mock('./client-tokens', () => ({
  readClientTokens: vi.fn(async (refs: string[]) =>
    Object.fromEntries(refs.filter((r) => r in KEYCHAIN).map((r) => [r, KEYCHAIN[r]])),
  ),
}))
// a session EXISTS and would be returned if anything asked for it
const accessToken = vi.fn(async (_client: string) => 'oauth-tok' as string | null)
vi.mock('./genudo-auth', () => ({ genudoAccessToken: (c: string) => accessToken(c) }))
vi.mock('../shared/genudo-flags', () => ({ GENUDO_SIGN_IN_ENABLED: false }))

import { clientTokenOverlay, resolveConnEnv } from './genudo-credential'

const conn = {
  server: 'genudo',
  envRefs: ['GENUDO_TOKEN_ACME'],
  headers: { Authorization: 'Bearer ${GENUDO_TOKEN_ACME}' },
}

describe('with sign-in switched off', () => {
  it('resolves the pasted token even though a session exists', async () => {
    expect(await resolveConnEnv('acme', conn)).toEqual({ Authorization: 'Bearer pasted-tok' })
  })

  it('never asks for the session at all', async () => {
    accessToken.mockClear()
    await clientTokenOverlay('acme', [conn])
    expect(accessToken).not.toHaveBeenCalled()
  })

  it('materializes the pasted token, not the session', async () => {
    expect(await clientTokenOverlay('acme', [conn])).toEqual({ GENUDO_TOKEN_ACME: 'pasted-tok' })
  })

  it('still reports a missing token as actionable rather than falling back to a session', async () => {
    await expect(
      resolveConnEnv('acme', {
        server: 'genudo',
        envRefs: ['GENUDO_TOKEN_OTHER'],
        headers: { Authorization: 'Bearer ${GENUDO_TOKEN_OTHER}' },
      }),
    ).rejects.toThrow(/not signed in to genudo|no token held/i)
  })
})
