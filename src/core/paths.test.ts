/**
 * The core host is handed --user-data; the n8n install lands beside app.db so it
 * survives the app bundle being replaced.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { getUserDataDir, mcpInstallDir, setUserDataDir } from './paths'

describe('core paths', () => {
  beforeEach(() => setUserDataDir(undefined))

  it('reports null before it is set', () => {
    expect(getUserDataDir()).toBeNull()
  })

  it('puts an MCP install under <userData>/mcp/<id>', () => {
    setUserDataDir('/tmp/ud')
    expect(mcpInstallDir('n8n-mcp')).toBe('/tmp/ud/mcp/n8n-mcp')
  })

  it('throws for an install path when there is no userData (bare test host)', () => {
    expect(() => mcpInstallDir('n8n-mcp')).toThrow(/no user-data directory/)
  })
})
