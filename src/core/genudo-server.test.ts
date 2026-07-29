import { describe, expect, it, vi } from 'vitest'

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

import { genudoServerFor } from './genudo-server'

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

  it('returns null with no client selected', async () => {
    expect(await genudoServerFor(null, true)).toBeNull()
  })
})
