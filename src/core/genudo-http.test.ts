import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { genudoRpc } from './genudo-http'

let server: Server | null = null

function serve(
  handler: (body: Record<string, unknown>, req: { headers: Record<string, unknown> }) =>
    { status?: number; contentType?: string; body?: string; sessionId?: string },
): Promise<string> {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      let raw = ''
      req.on('data', (c) => {
        raw += c
      })
      req.on('end', () => {
        const out = handler(JSON.parse(raw || '{}'), { headers: req.headers })
        res.writeHead(out.status ?? 200, {
          'content-type': out.contentType ?? 'application/json',
          ...(out.sessionId ? { 'mcp-session-id': out.sessionId } : {}),
        })
        res.end(out.body ?? '')
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address()
      resolve(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`)
    })
  })
}

const toolResult = (payload: unknown, id: unknown): string =>
  JSON.stringify({
    jsonrpc: '2.0',
    id,
    result: { content: [{ type: 'text', text: JSON.stringify(payload) }] },
  })

afterEach(() => {
  server?.close()
  server = null
})

describe('genudoRpc', () => {
  it('POSTs to {BASE}/mcp with the bearer and parses a tool result', async () => {
    let seen: Record<string, unknown> = {}
    const base = await serve((body, req) => {
      seen = { ...body, auth: req.headers.authorization, accept: req.headers.accept }
      return { body: toolResult({ pipelines: [{ id: 1 }] }, body.id) }
    })
    const rpc = genudoRpc(base, 'tok')
    expect(await rpc.callTool('list_pipelines')).toEqual({ pipelines: [{ id: 1 }] })
    expect(seen.auth).toBe('Bearer tok')
    expect(String(seen.accept)).toContain('text/event-stream')
    expect(seen.method).toBe('tools/call')
  })

  it('tolerates a 204 with an empty body', async () => {
    const base = await serve(() => ({ status: 204 }))
    expect(await genudoRpc(base, 'tok').callTool('anything')).toBeNull()
  })

  it('parses an SSE-framed response body', async () => {
    const base = await serve((body) => ({
      contentType: 'text/event-stream',
      body: `event: message\ndata: ${toolResult({ ok: true }, body.id)}\n\n`,
    }))
    expect(await genudoRpc(base, 'tok').callTool('x')).toEqual({ ok: true })
  })

  it('echoes Mcp-Session-Id on subsequent requests', async () => {
    const seen: (string | undefined)[] = []
    const base = await serve((body, req) => {
      seen.push(req.headers['mcp-session-id'] as string | undefined)
      return { sessionId: 'sess-1', body: toolResult({ n: seen.length }, body.id) }
    })
    const rpc = genudoRpc(base, 'tok')
    await rpc.callTool('a')
    await rpc.callTool('b')
    expect(seen).toEqual([undefined, 'sess-1'])
  })

  it('surfaces a JSON-RPC error as a thrown Error', async () => {
    const base = await serve((body) => ({
      body: JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } }),
    }))
    await expect(genudoRpc(base, 'tok').callTool('ping')).rejects.toThrow(/Method not found/)
  })

  it('surfaces a 401 as an actionable Error', async () => {
    const base = await serve(() => ({ status: 401, body: '{"error":"unauthorized"}' }))
    await expect(genudoRpc(base, 'tok').callTool('x')).rejects.toThrow(/401/)
  })

  // Review finding (2026-07-29, final branch review): a TOOL-level failure —
  // MCP's `isError: true` on an otherwise-200/success JSON-RPC response,
  // distinct from the `error` field surfaced above — used to be returned as
  // if it were a successful result. genudo-pull.ts's fetchBundles feeds this
  // straight into `stages?.stages ?? []`, so a failed `list_pipeline_stages`
  // silently became "zero stages" and writePlan then deleted that pipeline's
  // whole stages/ directory and wrote nothing back — silent data loss that
  // contradicts the module's own "never deletes anything it does not write"
  // promise.
  it('treats an isError tool result as a thrown Error carrying the text content', async () => {
    const base = await serve((body) => ({
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result: { isError: true, content: [{ type: 'text', text: 'pipeline 42 not found' }] },
      }),
    }))
    await expect(genudoRpc(base, 'tok').callTool('list_pipeline_stages')).rejects.toThrow(
      /pipeline 42 not found/,
    )
  })
})
