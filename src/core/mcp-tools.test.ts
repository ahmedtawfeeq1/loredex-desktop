/**
 * Tools are read live so the Settings list cannot drift. Proven against a fake
 * stdio MCP server so the test needs no network and no n8n install.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { probeStdioTools } from './mcp-tools'

/** A minimal MCP server: answers initialize + tools/list over stdio. */
function fakeServer(): string {
  const dir = mkdtempSync(join(tmpdir(), 'loredex-fakemcp-'))
  const file = join(dir, 'server.mjs')
  writeFileSync(
    file,
    `let buf = ''
process.stdin.on('data', (d) => {
  buf += d
  let i
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
    if (!line) continue
    const m = JSON.parse(line)
    if (m.method === 'initialize') {
      write({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1' } } })
    } else if (m.method === 'tools/list') {
      write({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'alpha', inputSchema: { type: 'object' } }, { name: 'beta', inputSchema: { type: 'object' } }] } })
    } else if (m.id !== undefined) {
      write({ jsonrpc: '2.0', id: m.id, result: {} })
    }
  }
})
function write(o) { process.stdout.write(JSON.stringify(o) + '\\n') }
`,
  )
  return file
}

describe('probeStdioTools', () => {
  it('returns the tool names a server actually advertises', async () => {
    const res = await probeStdioTools(process.execPath, [fakeServer()], {})
    expect(res.ok).toBe(true)
    expect(res.tools).toEqual(['alpha', 'beta'])
  })

  it('fails cleanly when the command does not exist — never throws', async () => {
    const res = await probeStdioTools('/nonexistent/binary', [], {}, 3000)
    expect(res.ok).toBe(false)
    expect(res.tools).toEqual([])
    expect(res.detail).not.toBe('')
  })

  it('times out rather than hanging on a silent server', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'loredex-mute-'))
    const mute = join(dir, 'mute.mjs')
    writeFileSync(mute, 'setInterval(() => {}, 1000)')
    const res = await probeStdioTools(process.execPath, [mute], {}, 1500)
    expect(res.ok).toBe(false)
  }, 10_000)
})
