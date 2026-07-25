/**
 * Seam-level guarantees: the key never crosses it, and disabling a server is
 * reflected in the list.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('./n8n-install', () => ({
  N8N_MCP_VERSION: '2.65.1',
  isN8nInstalled: () => false,
  n8nEntryPath: () => null,
  n8nInstallCommand: () => 'npm install n8n-mcp@2.65.1 --omit=optional --prefix "/ud/mcp/n8n-mcp"',
  installN8nMcp: async () => ({ ok: false, detail: 'npm not found' }),
}))

const { workspaceServerRows } = await import('./workspace-rows')

/** Enabled map naming only what a case cares about — a new server in the
 *  registry must not silently join every existing assertion. */
const on = (
  v: Partial<Record<'loredex' | 'n8n' | 'langsmith', boolean>>,
): Record<'loredex' | 'n8n' | 'langsmith', boolean> => ({
  loredex: false,
  n8n: false,
  langsmith: false,
  ...v,
})

describe('workspaceServerRows', () => {
  it('marks n8n not installed and documentation-mode without a key', () => {
    const rows = workspaceServerRows(on({ loredex: true, n8n: true }), { hasKey: false, url: null })
    const n8n = rows.find((r) => r.id === 'n8n')
    expect(n8n).toMatchObject({ installed: false, enabled: true, mode: 'documentation' })
  })

  it('reports full mode once a key and url are set', () => {
    const rows = workspaceServerRows(
      on({ loredex: true, n8n: true }),
      { hasKey: true, url: 'https://n8n.example.com' },
    )
    expect(rows.find((r) => r.id === 'n8n')?.mode).toBe('full')
  })

  it('never includes anything key-shaped in a row', () => {
    const rows = workspaceServerRows(on({ loredex: true, n8n: true }), { hasKey: true, url: 'https://x' })
    expect(JSON.stringify(rows)).not.toMatch(/N8N_API_KEY|secret/i)
  })

  it('reflects a disabled server', () => {
    const rows = workspaceServerRows(on({ loredex: true }), { hasKey: false, url: null })
    expect(rows.find((r) => r.id === 'n8n')?.enabled).toBe(false)
  })

  it('langsmith: not ready and mode-less until a key is stored (nothing to download)', () => {
    const rows = workspaceServerRows(
      on({ loredex: true, langsmith: true }),
      { hasKey: false, url: null },
      { hasKey: false },
    )
    expect(rows.find((r) => r.id === 'langsmith')).toMatchObject({
      installed: false,
      enabled: true,
      mode: null,
      setup: 'key',
    })
  })

  it('langsmith: a stored key is the whole readiness condition', () => {
    const rows = workspaceServerRows(
      on({ loredex: true, langsmith: true }),
      { hasKey: false, url: null },
      { hasKey: true },
    )
    expect(rows.find((r) => r.id === 'langsmith')).toMatchObject({
      installed: true,
      mode: 'full',
    })
  })

  it('langsmith rows carry no key material either', () => {
    const rows = workspaceServerRows(
      on({ langsmith: true }),
      { hasKey: false, url: null },
      { hasKey: true },
    )
    expect(JSON.stringify(rows)).not.toMatch(/lsv2_|LANGSMITH_API_KEY|secret/i)
  })
})
