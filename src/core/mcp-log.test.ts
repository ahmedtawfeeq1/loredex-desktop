/** v3 §6.5 session telemetry: the MCP request ring (story 26.5). */
import { afterEach, describe, expect, it } from 'vitest'
import { clearMcpRequestLog, mcpRequestLog, recordMcpRequest } from './mcp-server'

afterEach(() => clearMcpRequestLog())

describe('recordMcpRequest', () => {
  it('records initialize with the client name and tools/call by tool name', () => {
    recordMcpRequest(
      { method: 'initialize', params: { clientInfo: { name: 'claude-code' } } },
      '2026-07-16T10:00:00Z',
    )
    recordMcpRequest(
      { method: 'tools/call', params: { name: 'vault_search' } },
      '2026-07-16T10:00:05Z',
    )
    expect(mcpRequestLog()).toEqual([
      { at: '2026-07-16T10:00:00Z', kind: 'initialize', name: 'initialize', client: 'claude-code' },
      { at: '2026-07-16T10:00:05Z', kind: 'tool', name: 'vault_search' },
    ])
  })
  it('handles batches, ignores non-tool traffic, and caps the ring at 200', () => {
    recordMcpRequest([
      { method: 'tools/list' },
      { method: 'tools/call', params: { name: 'a' } },
      { method: 'notifications/initialized' },
    ])
    expect(mcpRequestLog().map((e) => e.name)).toEqual(['a'])
    for (let i = 0; i < 250; i++)
      recordMcpRequest({ method: 'tools/call', params: { name: `t${i}` } })
    const log = mcpRequestLog()
    expect(log).toHaveLength(200)
    expect(log.at(-1)?.name).toBe('t249')
  })
})
