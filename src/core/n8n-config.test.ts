/**
 * The n8n API key is a secret (keychain); the instance URL is not (meta table).
 * Only PRESENCE of the key may cross the IPC seam — n8nStatus never returns it.
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

const mod = await import('./n8n-config')

describe('n8n config', () => {
  beforeEach(async () => {
    store.clear()
    meta.clear()
    await mod.clearN8nKey()
    mod.setN8nUrl(null)
  })

  it('reports no key and no url when nothing is set', () => {
    expect(mod.n8nStatus()).toEqual({ hasKey: false, url: null })
  })

  it('never returns the key itself — only presence', async () => {
    await mod.setN8nKey('secret-abc')
    const status = mod.n8nStatus()
    expect(status.hasKey).toBe(true)
    expect(JSON.stringify(status)).not.toContain('secret-abc')
  })

  it('builds the documentation-only env when no key is set', () => {
    expect(mod.n8nEnv()).toEqual({
      MCP_MODE: 'stdio',
      LOG_LEVEL: 'error',
      DISABLE_CONSOLE_OUTPUT: 'true',
    })
  })

  it('adds the url and key to the env once both are set', async () => {
    mod.setN8nUrl('https://n8n.example.com')
    await mod.setN8nKey('secret-abc')
    expect(mod.n8nEnv()).toEqual({
      MCP_MODE: 'stdio',
      LOG_LEVEL: 'error',
      DISABLE_CONSOLE_OUTPUT: 'true',
      N8N_API_URL: 'https://n8n.example.com',
      N8N_API_KEY: 'secret-abc',
    })
  })

  it('omits the key when only a url is set — half-configured is documentation-only', () => {
    mod.setN8nUrl('https://n8n.example.com')
    expect(mod.n8nEnv().N8N_API_KEY).toBeUndefined()
    expect(mod.n8nEnv().N8N_API_URL).toBeUndefined()
  })

  it('never writes the key into process.env', async () => {
    // A developer's own shell may already export N8N_API_KEY. Clear it for the
    // duration so this asserts what the module does, not what the shell did,
    // then restore it so we do not disturb the rest of the worker.
    const ambient = process.env.N8N_API_KEY
    delete process.env.N8N_API_KEY
    try {
      await mod.setN8nKey('secret-abc')
      expect(process.env.N8N_API_KEY).toBeUndefined()
    } finally {
      if (ambient !== undefined) process.env.N8N_API_KEY = ambient
    }
  })

  it('reloads the key from the keychain', async () => {
    await mod.setN8nKey('secret-abc')
    await mod.clearN8nKey()
    expect(mod.n8nStatus().hasKey).toBe(false)
    store.set('workspace-mcp/n8n/N8N_API_KEY', 'secret-abc')
    await mod.loadN8nConfig()
    expect(mod.n8nStatus().hasKey).toBe(true)
  })
})
