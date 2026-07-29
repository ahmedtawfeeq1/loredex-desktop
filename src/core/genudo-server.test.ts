import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./genudo-credential', () => ({
  GENUDO_SERVER: 'genudo',
  resolveConnEnv: vi.fn(async () => ({ Authorization: 'Bearer tok-1' })),
}))
vi.mock('./engine', () => ({
  clientConnections: vi.fn(() => [
    { server: 'genudo', envRefs: ['GENUDO_TOKEN_ACME'], command: '', args: [],
      env: {}, type: 'http', url: 'https://api.genudo.ai/mcp',
      headers: { Authorization: 'Bearer ${GENUDO_TOKEN_ACME}' } },
  ]),
}))

import { clientConnections } from './engine'
import { resolveConnEnv } from './genudo-credential'
import { genudoServerFor } from './genudo-server'

/** The default remote-shaped connection every test starts from; individual
 *  tests override with `mockReturnValue`/`mockResolvedValue` as needed. */
const HTTP_CONN = {
  server: 'genudo',
  envRefs: ['GENUDO_TOKEN_ACME'],
  type: 'http' as const,
  url: 'https://api.genudo.ai/mcp',
  headers: { Authorization: 'Bearer ${GENUDO_TOKEN_ACME}' },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(clientConnections).mockReturnValue([HTTP_CONN])
  vi.mocked(resolveConnEnv).mockResolvedValue({ Authorization: 'Bearer tok-1' })
})

describe('genudoServerFor', () => {
  it('returns the remote server when the adapter supports http', async () => {
    expect(await genudoServerFor('acme', true)).toEqual({
      type: 'http',
      name: 'genudo',
      url: 'https://api.genudo.ai/mcp',
      headers: [{ name: 'Authorization', value: 'Bearer tok-1' }],
    })
  })

  it('omits the server entirely when the adapter advertises no http', async () => {
    expect(await genudoServerFor('acme', false)).toBeNull()
  })

  it('never resolves the credential when the adapter advertises no http', async () => {
    // Ordering regression test: resolveConnEnv can sign the client out when a
    // session exists but cannot be renewed, so an adapter without http must
    // never reach it — checking `httpOk` first is load-bearing, not cosmetic.
    await genudoServerFor('acme', false)
    expect(resolveConnEnv).not.toHaveBeenCalled()
  })

  it('returns null with no client selected', async () => {
    expect(await genudoServerFor(null, true)).toBeNull()
  })

  it("prefers the connection's own GENUDO_BASE_URL over production when unmigrated (stdio) and self-hosted", async () => {
    // An unmigrated client still declares the old stdio shape in workspace.yml
    // (no `url` field at all) but may carry its own GENUDO_BASE_URL override in
    // env. That override must win over the hardcoded production default.
    vi.mocked(clientConnections).mockReturnValue([
      {
        server: 'genudo',
        envRefs: ['GENUDO_TOKEN_ACME', 'GENUDO_BASE_URL'],
        command: 'npx',
        args: ['-y', 'genudo-mcp-client'],
        env: { GENUDO_TOKEN: '${GENUDO_TOKEN_ACME}', GENUDO_BASE_URL: '${GENUDO_BASE_URL}' },
      },
    ])
    vi.mocked(resolveConnEnv).mockResolvedValue({
      GENUDO_TOKEN: 'tok-self-hosted',
      GENUDO_BASE_URL: 'https://genudo.acme.internal',
    })
    expect(await genudoServerFor('acme', true)).toEqual({
      type: 'http',
      name: 'genudo',
      url: 'https://genudo.acme.internal/mcp',
      headers: [{ name: 'Authorization', value: 'Bearer tok-self-hosted' }],
    })
  })

  it('does not double up /mcp when the self-hosted GENUDO_BASE_URL already carries the full endpoint', async () => {
    // The field mirrors what a user can see verbatim in workspace.yml — the
    // FULL endpoint, `/mcp` and all — so pasting it whole must not produce
    // `.../mcp/mcp`.
    vi.mocked(clientConnections).mockReturnValue([
      {
        server: 'genudo',
        envRefs: ['GENUDO_TOKEN_ACME', 'GENUDO_BASE_URL'],
        command: 'npx',
        args: ['-y', 'genudo-mcp-client'],
        env: { GENUDO_TOKEN: '${GENUDO_TOKEN_ACME}', GENUDO_BASE_URL: '${GENUDO_BASE_URL}' },
      },
    ])
    vi.mocked(resolveConnEnv).mockResolvedValue({
      GENUDO_TOKEN: 'tok-self-hosted',
      GENUDO_BASE_URL: 'https://genudo.acme.internal/mcp',
    })
    expect(await genudoServerFor('acme', true)).toEqual({
      type: 'http',
      name: 'genudo',
      url: 'https://genudo.acme.internal/mcp',
      headers: [{ name: 'Authorization', value: 'Bearer tok-self-hosted' }],
    })
  })

  it('falls back to the production default when unmigrated with no GENUDO_BASE_URL override', async () => {
    vi.mocked(clientConnections).mockReturnValue([
      {
        server: 'genudo',
        envRefs: ['GENUDO_TOKEN_ACME'],
        command: 'npx',
        args: ['-y', 'genudo-mcp-client'],
        env: { GENUDO_TOKEN: '${GENUDO_TOKEN_ACME}' },
      },
    ])
    vi.mocked(resolveConnEnv).mockResolvedValue({ GENUDO_TOKEN: 'tok-legacy' })
    expect(await genudoServerFor('acme', true)).toEqual({
      type: 'http',
      name: 'genudo',
      url: 'https://api.genudo.ai/mcp',
      headers: [{ name: 'Authorization', value: 'Bearer tok-legacy' }],
    })
  })
})
