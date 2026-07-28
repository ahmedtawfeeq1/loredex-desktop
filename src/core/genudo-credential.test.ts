import { describe, expect, it, vi } from 'vitest'

vi.mock('./client-tokens', () => ({
  readClientTokens: vi.fn(async (refs: string[]) =>
    Object.fromEntries(refs.filter((r) => r === 'GENUDO_TOKEN_ACME').map((r) => [r, 'pasted-tok'])),
  ),
}))
const accessToken = vi.fn(async (_client: string) => null as string | null)
vi.mock('./genudo-auth', () => ({ genudoAccessToken: (c: string) => accessToken(c) }))

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
})
