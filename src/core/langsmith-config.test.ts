/**
 * The LangSmith API key is a secret (keychain); the endpoint and project name
 * are not (meta table). Only PRESENCE of the key may cross the IPC seam —
 * langsmithStatus never returns it, and langsmithHttp is the only thing that
 * ever sees it, on its way into a request header at spawn.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map<string, string>()
vi.mock('./client-tokens', () => ({
  storeClientToken: async (ref: string, tok: string) => void store.set(ref, tok),
  readClientToken: async (ref: string) => store.get(ref) ?? null,
  deleteClientToken: async (ref: string) => void store.delete(ref),
}))

const meta = new Map<string, string | null>()
vi.mock('./db/index', () => ({
  getAppDb: () => ({}) as never,
  metaGet: (_db: unknown, k: string) => meta.get(k) ?? null,
  metaSet: (_db: unknown, k: string, v: string | null) => void meta.set(k, v),
}))

const mod = await import('./langsmith-config')

describe('langsmith config', () => {
  beforeEach(async () => {
    store.clear()
    meta.clear()
    await mod.clearLangsmithKey()
    mod.setLangsmithEndpoint(null)
    mod.setLangsmithProject(null)
  })

  it('reports presence only — never the key itself', async () => {
    await mod.setLangsmithKey('lsv2_pt_supersecret')
    const status = mod.langsmithStatus()
    expect(status.hasKey).toBe(true)
    expect(JSON.stringify(status)).not.toContain('supersecret')
  })

  it('the key lands in the keychain, not the meta table', async () => {
    await mod.setLangsmithKey('lsv2_pt_supersecret')
    expect([...store.values()]).toContain('lsv2_pt_supersecret')
    expect(JSON.stringify([...meta.entries()])).not.toContain('supersecret')
  })

  it('defaults to GCP US, and a stored endpoint wins', () => {
    expect(mod.langsmithEndpoint()).toBe(mod.LANGSMITH_DEFAULT_ENDPOINT)
    mod.setLangsmithEndpoint('https://eu.api.smith.langchain.com')
    expect(mod.langsmithEndpoint()).toBe('https://eu.api.smith.langchain.com')
  })

  it('trims a trailing slash so the /mcp path is never doubled', () => {
    mod.setLangsmithEndpoint('https://eu.api.smith.langchain.com/')
    expect(mod.langsmithEndpoint()).toBe('https://eu.api.smith.langchain.com')
  })

  it('an unset endpoint/project stays null in status — the UI shows the default as a placeholder', () => {
    expect(mod.langsmithStatus()).toMatchObject({ url: null, project: null })
    expect(mod.langsmithProject()).toBe(mod.LANGSMITH_DEFAULT_PROJECT)
  })

  it('langsmithHttp is null without a key — the server is omitted, not half-built', () => {
    expect(mod.langsmithHttp()).toBeNull()
  })

  it('langsmithHttp targets <endpoint>/mcp with the X-Api-Key header', async () => {
    await mod.setLangsmithKey('lsv2_pt_k')
    mod.setLangsmithEndpoint('https://eu.api.smith.langchain.com')
    expect(mod.langsmithHttp()).toEqual({
      url: 'https://eu.api.smith.langchain.com/mcp',
      // NOT Authorization: Bearer, and NOT the standalone server's
      // LANGSMITH-API-KEY — the remote MCP wants X-Api-Key
      header: { name: 'X-Api-Key', value: 'lsv2_pt_k' },
    })
  })

  it('clearing the key removes it everywhere', async () => {
    await mod.setLangsmithKey('lsv2_pt_k')
    await mod.clearLangsmithKey()
    expect(mod.langsmithStatus().hasKey).toBe(false)
    expect(mod.langsmithHttp()).toBeNull()
  })

  it('test connection refuses before it makes a pointless request', async () => {
    await expect(mod.testLangsmithConnection()).resolves.toEqual({
      ok: false,
      detail: 'No API key set',
    })
  })

  it('a 401 says which credential is wrong instead of blaming the feature', async () => {
    await mod.setLangsmithKey('not-a-langsmith-key')
    const fetchMock = vi.fn(async () => new Response('', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await mod.testLangsmithConnection()
    vi.unstubAllGlobals()
    expect(res.ok).toBe(false)
    expect(res.detail).toMatch(/lsv2_/)
  })

  it('a 401 on a well-formed key points at region/revocation, not key shape', async () => {
    await mod.setLangsmithKey('lsv2_pt_realshape')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    const res = await mod.testLangsmithConnection()
    vi.unstubAllGlobals()
    expect(res.detail).toMatch(/revoked|region/i)
  })

  it('a success counts the tracing projects it can see', async () => {
    await mod.setLangsmithKey('lsv2_pt_k')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([{ id: 'p1' }]), { status: 200 })),
    )
    const res = await mod.testLangsmithConnection()
    vi.unstubAllGlobals()
    expect(res).toEqual({ ok: true, detail: 'Connected — API reachable (1 tracing project visible)' })
  })

  it('an unreachable host is a one-line reason, never a thrown page', async () => {
    await mod.setLangsmithKey('lsv2_pt_k')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND nope\n  at somewhere')
      }),
    )
    const res = await mod.testLangsmithConnection()
    vi.unstubAllGlobals()
    expect(res).toEqual({ ok: false, detail: 'getaddrinfo ENOTFOUND nope' })
  })
})
