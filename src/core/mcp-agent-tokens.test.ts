/** story 26.9: per-agent bearer resolution + attributed log entries. */
import { afterEach, describe, expect, it } from 'vitest'
import { clearMcpRequestLog, mcpRequestLog, recordMcpRequest, resolveBearer } from './mcp-server'

afterEach(() => clearMcpRequestLog())

describe('resolveBearer', () => {
  const agents = { claude: 'aaa', codex: 'bbb' }
  it('install token = unattributed; agent tokens attribute; junk rejects', () => {
    expect(resolveBearer('Bearer install', 'install', agents)).toEqual({ agent: null })
    expect(resolveBearer('Bearer aaa', 'install', agents)).toEqual({ agent: 'claude' })
    expect(resolveBearer('Bearer bbb', 'install', agents)).toEqual({ agent: 'codex' })
    expect(resolveBearer('Bearer nope', 'install', agents)).toBe('reject')
    expect(resolveBearer('', 'install', {})).toBe('reject')
  })
})

describe('recordMcpRequest agent attribution', () => {
  it('stamps the agent on tool calls when given', () => {
    recordMcpRequest({ method: 'tools/call', params: { name: 'vault_search' } }, '2026-07-17T10:00:00Z', 'claude')
    recordMcpRequest({ method: 'tools/call', params: { name: 'work_list' } }, '2026-07-17T10:00:05Z')
    expect(mcpRequestLog()).toEqual([
      { at: '2026-07-17T10:00:00Z', kind: 'tool', name: 'vault_search', agent: 'claude' },
      { at: '2026-07-17T10:00:05Z', kind: 'tool', name: 'work_list' },
    ])
  })
})
