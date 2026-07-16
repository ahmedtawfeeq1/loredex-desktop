/** v3 §9 GitHub auth pure bits (story 26.7) — no network, fetch stubbed. */
import { describe, expect, it } from 'vitest'
import { deviceFlowPoll, maskToken, toDexRepo, validateToken } from './auth'

const jsonRes = (body: unknown, ok = true, status = 200, headers: Record<string, string> = {}) =>
  ({
    ok,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  }) as unknown as Response

describe('maskToken', () => {
  it('shows only edges, never short tokens', () => {
    expect(maskToken('ghp_abcdefgh12347f2a')).toBe('ghp_…7f2a')
    expect(maskToken('short')).toBe('…')
  })
})

describe('toDexRepo', () => {
  it('accepts only repos carrying the loredex-dex topic', () => {
    expect(
      toDexRepo({
        full_name: 'o/nimbus',
        name: 'nimbus',
        private: true,
        topics: ['loredex-dex'],
        clone_url: 'https://github.com/o/nimbus.git',
        ssh_url: 'git@github.com:o/nimbus.git',
        pushed_at: '2026-07-01T00:00:00Z',
        owner: { login: 'o' },
      }),
    ).toEqual({
      fullName: 'o/nimbus',
      owner: 'o',
      name: 'nimbus',
      isPrivate: true,
      cloneUrl: 'https://github.com/o/nimbus.git',
      sshUrl: 'git@github.com:o/nimbus.git',
      pushedAt: '2026-07-01T00:00:00Z',
    })
    expect(toDexRepo({ full_name: 'o/other', topics: ['docs'] })).toBeNull()
    expect(toDexRepo({ full_name: 'o/none' })).toBeNull()
  })
})

describe('validateToken', () => {
  it('returns login + scopes on 200, null on rejection', async () => {
    const ok = await validateToken('t', async () =>
      jsonRes({ login: 'tawfeeq' }, true, 200, { 'x-oauth-scopes': 'repo, read:org' }),
    )
    expect(ok).toEqual({ login: 'tawfeeq', scopes: ['repo', 'read:org'] })
    expect(await validateToken('t', async () => jsonRes({}, false, 401))).toBeNull()
  })
})

describe('deviceFlowPoll (§5 state machine)', () => {
  const poll = (body: unknown) => deviceFlowPoll('dc', async () => jsonRes(body))
  it('one honest state per outcome', async () => {
    expect(await poll({ access_token: 'tok' })).toEqual({ state: 'authorized', token: 'tok' })
    expect(await poll({ error: 'authorization_pending' })).toEqual({ state: 'pending' })
    expect(await poll({ error: 'slow_down' })).toEqual({ state: 'slow_down' })
    expect(await poll({ error: 'expired_token' })).toEqual({ state: 'expired' })
    expect(await poll({ error: 'access_denied' })).toEqual({ state: 'denied' })
  })
})
