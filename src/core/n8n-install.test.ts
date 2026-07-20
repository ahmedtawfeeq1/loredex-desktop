/**
 * The installer is the one part that touches the network, so the unit tests
 * cover only the pure surface: where things land, how presence is detected, and
 * the exact fallback command a user is shown when the install cannot run.
 * `--omit=optional` is asserted because it is load-bearing: n8n-mcp's optional
 * better-sqlite3 is native and its ABI will not match Electron's.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { setUserDataDir } from './paths'
import {
  N8N_MCP_VERSION,
  isN8nInstalled,
  n8nEntryPath,
  n8nInstallCommand,
} from './n8n-install'

let ud: string

beforeEach(() => {
  ud = mkdtempSync(join(tmpdir(), 'loredex-n8n-'))
  setUserDataDir(ud)
})

describe('n8n-mcp install', () => {
  it('pins an exact version', () => {
    expect(N8N_MCP_VERSION).toBe('2.65.1')
  })

  it('reports not installed on a clean user-data dir', () => {
    expect(isN8nInstalled()).toBe(false)
    expect(n8nEntryPath()).toBeNull()
  })

  it('finds the stdio wrapper once the package is present', () => {
    const dir = join(ud, 'mcp', 'n8n-mcp', 'node_modules', 'n8n-mcp', 'dist', 'mcp')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'stdio-wrapper.js'), '')
    expect(isN8nInstalled()).toBe(true)
    expect(n8nEntryPath()).toBe(join(dir, 'stdio-wrapper.js'))
  })

  it('the shown fallback command pins the version and omits optional deps', () => {
    const cmd = n8nInstallCommand()
    expect(cmd).toContain(`n8n-mcp@${N8N_MCP_VERSION}`)
    // load-bearing: the optional dep is native and would break under Electron
    expect(cmd).toContain('--omit=optional')
    expect(cmd).toContain(join(ud, 'mcp', 'n8n-mcp'))
  })
})
